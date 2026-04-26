import { supabase } from './supabase'
import AsyncStorage from '@react-native-async-storage/async-storage'

let cachedUser = null

const SUPABASE_SESSION_KEY = 'sb-fsrbsqhlgfdqugixqtxc-auth-token'

async function getUserFromStorage() {
  try {
    const raw = await AsyncStorage.getItem(SUPABASE_SESSION_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    const session = parsed?.currentSession || parsed
    return session?.user ?? null
  } catch {
    return null
  }
}

export function setCachedUser(user) {
  cachedUser = user
}

export async function getUser(forceRefresh = false) {
  if (cachedUser && !forceRefresh) return cachedUser
  try {
    const { data: { user } } = await supabase.auth.getUser()
    cachedUser = user
    return user
  } catch {
    const user = await getUserFromStorage()
    if (user) cachedUser = user
    return cachedUser
  }
}

export function clearUserCache() {
  cachedUser = null
}

supabase.auth.onAuthStateChange((event, session) => {
  if (event === 'SIGNED_OUT') {
    cachedUser = null
  } else if (event === 'SIGNED_IN' && session?.user) {
    cachedUser = session.user
  } else if (event === 'USER_UPDATED' && session?.user) {
    cachedUser = session.user
  } else if (event === 'TOKEN_REFRESHED' && session?.user) {
    cachedUser = session.user
  }
})