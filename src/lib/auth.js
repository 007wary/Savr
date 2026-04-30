import { supabase } from './supabase'
import AsyncStorage from '@react-native-async-storage/async-storage'

let cachedUser = null
const CACHED_USER_KEY = 'savr_cached_user'
const SUPABASE_SESSION_KEY = 'sb-fsrbsqhlgfdqugixqtxc-auth-token'

async function getUserFromStorage() {
  try {
    let raw = await AsyncStorage.getItem(SUPABASE_SESSION_KEY)
    if (!raw) {
      try {
        const SecureStore = await import('expo-secure-store')
        raw = await SecureStore.getItemAsync(SUPABASE_SESSION_KEY)
      } catch {}
    }
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
  if (user) {
    AsyncStorage.setItem(CACHED_USER_KEY, JSON.stringify(user)).catch(() => {})
  } else {
    AsyncStorage.removeItem(CACHED_USER_KEY).catch(() => {})
  }
}

export function getCachedUser() {
  return cachedUser
}

export async function loadCachedUser() {
  if (cachedUser) return cachedUser
  try {
    const raw = await AsyncStorage.getItem(CACHED_USER_KEY)
    if (raw) {
      cachedUser = JSON.parse(raw)
      return cachedUser
    }
  } catch {}
  // Fallback to Supabase session storage
  const user = await getUserFromStorage()
  if (user) cachedUser = user
  return cachedUser
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
  AsyncStorage.removeItem(CACHED_USER_KEY).catch(() => {})
}

supabase.auth.onAuthStateChange((event, session) => {
  if (event === 'SIGNED_OUT') {
    cachedUser = null
    AsyncStorage.removeItem(CACHED_USER_KEY).catch(() => {})
  } else if (event === 'SIGNED_IN' && session?.user) {
    cachedUser = session.user
    AsyncStorage.setItem(CACHED_USER_KEY, JSON.stringify(session.user)).catch(() => {})
  } else if (event === 'USER_UPDATED' && session?.user) {
    cachedUser = session.user
    AsyncStorage.setItem(CACHED_USER_KEY, JSON.stringify(session.user)).catch(() => {})
  } else if (event === 'TOKEN_REFRESHED' && session?.user) {
    cachedUser = session.user
    AsyncStorage.setItem(CACHED_USER_KEY, JSON.stringify(session.user)).catch(() => {})
  }
})