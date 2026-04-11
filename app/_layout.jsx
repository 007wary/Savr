import { useEffect, useState } from 'react'
import { supabase } from '../src/lib/supabase'
import { View } from 'react-native'
import { COLORS } from '../src/constants/theme'
import { Stack, useRouter, useSegments } from 'expo-router'
import * as SplashScreen from 'expo-splash-screen'
import * as Linking from 'expo-linking'
import { requestNotificationPermission } from '../src/lib/notifications'
import { clearAllCache } from '../src/lib/cache'
import { processDueRecurring } from '../src/lib/recurring'

SplashScreen.preventAutoHideAsync()

export default function RootLayout() {
  const [session, setSession] = useState(undefined)
  const router = useRouter()
  const segments = useSegments()

  useEffect(() => {
    async function init() {
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
          setSession(cachedSession)
          SplashScreen.hideAsync()
          processDueRecurring(cachedSession.user.id)
          // Initialize ads after session is confirmed
          const { initializeAds } = await import('../src/lib/ads')
          initializeAds()
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
        await requestNotificationPermission()
        if (session?.user) {
          processDueRecurring(session.user.id)
        }
        // Initialize ads after sign in
        const { initializeAds } = await import('../src/lib/ads')
        initializeAds()
        router.replace('/(tabs)/dashboard')
      }
      if (event === 'SIGNED_OUT') {
        await clearAllCache()
      }
    })

    const handleDeepLink = async (url) => {
      if (!url) return
      if (url.includes('access_token') || url.includes('confirmation')) {
        const { data } = await supabase.auth.getSessionFromUrl({ url })
        if (data?.session) {
          setSession(data.session)
        }
      }
    }

    Linking.getInitialURL().then(url => {
      if (url) handleDeepLink(url)
    })

    const linkSub = Linking.addEventListener('url', ({ url }) => {
      handleDeepLink(url)
    })

    return () => {
      subscription.unsubscribe()
      linkSub.remove()
    }
  }, [])

  useEffect(() => {
    if (session === undefined) return
    const inAuth = segments[0] === '(auth)'
    if (!session && !inAuth) router.replace('/(auth)/login')
    if (session && inAuth) router.replace('/(tabs)/dashboard')
  }, [session, segments])

  if (session === undefined) {
    return <View style={{ flex: 1, backgroundColor: COLORS.bg }} />
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(auth)" />
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="webview" />
      <Stack.Screen name="index" />
    </Stack>
  )
}