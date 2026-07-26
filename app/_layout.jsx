import { useEffect, useState, useRef } from 'react'
import { supabase } from '../src/lib/supabase'
import { View, AppState } from 'react-native'
import { StatusBar } from 'expo-status-bar'
import { ThemeProvider, useTheme } from '../src/lib/themeContext'
import { Stack, useRouter, useSegments } from 'expo-router'
import * as SplashScreen from 'expo-splash-screen'
import { GoogleSignin } from '@react-native-google-signin/google-signin'
import { processDueRecurring, processRecurringIncome } from '../src/lib/recurring'
import { clearAllCache, clearExpiredCache } from '../src/lib/cache'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { initializeDatabase, hasAnyLedgerEntries } from '../src/services/sqliteService'
import { backupOnAppOpen } from '../src/services/backgroundBackup'
import { cacheGoogleAccessToken, clearGoogleAccessToken } from '../src/lib/googleAccessToken'
import { Analytics, setUserId } from '../src/lib/analytics'
import crashlytics from '@react-native-firebase/crashlytics'
import { setCachedUser, getCachedUser, loadCachedUser } from '../src/lib/auth'
import { isSigningIn, subscribeSigningIn, setSigningIn } from '../src/lib/authState'
import { setOnboardingDone as setOnboardingDoneShared, subscribeOnboardingDone } from '../src/lib/onboardingState'
import * as NavigationBar from 'expo-navigation-bar'
import { ErrorBoundary } from '../src/components/ErrorBoundary'
import { logError } from '../src/lib/errorLog'
import { onFirstPaint } from '../src/lib/splashSignal'

SplashScreen.preventAutoHideAsync()

try {
  GoogleSignin.configure({
    webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
    offlineAccess: true,
    scopes: ['https://www.googleapis.com/auth/drive.file'],
  })
} catch (err) {
  // Module-eval time, before the ErrorBoundary/React tree exists — a failure
  // here previously vanished into console.error only, so a misconfigured
  // client ID or native-module issue was invisible in Crashlytics and the
  // user just saw the same generic "Sign In Failed" as every other failure
  // mode when they later tapped the button.
  console.error('GoogleSignin.configure failed', err)
  logError('GoogleSignin.configure', err)
}

const LAST_RECURRING_CHECK_KEY = 'savr_last_recurring_check'

