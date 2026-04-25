import { useEffect, useState, useRef } from 'react'
import { supabase } from '../src/lib/supabase'
import { View } from 'react-native'
import { COLORS } from '../src/constants/theme'
import { Stack, useRouter, useSegments } from 'expo-router'
import * as SplashScreen from 'expo-splash-screen'
import * as Linking from 'expo-linking'
import { requestNotificationPermission } from '../src/lib/notifications'
import { processDueRecurring } from '../src/lib/recurring'
import { clearAllCache, clearExpiredCache } from '../src/lib/cache'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { initializeDatabase } from '../src/services/sqliteService'
import { registerBackupTask, unregisterBackupTask } from '../src/services/backgroundBackup'
import { Analytics, setUserId } from '../src/lib/analytics'

SplashScreen.preventAutoHideAsync()

const NOTIF_ASKED_KEY = 'savr_notif_asked'
const LAST_BACKUP_TRIGGER_KEY = 'savr_last_backup_trigger'

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
      initializeDatabase().catch(() => {})

      const done = await AsyncStorage.getItem('savr_onboarding_done')
      setOnboardingDone(done === 'true')

      try {
        const { data: { session: cachedSession } } = await supabase.auth.getSession()

        if (cachedSession?.user) {
          import('../src/lib/userProfile').then(({ updateLastActive }) => {
            updateLastActive(cachedSession.user.id)
          }).catch(() => {})
        }

        if (cachedSession) {
          const expiresAt = cachedSession.expires_at
          const now = Math.floor(Date.now() / 1000)
          if (expiresAt && expiresAt < now) {
            const { data: refreshed, error } = await supabase.auth.refreshSession()
            if (error || !refreshed.session) {
              await supabase.auth.signOut()
              await clearAllCache()
              initialSessionLoadedRef.current = true
              setSession(null)
              SplashScreen.hideAsync().catch(() => {})
              return
            }
            initialSessionLoadedRef.current = true
            setSession(refreshed.session)
          } else {
            initialSessionLoadedRef.current = true
            setSession(cachedSession)
          }

          SplashScreen.hideAsync().catch(() => {})

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

        // Re-read onboarding status before navigating
        const done = await AsyncStorage.getItem('savr_onboarding_done')
        if (done === 'true') {
          router.replace('/(tabs)/dashboard')
        }

        recurringProcessedRef.current = false

        setTimeout(async () => {
  try {
    const notifAsked = await AsyncStorage.getItem(NOTIF_ASKED_KEY)
    if (!notifAsked) {
      await AsyncStorage.setItem(NOTIF_ASKED_KEY, 'true')
      setTimeout(async () => {
        await requestNotificationPermission()
      }, 2000)
    }

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

        // Run immediately, no delay
;(async () => {
  try {
    const { backupToDrive, checkBackupExists } = await import('../src/services/driveBackupService')
    const AsyncStorageModule = (await import('@react-native-async-storage/async-storage')).default
    const { getExpenses } = await import('../src/services/sqliteService')

    const user = session?.user
    if (!user) return

    const localExpenses = await getExpenses(user.id)
    const hasLocalData = localExpenses.length > 0
    const restoreOffered = await AsyncStorageModule.getItem('savr_restore_offered')

    if (!hasLocalData && !restoreOffered) {
      const backupInfo = await checkBackupExists()
      if (backupInfo?.exists) {
        await AsyncStorageModule.setItem('savr_restore_offered', 'true')
        await AsyncStorageModule.setItem('savr_pending_restore', 'true')
      }
    } else {
      const lastTrigger = await AsyncStorageModule.getItem(LAST_BACKUP_TRIGGER_KEY)
      const today = new Date().toISOString().split('T')[0]
      if (lastTrigger !== today) {
        await AsyncStorageModule.setItem(LAST_BACKUP_TRIGGER_KEY, today)
        backupToDrive().catch(() => {})
      }
    }
  } catch {}
})()
      }

      if (event === 'SIGNED_OUT') {
        Analytics.logout()
        await clearAllCache()
        AsyncStorage.removeItem('savr_google_token').catch(() => {})
        AsyncStorage.removeItem(NOTIF_ASKED_KEY).catch(() => {})
        AsyncStorage.removeItem(LAST_BACKUP_TRIGGER_KEY).catch(() => {})
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
            await supabase.auth.signOut()
            await clearAllCache()
            setSession(null)
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

  // Always re-check AsyncStorage before redirecting away from onboarding
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
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(auth)" />
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="webview" />
      <Stack.Screen name="index" />
      <Stack.Screen name="onboarding" />
    </Stack>
  )
}