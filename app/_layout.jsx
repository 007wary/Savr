import { useEffect, useState, useRef } from 'react'
import { supabase } from '../src/lib/supabase'
import { View } from 'react-native'
import { COLORS } from '../src/constants/theme'
import { Stack, useRouter, useSegments } from 'expo-router'
import * as SplashScreen from 'expo-splash-screen'
import * as Linking from 'expo-linking'
import { processDueRecurring } from '../src/lib/recurring'
import { clearAllCache, clearExpiredCache } from '../src/lib/cache'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { initializeDatabase } from '../src/services/sqliteService'
import { registerBackupTask, unregisterBackupTask } from '../src/services/backgroundBackup'
import { Analytics, setUserId } from '../src/lib/analytics'
import { setCachedUser } from '../src/lib/auth'

SplashScreen.preventAutoHideAsync()

const LAST_BACKUP_TRIGGER_KEY = 'savr_last_backup_trigger'
const LAST_RECURRING_CHECK_KEY = 'savr_last_recurring_check'

export default function RootLayout() {
  const [session, setSession] = useState(undefined)
  const [onboardingDone, setOnboardingDone] = useState(undefined)
  const recurringProcessedRef = useRef(false)
  const initialSessionLoadedRef = useRef(false)
  const router = useRouter()
  const segments = useSegments()

  useEffect(() => {
    if (!segments || segments.length === 0) return
    const screen = segments.join('/')
    Analytics.screen(screen)
  }, [segments])

  useEffect(() => {
    AsyncStorage.getItem('savr_onboarding_done').then(done => {
      if (done === 'true' && !onboardingDone) {
        setOnboardingDone(true)
      }
    }).catch(() => {})
  }, [segments])

  useEffect(() => {
    async function init() {
  clearExpiredCache().catch(() => {})

  const [, done] = await Promise.all([
    initializeDatabase().catch(() => initializeDatabase().catch(() => {})),
    AsyncStorage.getItem('savr_onboarding_done'),
  ])
  setOnboardingDone(done === 'true')

  try {
    const { data: { session: cachedSession } } = await supabase.auth.getSession()

    if (cachedSession) {
      const expiresAt = cachedSession.expires_at
      const now = Math.floor(Date.now() / 1000)

      // Set session immediately — don't wait for token refresh
      initialSessionLoadedRef.current = true
      setCachedUser(cachedSession.user)
      setSession(cachedSession)
      SplashScreen.hideAsync().catch(() => {})

      // Refresh token in background — don't block UI
      if (expiresAt && expiresAt < now) {
        supabase.auth.refreshSession().then(({ data: refreshed, error }) => {
          if (!error && refreshed.session) {
            setCachedUser(refreshed.session.user)
            setSession(refreshed.session)
          }
        }).catch(() => {})
      }

      // One-time cleanup of orphaned recurring entries
setTimeout(async () => {
  try {
    const AsyncStorageModule = (await import('@react-native-async-storage/async-storage')).default
    const cleaned = await AsyncStorageModule.getItem('savr_recurring_cleaned_v1')
    if (cleaned) return
    const { getRecurring, getExpenses, deleteRecurring } = await import('../src/services/sqliteService')
    const user = getCachedUser()
    if (!user) return
    const [recurringItems, allExpenses] = await Promise.all([
      getRecurring(user.id),
      getExpenses(user.id),
    ])
    for (const item of recurringItems) {
      const hasExpense = allExpenses.some(e => e.recurring_id === item.id || (e.is_recurring && e.amount === item.amount && e.category === item.category))
      if (!hasExpense) {
        await deleteRecurring(item.id).catch(() => {})
      }
    }
    await AsyncStorageModule.setItem('savr_recurring_cleaned_v1', 'true')
  } catch {}
}, 3000)

      // Deferred tasks — run after UI is shown
      // Schedule daily 12 PM reminder
setTimeout(async () => {
  try {
    const { handleDailyReminderOnOpen } = await import('../src/lib/notifications')
    handleDailyReminderOnOpen().catch(() => {})
  } catch {}
}, 2000)
      setTimeout(() => {
        import('../src/lib/userProfile').then(({ updateLastActive }) => {
          updateLastActive(cachedSession.user.id)
        }).catch(() => {})
      }, 3000)

      setTimeout(async () => {
        try {
          const today = new Date().toISOString().split('T')[0]
          const lastCheck = await AsyncStorage.getItem(LAST_RECURRING_CHECK_KEY)
          if (lastCheck !== today) {
            await AsyncStorage.setItem(LAST_RECURRING_CHECK_KEY, today)
            processDueRecurring(cachedSession.user.id).catch(() => {})
          }
        } catch {}
      }, 2000)

      setTimeout(() => {
        import('../src/lib/ads').then(({ initializeAds }) => initializeAds()).catch(() => {})
      }, 2000)

    } else {
      initialSessionLoadedRef.current = true
      setSession(null)
      SplashScreen.hideAsync().catch(() => {})
    }
  } catch {
    initialSessionLoadedRef.current = true
    setSession(null)
    SplashScreen.hideAsync().catch(() => {})
  }
}

    init()

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!initialSessionLoadedRef.current && event !== 'SIGNED_OUT') return

      setSession(session ?? null)

      if (event === 'SIGNED_IN') {
        if (session?.user?.id) {
          setUserId(session.user.id).catch(() => {})
        }
        Analytics.login()

        recurringProcessedRef.current = false

        setTimeout(async () => {
          try {
            if (session?.user) {
              if (!recurringProcessedRef.current) {
                recurringProcessedRef.current = true
                processDueRecurring(session.user.id)
              }
              import('../src/lib/userProfile').then(({ syncUserProfile }) => {
                syncUserProfile(session.user)
              }).catch(() => {})
            }
            import('../src/lib/ads').then(({ initializeAds }) => initializeAds()).catch(() => {})
            registerBackupTask().catch(() => {})
          } catch {}
        }, 1000)

        // Cache provider token immediately for faster Drive access
        ;(async () => {
          try {
            const providerToken = session?.provider_token
            if (providerToken) {
              await AsyncStorage.setItem('savr_google_token', providerToken)
              await AsyncStorage.setItem('savr_google_token_time', Date.now().toString())
            }
          } catch {}
        })()

        // Daily auto backup with hash check
        ;(async () => {
          try {
            const today = new Date().toISOString().split('T')[0]
            const lastTrigger = await AsyncStorage.getItem(LAST_BACKUP_TRIGGER_KEY)
            if (lastTrigger === today) return
            const user = session?.user
            if (!user) return
            const { hasDataChanged, backupToDrive } = await import('../src/services/driveBackupService')
            const changed = await hasDataChanged(user.id)
            if (!changed) return
            await AsyncStorage.setItem(LAST_BACKUP_TRIGGER_KEY, today)
            backupToDrive().catch(() => {})
          } catch {}
        })()
      }

      if (event === 'SIGNED_OUT') {
        Analytics.logout()
        await clearAllCache()
        AsyncStorage.removeItem('savr_google_token').catch(() => {})
        AsyncStorage.removeItem('savr_notif_asked').catch(() => {})
        AsyncStorage.removeItem(LAST_BACKUP_TRIGGER_KEY).catch(() => {})
        AsyncStorage.removeItem(LAST_RECURRING_CHECK_KEY).catch(() => {})
        AsyncStorage.removeItem('savr_restore_offered').catch(() => {})
        AsyncStorage.removeItem('savr_last_backup').catch(() => {})
        AsyncStorage.removeItem('savr_last_backup_hash').catch(() => {})
        import('../src/lib/notifications').then(({ cancelDailyReminder }) => cancelDailyReminder()).catch(() => {})
        unregisterBackupTask().catch(() => {})
        recurringProcessedRef.current = false
        router.replace('/(auth)/login')
      }

      if (event === 'TOKEN_REFRESHED') {
        setSession(session)
      }

      if (event === 'USER_UPDATED') {
        setSession(session)
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

    return () => {
      subscription.unsubscribe()
      linkSub.remove()
      clearInterval(refreshInterval)
    }
  }, [])

  useEffect(() => {
    if (session === undefined || onboardingDone === undefined) return

    const inOnboarding = segments[0] === 'onboarding'
    const inAuth = segments[0] === '(auth)'
    const inTabs = segments[0] === '(tabs)'

    if (!onboardingDone && !inOnboarding) {
      AsyncStorage.getItem('savr_onboarding_done').then(done => {
        if (done === 'true') {
          setOnboardingDone(true)
        } else {
          router.replace('/onboarding')
        }
      }).catch(() => { router.replace('/onboarding') })
      return
    }

    if (onboardingDone) {
      if (session && inTabs) return
      if (!session && inAuth) return
      if (!session && !inAuth && !inOnboarding) {
        router.replace('/(auth)/login')
        return
      }
      if (session && inAuth) {
        router.replace('/(tabs)/dashboard')
        return
      }
    }
  }, [session, segments, onboardingDone])

  if (session === undefined || onboardingDone === undefined) {
    return <View style={{ flex: 1, backgroundColor: COLORS.bg }} />
  }

  return (
    <Stack screenOptions={{ headerShown: false, animation: 'none', contentStyle: { backgroundColor: COLORS.bg } }}>
      <Stack.Screen name="(auth)" />
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="webview" />
      <Stack.Screen name="index" />
      <Stack.Screen name="onboarding" />
      <Stack.Screen name="recurring" />
      <Stack.Screen name="backup" />
    </Stack>
  )
}