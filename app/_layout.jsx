import { useEffect, useState } from 'react'
import { Slot, useRouter, useSegments } from 'expo-router'
import { supabase } from '../src/lib/supabase'
import { View, ActivityIndicator } from 'react-native'
import { COLORS } from '../src/constants/theme'

export default function RootLayout() {
  const [session, setSession] = useState(undefined)
  const router = useRouter()
  const segments = useSegments()

  useEffect(() => {
    // undefined = still loading, null = no session, object = has session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session ?? null)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session ?? null)
    })

    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (session === undefined) return // still loading
    const inAuth = segments[0] === '(auth)'
    if (!session && !inAuth) router.replace('/(auth)/login')
    if (session && inAuth) router.replace('/(tabs)/dashboard')
  }, [session])

  // Show nothing while session is being loaded from SecureStore
  if (session === undefined) return (
    <View style={{ flex: 1, backgroundColor: COLORS.bg }} />
  )

  return <Slot />
}