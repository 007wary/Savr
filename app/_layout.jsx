import { useEffect, useState } from 'react'
import { supabase } from '../src/lib/supabase'
import { View } from 'react-native'
import { COLORS } from '../src/constants/theme'
import { Stack, useRouter, useSegments } from 'expo-router'
import * as SplashScreen from 'expo-splash-screen'
import * as Linking from 'expo-linking'
import { requestNotificationPermission } from '../src/lib/notifications'

SplashScreen.preventAutoHideAsync()

export default function RootLayout() {
  const [session, setSession] = useState(undefined)
  const router = useRouter()
  const segments = useSegments()

  useEffect(() => {
    // Timeout fallback — if session check takes too long, default to logged out
    const timeout = setTimeout(() => {
      if (session === undefined) {
        setSession(null)
        SplashScreen.hideAsync()
      }
    }, 5000)

    supabase.auth.getSession().then(({ data: { session } }) => {
      clearTimeout(timeout)
      setSession(session ?? null)
      SplashScreen.hideAsync()
    }).catch(() => {
      clearTimeout(timeout)
      setSession(null)
      SplashScreen.hideAsync()
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      setSession(session ?? null)
      if (event === 'SIGNED_IN') {
        // Request notification permission for new users
        await requestNotificationPermission()
        router.replace('/(tabs)/dashboard')
      }
    })

    // Handle deep link when app opens from email confirmation
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
      clearTimeout(timeout)
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