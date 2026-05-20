import { useEffect, useState, useRef } from 'react'
import { supabase } from '../src/lib/supabase'
import { View, AppState } from 'react-native'
import { COLORS } from '../src/constants/theme'
import { Stack, useRouter, useSegments } from 'expo-router'
import * as SplashScreen from 'expo-splash-screen'
import * as Linking from 'expo-linking'
import { processDueRecurring, processRecurringIncome } from '../src/lib/recurring'
import { clearAllCache, clearExpiredCache } from '../src/lib/cache'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { initializeDatabase } from '../src/services/sqliteService'
import { backupOnAppOpen } from '../src/services/backgroundBackup'
import { cacheGoogleAccessToken, clearGoogleAccessToken } from '../src/lib/googleAccessToken'
import { Analytics, setUserId } from '../src/lib/analytics'
import crashlytics from '@react-native-firebase/crashlytics'
import { setCachedUser, getCachedUser, loadCachedUser } from '../src/lib/auth'
import { isSigningIn } from '../src/lib/authState'

SplashScreen.preventAutoHideAsync()

const LAST_RECURRING_CHECK_KEY = 'savr_last_recurring_check'

export default function RootLayout() {
  const [session, setSession] = useState(undefined)
  const [onboardingDone, setOnboardingDone] = useState(undefined)
  const [transitioning, setTransitioning] = useState(false)
  const recurringProcessedRef = useRef(false)
  const initialSessionLoadedRef = useRef(false)
  const router = useRouter()
  const segments = useSegments()

  useEffect(() => {
    const screen = segments.join('/')
    Analytics.screen(screen)
  }, [segments])

  useEffect(() => {
    async function init() {
      clearExpiredCache().catch(() => {})

      // Check cached user immediately before anything else
      const cachedUser = await loadCachedUser()
      const onboardingDoneRaw = await AsyncStorage.getItem('savr_onboarding_done')
      setOnboardingDone(onboardingDoneRaw === 'true')

      // Initialize database in parallel — don't block startup
      const dbReady = initializeDatabase().catch(() => initializeDatabase().catch(() => {}))

      try {
        if (cachedUser) {
          // Instant startup — use cached user immediately
          initialSessionLoadedRef.current = true
          setCachedUser(cachedUser)
          setSession({ user: cachedUser, expires_at: 9999999999 })
          SplashScreen.hideAsync().catch(() => {})
          crashlytics().setUserId(cachedUser.id).catch(() => {})
          crashlytics().setAttribute('email', cachedUser.email || '').catch(() => {})

          // Verify and update real session in background
          supabase.auth.getSession().then(({ data: { session: realSession } }) => {
            if (realSession) {
              setCachedUser(realSession.user)
              setSession(realSession)
              const expiresAt = realSession.expires_at
              const now = Math.floor(Date.now() / 1000)
              if (expiresAt && expiresAt < now) {
                supabase.auth.refreshSession().then(({ data: refreshed, error }) => {
                  if (!error && refreshed.session) {
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
    if (lastCheck !== today) {
      await AsyncStorage.setItem(LAST_RECURRING_CHECK_KEY, today)
      if (!recurringProcessedRef.current) {
        recurringProcessedRef.current = true
        processDueRecurring(cachedUser.id).catch(() => {})
        processRecurringIncome(cachedUser.id).catch(() => {})
      }
    }
  } catch {}
}, 3500)

          setTimeout(() => {
  import('../src/lib/ads').then(({ initializeAds }) => initializeAds()).catch(() => {})
}, 5000)

setTimeout(() => {
  import('../src/lib/notifications').then(({ scheduleStreakReminder }) => {
    scheduleStreakReminder(0).catch(() => {})
  }).catch(() => {})
}, 6000)

        } else {
          // No cached user — wait for Supabase with timeout
          await dbReady
          const sessionPromise = supabase.auth.getSession()
          const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 3000))
          const { data: { session: cachedSession } } = await Promise.race([sessionPromise, timeoutPromise]).catch(() => ({ data: { session: null } }))

          if (cachedSession) {
            initialSessionLoadedRef.current = true
            setCachedUser(cachedSession.user)
            setSession(cachedSession)
            SplashScreen.hideAsync().catch(() => {})
          } else {
            initialSessionLoadedRef.current = true
            setSession(null)
            SplashScreen.hideAsync().catch(() => {})
          }
        }
      } catch {
        initialSessionLoadedRef.current = true
        setSession(null)
        SplashScreen.hideAsync().catch(() => {})
      }
    }

    init()

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!initialSessionLoadedRef.current) return

      setSession(session ?? null)

      if (event === 'SIGNED_IN') {
        setTransitioning(true)
        if (session?.user) setCachedUser(session.user)
        if (session?.user?.id) {
          setUserId(session.user.id).catch(() => {})
          crashlytics().setUserId(session.user.id).catch(() => {})
          crashlytics().setAttribute('email', session.user.email || '').catch(() => {})
        }
        Analytics.login()

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
          if (error || !data.session) {
            return
          } else {
            setSession(data.session)
          }
        }
      } catch {}
    }, 10 * 60 * 1000)

    const handleDeepLink = async (url) => {
      if (!url) return
      if (url.includes('access_token') || url.includes('confirmation')) {
        const { data } = await supabase.auth.getSessionFromUrl({ url })
        if (data?.session) setSession(data.session)
      }
    }

    Linking.getInitialURL().then(url => { if (url) handleDeepLink(url) })
    const linkSub = Linking.addEventListener('url', ({ url }) => { handleDeepLink(url) })

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
  backupOnAppOpen().catch(() => {})
}
    const appStateSub = AppState.addEventListener('change', handleAppStateChange)

    return () => {
      subscription.unsubscribe()
      linkSub.remove()
      clearInterval(refreshInterval)
      appStateSub.remove()
    }
  }, [])

  useEffect(() => {
    if (session === undefined || onboardingDone === undefined) return

    const inOnboarding = segments[0] === 'onboarding'
    const inAuth = segments[0] === '(auth)'
    const inTabs = segments[0] === '(tabs)'

    if (!onboardingDone && !inOnboarding && session && !isSigningIn()) {
      AsyncStorage.getItem('savr_onboarding_done').then(done => {
        if (done === 'true') {
          setOnboardingDone(true)
        } else {
            setTransitioning(false)
            router.replace('/onboarding')
          }
        }).catch(() => { setTransitioning(false); router.replace('/onboarding') })
      return
    }

    if (onboardingDone) {
      if (session && inTabs) return
      if (!session && inAuth) return
      if (!session && !inAuth && !inOnboarding && !isSigningIn()) {
        router.replace('/(auth)/login')
        return
      }
      if (session && inAuth && !isSigningIn()) {
  setTransitioning(false)
  router.replace('/(tabs)/dashboard')
  return
}
    }
  }, [session, segments, onboardingDone])

  if (session === undefined || onboardingDone === undefined || transitioning) {
    return <View style={{ flex: 1, backgroundColor: COLORS.bg }} />
  }

  return (
    <Stack screenOptions={{ headerShown: false, animation: 'none', contentStyle: { backgroundColor: COLORS.bg } }}>
      <Stack.Screen name="(auth)" options={{ animation: 'fade' }} />
      <Stack.Screen name="(tabs)" options={{ animation: 'fade' }} />
      <Stack.Screen name="webview" options={{ animation: 'default' }} />
      <Stack.Screen name="index" />
      <Stack.Screen name="onboarding" options={{ animation: 'default' }} />
      <Stack.Screen name="recurring" options={{ animation: 'default' }} />
      <Stack.Screen name="backup" options={{ animation: 'default' }} />
      <Stack.Screen name="manage-data" options={{ animation: 'default' }} />
      <Stack.Screen name="settings" options={{ animation: 'default' }} />
    </Stack>
  )
}