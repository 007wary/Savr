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
import { clearCurrencyCache } from '../src/lib/currency'

SplashScreen.preventAutoHideAsync()

export default function RootLayout() {
  const [session, setSession] = useState(undefined)
  const [onboardingDone, setOnboardingDone] = useState(undefined)
  const recurringProcessedRef = useRef(false)
  const mountedRef = useRef(true)
  const router = useRouter()
  const segments = useSegments()

  useEffect(() => {
    if (!segments || segments.length === 0) return
    const screen = segments.join('/')
    Analytics.screen(screen)
  }, [segments])

  useEffect(() => {
    mountedRef.current = true

    async function init() {
      clearExpiredCache().catch(() => {})
      initializeDatabase().catch(() => {})

      const done = await AsyncStorage.getItem('savr_onboarding_done')
      if (mountedRef.current) setOnboardingDone(done === 'true')

      let sessionResolved = false

      const timeout = setTimeout(() => {
        if (!sessionResolved) {
          if (mountedRef.current) {
            setSession(null)
            SplashScreen.hideAsync().catch(() => {})
          }
        }
      }, 500)

      try {
        const { data: { session: cachedSession } } = await supabase.auth.getSession()

        if (cachedSession?.user) {
          import('../src/lib/userProfile').then(({ updateLastActive }) => {
            updateLastActive(cachedSession.user.id)
          }).catch(() => {})
        }

        sessionResolved = true
        clearTimeout(timeout)

        if (cachedSession) {
          const expiresAt = cachedSession.expires_at
          const now = Math.floor(Date.now() / 1000)
          if (expiresAt && expiresAt < now) {
            const { data: refreshed, error } = await supabase.auth.refreshSession()
            if (error || !refreshed.session) {
              await supabase.auth.signOut()
              await clearAllCache()
              if (mountedRef.current) {
                setSession(null)
                SplashScreen.hideAsync().catch(() => {})
              }
              return
            }
            if (mountedRef.current) setSession(refreshed.session)
          } else {
            if (mountedRef.current) setSession(cachedSession)
          }
          SplashScreen.hideAsync().catch(() => {})
          setTimeout(() => {
            import('../src/lib/ads').then(({ initializeAds }) => initializeAds()).catch(() => {})
          }, 2000)
        } else {
          if (mountedRef.current) {
            setSession(null)
            SplashScreen.hideAsync().catch(() => {})
          }
        }
      } catch {
        sessionResolved = true
        clearTimeout(timeout)
        if (mountedRef.current) {
          setSession(null)
          SplashScreen.hideAsync().catch(() => {})
        }
      }
    }

    init()

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (mountedRef.current) setSession(session ?? null)

      if (event === 'SIGNED_IN') {
        if (mountedRef.current) setOnboardingDone(true)
        if (session?.user?.id) {
          setUserId(session.user.id).catch(() => {})
        }
        Analytics.login()
        await AsyncStorage.setItem('savr_onboarding_done', 'true')

        setTimeout(() => {
          if (!mountedRef.current) return
          try {
            requestNotificationPermission()
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
        }, 3000)

        setTimeout(async () => {
          if (!mountedRef.current) return
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
              backupToDrive().catch(() => {})
            }
          } catch {}
        }, 5000)
      }

      if (event === 'SIGNED_OUT') {
        Analytics.logout()
        await clearAllCache()
        AsyncStorage.removeItem('savr_google_token').catch(() => {})
        clearCurrencyCache()
        unregisterBackupTask().catch(() => {})
        if (mountedRef.current) router.replace('/(auth)/login')
      }

      if (event === 'TOKEN_REFRESHED') {
        if (mountedRef.current) setSession(session)
      }

      if (event === 'USER_UPDATED') {
        if (mountedRef.current) setSession(session)
      }
    })

    const handleDeepLink = async (url) => {
      if (!url) return
      if (url.includes('access_token') || url.includes('confirmation')) {
        const { data } = await supabase.auth.getSessionFromUrl({ url })
        if (data?.session && mountedRef.current) setSession(data.session)
      }
    }

    Linking.getInitialURL().then(url => { if (url) handleDeepLink(url) })
    const linkSub = Linking.addEventListener('url', ({ url }) => { handleDeepLink(url) })

    return () => {
      mountedRef.current = false
      subscription.unsubscribe()
      linkSub.remove()
    }
  }, [])

  useEffect(() => {
    if (onboardingDone) return
    async function checkOnboarding() {
      const done = await AsyncStorage.getItem('savr_onboarding_done')
      if (done === 'true' && mountedRef.current) {
        setOnboardingDone(true)
      }
    }
    checkOnboarding()
  }, [segments, onboardingDone])

  useEffect(() => {
    if (session === undefined || onboardingDone === undefined) return
    const inOnboarding = segments[0] === 'onboarding'
    const inAuth = segments[0] === '(auth)'
    const inTabs = segments[0] === '(tabs)'

    if (session) {
      if (inTabs) return
      router.replace('/(tabs)/dashboard')
      return
    }

    if (!onboardingDone && !inOnboarding) {
      router.replace('/onboarding')
      return
    }

    if (onboardingDone && !inAuth) {
      router.replace('/(auth)/login')
      return
    }
  }, [session, segments, onboardingDone])

  if (session === undefined) {
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