function RootLayoutInner() {
  const { COLORS } = useTheme()
  const [session, setSession] = useState(undefined)
  const [onboardingDone, setOnboardingDone] = useState(undefined)
  const [transitioning, setTransitioning] = useState(false)
  const [watchdogTripped, setWatchdogTripped] = useState(false)
  const [navTick, setNavTick] = useState(0)
  const [signingIn, setSigningInState] = useState(isSigningIn())
  const recurringProcessedRef = useRef(false)
  const initialSessionLoadedRef = useRef(false)
  const signedOutRef = useRef(false)
  // Where a fresh SIGNED_IN should land: '/(tabs)/dashboard' normally, or
  // '/(tabs)/add' when the ledger check (below) finds this is a first-time
  // user with nothing logged yet. Read once by the redirect effect's
  // session+inAuth hop, then reset — it's a one-shot post-login landing
  // decision, not a standing route override. `postLoginCheckPendingRef` makes
  // the redirect effect wait for the (fast, local SQLite) check to resolve
  // instead of racing it and always landing on dashboard by default.
  const postLoginRouteRef = useRef(null)
  const postLoginCheckPendingRef = useRef(false)
  const router = useRouter()
  const segments = useSegments()

  // isSigningIn() is a plain module variable — subscribe so the redirect effect
  // below re-runs when it flips, instead of silently missing the SIGNED_IN
  // navigation because the flag changed without a re-render.
  useEffect(() => subscribeSigningIn(setSigningInState), [])

  // onboarding.jsx calls setOnboardingDoneShared() (not this component) when
  // the user finishes/skips onboarding, since it can't reach this component's
  // state directly. Subscribe so this state — and the redirect effect that
  // reads it — actually picks up the change, instead of staying stuck on the
  // stale `false` loaded at init and bouncing the user straight back to
  // /onboarding on the next segment change.
  useEffect(() => subscribeOnboardingDone((val) => {
    if (val !== null) setOnboardingDone(val)
  }), [])

  useEffect(() => {
    NavigationBar.setBackgroundColorAsync(COLORS.bg).catch(() => {})
    NavigationBar.setButtonStyleAsync(COLORS.text === '#FFFFFF' ? 'light' : 'dark').catch(() => {})
  }, [COLORS])

  useEffect(() => {
    const screen = segments.join('/')
    Analytics.screen(screen)
  }, [segments])

  // Route taps on local notifications to the right screen and record the open.
  // Handles both a warm app (listener) and a cold start where the tap launched
  // the app (getLastNotificationResponse).
  //
  // Navigation is NEVER performed directly here: on a cold start this effect can
  // run before the launch gate has resolved `session` and the navigator is
  // mounted, and pushing then can wedge navigation and freeze the app on a blank
  // screen. Instead we stash the target in `pendingNavRef` and let the effect
  // below perform it once the app is ready.
  const pendingNavRef = useRef(null)
  useEffect(() => {
    let sub
    let handledColdStart = false

    const handle = async (response) => {
      try {
        const { resolveNotificationTap } = await import('../src/lib/notifications')
        const { route, event } = resolveNotificationTap(response)
        if (event && Analytics[event]) Analytics[event]()
        if (route) {
          pendingNavRef.current = route
          setNavTick((n) => n + 1) // wake the drain effect
        }
      } catch {}
    }

    ;(async () => {
      try {
        const Notifications = await import('expo-notifications')
        // Cold start: the tap that launched the app.
        const last = await Notifications.getLastNotificationResponseAsync()
        if (last && !handledColdStart) {
          handledColdStart = true
          await handle(last)
        }
        // Warm start: taps while the app is running.
        sub = Notifications.addNotificationResponseReceivedListener(handle)
      } catch {}
    })()

    return () => { try { sub?.remove() } catch {} }
  }, [])

  // Drain a pending notification navigation, but only once the launch gate has
  // resolved (navigator mounted, no transition in flight). Runs whenever those
  // conditions or a new tap change.
  useEffect(() => {
    if (session === undefined || onboardingDone === undefined || transitioning) return
    const route = pendingNavRef.current
    if (!route) return
    pendingNavRef.current = null
    try { router.push(route) } catch {}
  }, [session, onboardingDone, transitioning, navTick, router])

  useEffect(() => {
    async function init() {
      clearExpiredCache().catch(() => {})

      // Check cached user immediately before anything else
      const [cachedUser, onboardingDoneRaw] = await Promise.all([
        loadCachedUser(),
        AsyncStorage.getItem('savr_onboarding_done'),
      ])
      const onboardingDoneVal = onboardingDoneRaw === 'true'
      setOnboardingDone(onboardingDoneVal)
      setOnboardingDoneShared(onboardingDoneVal)

      // Initialize database in parallel — don't block startup
      const dbReady = initializeDatabase().catch((e) =>
        initializeDatabase().catch((e2) => logError('initializeDatabase', e2 || e))
      )

      try {
        if (cachedUser) {
          // Instant startup — use cached user immediately
          initialSessionLoadedRef.current = true
          setCachedUser(cachedUser)
          setSession({ user: cachedUser, expires_at: 9999999999 })
          // Crashlytics identity is best-effort telemetry. Its first native call
          // also triggers lazy init of the Firebase SDK, which lands on the JS
          // thread in the exact window the dashboard is racing to first-paint —
          // measured as a multi-second splash stall on some cold launches. Defer
          // it well past first paint so it can never compete with initial render.
          setTimeout(() => {
            crashlytics().setUserId(cachedUser.id).catch(() => {})
            crashlytics().setAttribute('email', cachedUser.email || '').catch(() => {})
          }, 4000)

          // Verify and update real session in background. Guard against a
          // SIGNED_OUT racing in before this resolves — otherwise a stale
          // realSession from before the sign-out would silently revive a
          // logged-out user's session.
          supabase.auth.getSession().then(({ data: { session: realSession } }) => {
            if (realSession && !signedOutRef.current) {
              setCachedUser(realSession.user)
              setSession(realSession)
              const expiresAt = realSession.expires_at
              const now = Math.floor(Date.now() / 1000)
              if (expiresAt && expiresAt < now) {
                supabase.auth.refreshSession().then(({ data: refreshed, error }) => {
                  if (!error && refreshed.session && !signedOutRef.current) {
                    setCachedUser(refreshed.session.user)
                    setSession(refreshed.session)
                  }
                }).catch(() => {})
              }
            }
          }).catch(() => {})

          // Request FCM permission
          setTimeout(async () => {
            try {
              const { default: messaging } = await import('@react-native-firebase/messaging')
              const authStatus = await messaging().requestPermission()
              const enabled =
                authStatus === messaging.AuthorizationStatus.AUTHORIZED ||
                authStatus === messaging.AuthorizationStatus.PROVISIONAL
              if (enabled) {
                const fcmToken = await messaging().getToken()
                if (fcmToken) {
                  const user = getCachedUser()
if (user) {
  await supabase
    .from('user_profiles')
    .update({ fcm_token: fcmToken })
    .eq('id', user.id)
}
                }
              }
            } catch {}
          }, 9000)

          setTimeout(() => {
  import('../src/lib/userProfile').then(({ updateLastActive }) => {
    updateLastActive(cachedUser.id)
  }).catch(() => {})
}, 7000)

          setTimeout(async () => {
  try {
    await dbReady
    const d = new Date()
    const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    const lastCheck = await AsyncStorage.getItem(LAST_RECURRING_CHECK_KEY)
    if (lastCheck !== today && !recurringProcessedRef.current) {
      recurringProcessedRef.current = true
      await Promise.all([
        processDueRecurring(cachedUser.id).catch((e) => logError('processDueRecurring', e)),
        processRecurringIncome(cachedUser.id).catch((e) => logError('processRecurringIncome', e)),
      ])
      // Only mark today as checked once processing has actually run to completion,
      // so a crash/kill mid-run lets the app retry on next open instead of skipping
      // the rest of the day silently.
      await AsyncStorage.setItem(LAST_RECURRING_CHECK_KEY, today)
    }
  } catch (e) { logError('recurringCheck', e) }
}, 3500)

          setTimeout(() => {
  import('../src/lib/ads').then(({ initializeAds }) => initializeAds()).catch(() => {})
}, 5000)

setTimeout(() => {
  import('../src/lib/notifications').then(async ({ ensureAndroidChannel, scheduleStreakReminder }) => {
    // Channel must exist before anything schedules against it (streak reminder
    // here, budget alerts from the dashboard) or those notifications fall back
    // to the OS default channel.
    await ensureAndroidChannel()
    scheduleStreakReminder(0).catch(() => {})
  }).catch(() => {})
}, 6000)

          backupOnAppOpen()

        } else {
          // No cached user — wait for Supabase with timeout.
          // Do NOT block on dbReady here: the login-vs-dashboard decision (and
          // hiding the splash) doesn't need the database. Blocking on the full
          // SQLite init (WAL + migrations + table/index creation) just to reach
          // getSession() is what left fresh launches on a blank screen for
          // seconds. Callers that actually need the DB already await dbReady.
          const sessionPromise = supabase.auth.getSession()
          const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 2000))
          const { data: { session: cachedSession } } = await Promise.race([sessionPromise, timeoutPromise]).catch(() => ({ data: { session: null } }))

          // A SIGNED_IN event may have already landed while this race was in
          // flight (e.g. user completes Google sign-in within the timeout
          // window) — don't clobber that real session with a stale/null
          // result from a getSession() call that started before it.
          if (initialSessionLoadedRef.current) {
            // real session already landed via SIGNED_IN
          } else if (cachedSession) {
            initialSessionLoadedRef.current = true
            setCachedUser(cachedSession.user)
            setSession(cachedSession)
          } else {
            initialSessionLoadedRef.current = true
            setSession(null)
          }
        }
      } catch (e) {
        logError('rootLayoutInit', e)
        initialSessionLoadedRef.current = true
        setSession(null)
      }
    }

    init()

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      // A genuine SIGNED_IN must never be dropped even if the initial
      // session/cache check hasn't resolved yet — otherwise a sign-in that
      // races the app's cold-start init leaves the user stuck on login.
      if (!initialSessionLoadedRef.current && event !== 'SIGNED_IN') return

      setSession(session ?? null)

      if (event === 'SIGNED_IN') {
        initialSessionLoadedRef.current = true
        signedOutRef.current = false
        setTransitioning(true)
        // Clear here, in the same update that sets session, so the redirect
        // effect below always sees session and signingIn flip together.
        setSigningIn(false)
        if (session?.user) setCachedUser(session.user)
        if (session?.user?.id) {
          // Resolve where this sign-in should land before the redirect effect
          // acts on it — see postLoginCheckPendingRef.
          postLoginCheckPendingRef.current = true
          hasAnyLedgerEntries(session.user.id)
            .then((hasEntries) => {
              if (!hasEntries) postLoginRouteRef.current = '/(tabs)/add'
            })
            .catch(() => {})
            .finally(() => {
              postLoginCheckPendingRef.current = false
              setNavTick((n) => n + 1) // wake the redirect effect once resolved
            })
          setUserId(session.user.id).catch(() => {})
          // Defer Crashlytics identity off the first-paint window — its native
          // calls lazily init the Firebase SDK on the JS thread and were
          // measured stalling the launch. (Analytics.* / setUserId already gate
          // themselves behind first paint in analytics.js.)
          const uid = session.user.id
          const email = session.user.email || ''
          setTimeout(() => {
            crashlytics().setUserId(uid).catch(() => {})
            crashlytics().setAttribute('email', email).catch(() => {})
          }, 4000)
        }
        Analytics.login()
        // Supabase sets created_at and last_sign_in_at to (near enough) the
        // same instant only on the account's very first sign-in — every
        // later login moves last_sign_in_at forward while created_at stays
        // fixed. That's what separates a real signup from a routine login,
        // which a plain SIGNED_IN event can't tell apart on its own.
        const createdAt = session?.user?.created_at ? new Date(session.user.created_at).getTime() : null
        const lastSignInAt = session?.user?.last_sign_in_at ? new Date(session.user.last_sign_in_at).getTime() : null
        if (createdAt != null && lastSignInAt != null && Math.abs(lastSignInAt - createdAt) < 60000) {
          Analytics.signupCompleted()
        }

        // Set online status
setTimeout(async () => {
  try {
    if (session?.user?.id) {
  supabase.from('user_profiles').update({
    is_online: true,
    online_at: new Date().toISOString(),
  }).eq('id', session.user.id).then(() => {}).catch(() => {})
}
  } catch {}
}, 2000)

        setTimeout(async () => {
          try {
            if (session?.user) {
              if (!recurringProcessedRef.current) {
                recurringProcessedRef.current = true
                processDueRecurring(session.user.id)
                processRecurringIncome(session.user.id)
              }
              import('../src/lib/userProfile').then(({ syncUserProfile }) => {
                syncUserProfile(session.user)
              }).catch(() => {})
            }
            import('../src/lib/ads').then(({ initializeAds }) => initializeAds()).catch(() => {})
            import('../src/lib/notifications').then(({ scheduleStreakReminder }) => {
              scheduleStreakReminder(0).catch(() => {})
            }).catch(() => {})
          } catch {}
        }, 1000)

        // Cache provider token immediately for faster Drive access
        ;(async () => {
          try {
            const providerToken = session?.provider_token
            if (providerToken) await cacheGoogleAccessToken(providerToken)
          } catch {}
        })()
      }

      if (event === 'SIGNED_OUT') {
        signedOutRef.current = true
        const offlineUser = getCachedUser()
        Analytics.logout()
        await clearAllCache()
        // Set offline status
try {
  if (offlineUser) {
    supabase.from('user_profiles').update({ is_online: false }).eq('id', offlineUser.id).then(() => {}).catch(() => {})
  }
} catch {}
        Promise.allSettled([
  clearGoogleAccessToken(),
  AsyncStorage.removeItem('savr_notif_asked'),
  AsyncStorage.removeItem(LAST_RECURRING_CHECK_KEY),
  AsyncStorage.removeItem('savr_restore_offered'),
  AsyncStorage.removeItem('savr_last_backup'),
  AsyncStorage.removeItem('savr_is_up_to_date'),
  AsyncStorage.removeItem('savr_last_backup_hash'),
  AsyncStorage.removeItem('savr_reminder_suppressed_date'),
]).catch(() => {})
        import('../src/lib/notifications').then(({ cancelStreakReminder }) => cancelStreakReminder()).catch(() => {})
        recurringProcessedRef.current = false
        router.replace('/(auth)/login')
      }
    })

    const refreshInterval = setInterval(async () => {
      try {
        const { data: { session: currentSession } } = await supabase.auth.getSession()
        if (!currentSession) return

        const expiresAt = currentSession.expires_at
        const now = Math.floor(Date.now() / 1000)
        const fiveMinutes = 5 * 60

        if (expiresAt && expiresAt - now < fiveMinutes) {
          const { data, error } = await supabase.auth.refreshSession()
          if (error || !data.session || signedOutRef.current) {
            return
          } else {
            setSession(data.session)
          }
        }
      } catch {}
    }, 10 * 60 * 1000)

    const handleAppStateChange = async (nextAppState) => {
  try {
    const user = getCachedUser()
    if (user) {
      if (nextAppState === 'active') {
        supabase.from('user_profiles').update({
          is_online: true,
          online_at: new Date().toISOString(),
          last_active: new Date().toISOString(),
        }).eq('id', user.id).then(() => {}).catch(() => {})
      } else if (nextAppState === 'background' || nextAppState === 'inactive') {
        supabase.from('user_profiles').update({
          is_online: false,
        }).eq('id', user.id).then(() => {}).catch(() => {})
      }
    }
  } catch {}

  if (nextAppState !== 'active') return
  backupOnAppOpen()
}
    const appStateSub = AppState.addEventListener('change', handleAppStateChange)

    return () => {
      subscription.unsubscribe()
      clearInterval(refreshInterval)
      appStateSub.remove()
    }
  }, [router])

  useEffect(() => {
    if (session === undefined || onboardingDone === undefined) return

    const inOnboarding = segments[0] === 'onboarding'
    const inAuth = segments[0] === '(auth)'
    const inTabs = segments[0] === '(tabs)'
    // True only for the bare initial route (segments[0] is 'index' or
    // unresolved) — NOT "any segment that isn't onboarding/auth/tabs". Other
    // top-level screens (settings, recurring, backup, manage-data) are none
    // of onboarding/auth/tabs either, but they're legitimate destinations,
    // not the stray landing route. Conflating the two sent every navigation
    // to a top-level screen straight back to dashboard the instant it
    // mounted — a real regression, not a bounce race.
    const onBareIndex = !segments[0] || segments[0] === 'index'

    // Onboarding is a pre-auth value-prop pitch now, not a post-login extra:
    // it's shown once, before the first sign-in, then never again — signed-in
    // users always skip straight past it regardless of the flag. Logged-out
    // users who haven't seen it are sent to onboarding *before* login; login
    // itself always redirects onward via onboardingDone once it's set.
    if (!onboardingDone) {
      if (session) {
        // Already authenticated (e.g. cached session on a fresh install
        // that never ran onboarding) — don't block a real user behind a
        // pitch screen for a product they've already signed into.
        setOnboardingDone(true)
        return
      }
      if (!inOnboarding) {
        router.replace('/onboarding')
      }
      return
    }

    if (session && inTabs) {
      setTransitioning(false)
      return
    }
    if (!session && inOnboarding) return
    if (!session && inAuth) return
    if (!session && onBareIndex && !signingIn) {
      router.replace('/(auth)/login')
      return
    }
    if (session && inAuth && !signingIn) {
      // Wait for the first-time-user ledger check to resolve (it's a fast
      // local SQLite query) so a real first-time user doesn't get raced to
      // dashboard before postLoginRouteRef is set. The effect re-runs via
      // navTick once the check's .finally() fires.
      if (postLoginCheckPendingRef.current) return
      const landing = postLoginRouteRef.current || '/(tabs)/dashboard'
      postLoginRouteRef.current = null
      router.replace(landing)
      return
    }
    if (session && inOnboarding) {
      router.replace('/(tabs)/dashboard')
      return
    }
    // Landed on the bare index route with a session — send straight to
    // dashboard in one hop instead of index.jsx redirecting to login first
    // and this effect correcting it a beat later. That extra login
    // mount+unmount was pure waste on every cold launch for the common
    // case, landing squarely in the first-paint window.
    //
    // Gated on onBareIndex, NOT "any unmatched segment" — settings,
    // recurring, backup, and manage-data are also top-level screens that
    // match none of onboarding/auth/tabs, and are legitimate navigation
    // targets. The broader check sent every tap into one of those screens
    // straight back to dashboard the instant it mounted.
    if (session && onBareIndex) {
      router.replace('/(tabs)/dashboard')
      return
    }

    // Landed on the bare index route with no session — belongs on login.
    // Without this, index.jsx rendering blank (instead of its old hardcoded
    // Redirect to login) left this exact case with no navigation at all —
    // a permanently blank launch.
    if (!session && onBareIndex) {
      router.replace('/(auth)/login')
    }
  }, [session, segments, onboardingDone, signingIn, router, navTick])

  // Startup watchdog. The gate below renders a blank screen while session or
  // onboardingDone are still undefined, or while a post-login transition is in
  // flight. Every path that resolves those runs inside async init / auth
  // callbacks / navigation effects — if any of them hangs or a state flag is
  // left stuck (e.g. `transitioning` never cleared because navigation landed
  // somewhere unexpected), the app freezes on a blank screen forever. This
  // guarantees we always fall through to a rendered UI within a few seconds:
  // treat an unresolved session as logged-out, and force-clear a stuck
  // transition. Whatever the init/auth flow later resolves still applies.
  useEffect(() => {
    if (session !== undefined && onboardingDone !== undefined && !transitioning) return
    const t = setTimeout(() => {
      if (session === undefined) setSession(null)
      if (onboardingDone === undefined) setOnboardingDone(false)
      setTransitioning(false)
      setWatchdogTripped(true)
      logError('startupWatchdog', new Error('launch gate did not resolve in time'))
    }, 4000)
    return () => clearTimeout(t)
  }, [session, onboardingDone, transitioning])

  const gateOpen = (session === undefined || onboardingDone === undefined || transitioning) && !watchdogTripped

  // Keep the native splash up until the gate closes AND the first real screen
  // has actually painted, THEN hide it.
  //
  // Hiding the instant `gateOpen` flips false is too early: that state change and
  // this effect run on the same commit the <Stack> first mounts, but expo-router
  // still needs a frame or two to resolve the route and paint the child screen.
  // In that gap the splash is already gone and the mounted-but-empty Stack shows
  // its `contentStyle` background (COLORS.bg) — white in light mode, dark in dark
  // mode. THAT theme-colored empty frame is the launch flash.
  //
  // The guarantee: the entry screen (dashboard / login / onboarding) calls
  // signalFirstPaint() from its own onLayout, so we hide only once content has
  // actually laid out — not on a guessed delay. Whichever entry screen the gate
  // lands on is instrumented, so on every real launch the paint signal is what
  // fires. A long fallback timeout only exists so an un-instrumented route (or
  // an error screen) can never strand the splash up forever; it's deliberately
  // generous so real paint always wins first on a normal launch — a short/RAF
  // fallback would race the screen on a slow device and re-expose the flash.
  useEffect(() => {
    if (gateOpen) return
    let done = false
    const hide = () => {
      if (done) return
      done = true
      SplashScreen.hideAsync().catch(() => {})
    }
    const unsub = onFirstPaint(hide)
    const fallback = setTimeout(hide, 3000)
    return () => {
      unsub()
      clearTimeout(fallback)
    }
  }, [gateOpen])

  if (gateOpen) {
    // Match the native splash, which is always #0F0F0F (app.json's
    // expo-splash-screen has no `dark` variant — it's dark-only regardless
    // of device theme). The gate frame must stay hardcoded dark too, or a
    // light-theme device flashes white here between the dark native splash
    // and this frame. The native splash is still up here (we only hide it
    // once real UI mounts, in the effect below).
    return <View style={{ flex: 1, backgroundColor: '#0F0F0F' }} />
  }

  return (
    <>
      <StatusBar style={COLORS.text === '#FFFFFF' ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false, animation: 'none', contentStyle: { backgroundColor: COLORS.bg } }}>
      <Stack.Screen name="(auth)" options={{ animation: 'fade' }} />
      <Stack.Screen name="(tabs)" options={{ animation: 'fade' }} />
      <Stack.Screen name="index" />
      <Stack.Screen name="onboarding" options={{ animation: 'default' }} />
      <Stack.Screen name="recurring" options={{ animation: 'default' }} />
      <Stack.Screen name="backup" options={{ animation: 'default' }} />
      <Stack.Screen name="manage-data" options={{ animation: 'default' }} />
      <Stack.Screen name="settings" options={{ animation: 'default' }} />
    </Stack>
    </>
  )
}

export default function RootLayout() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <RootLayoutInner />
      </ThemeProvider>
    </ErrorBoundary>
  )
}