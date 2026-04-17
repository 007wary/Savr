import { useEffect, useState } from 'react'
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

SplashScreen.preventAutoHideAsync()

export default function RootLayout() {
  const [session, setSession] = useState(undefined)
  const [onboardingDone, setOnboardingDone] = useState(undefined)
  const router = useRouter()
  const segments = useSegments()

  useEffect(() => {
    async function init() {
      clearExpiredCache().catch(() => {})
      initializeDatabase().catch(() => {})

      const done = await AsyncStorage.getItem('savr_onboarding_done')
      setOnboardingDone(done === 'true')

      const timeout = setTimeout(() => {
        if (session === undefined) {
          setSession(null)
          SplashScreen.hideAsync()
        }
      }, 2000)

      try {
        const { data: { session: cachedSession } } = await supabase.auth.getSession()
        if (cachedSession) {
          clearTimeout(timeout)

          const expiresAt = cachedSession.expires_at
          const now = Math.floor(Date.now() / 1000)
          if (expiresAt && expiresAt < now) {
            const { data: refreshed, error } = await supabase.auth.refreshSession()
            if (error || !refreshed.session) {
              await supabase.auth.signOut()
              await clearAllCache()
              setSession(null)
              SplashScreen.hideAsync()
              return
            }
            setSession(refreshed.session)
          } else {
            setSession(cachedSession)
          }

          SplashScreen.hideAsync()
          import('../src/lib/ads').then(({ initializeAds }) => initializeAds()).catch(() => {})
        } else {
          clearTimeout(timeout)
          setSession(null)
          SplashScreen.hideAsync()
        }
      } catch {
        clearTimeout(timeout)
        setSession(null)
        SplashScreen.hideAsync()
      }
    }

    init()

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      setSession(session ?? null)

      if (event === 'SIGNED_IN') {
        router.replace('/(tabs)/dashboard')

        try {
          requestNotificationPermission()
          if (session?.user) {
            processDueRecurring(session.user.id)
          }
          import('../src/lib/ads').then(({ initializeAds }) => initializeAds()).catch(() => {})

          // Auto backup / restore logic
          setTimeout(async () => {
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
        } catch {}
      }

      if (event === 'SIGNED_OUT') {
        await clearAllCache()
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
    async function checkOnboarding() {
      const done = await AsyncStorage.getItem('savr_onboarding_done')
      if (done === 'true' && !onboardingDone) {
        setOnboardingDone(true)
      }
    }
    checkOnboarding()
  }, [segments])

  useEffect(() => {
    if (session === undefined || onboardingDone === undefined) return

    const inOnboarding = segments[0] === 'onboarding'
    const inAuth = segments[0] === '(auth)'

    if (!onboardingDone && !inOnboarding) {
      router.replace('/onboarding')
      return
    }

    if (onboardingDone) {
      if (!session && !inAuth && !inOnboarding) {
        router.replace('/(auth)/login')
        return
      }
      if (session && inAuth) {
        router.replace('/(tabs)/dashboard')
        return
      }
      if (inOnboarding) {
        router.replace('/(auth)/login')
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