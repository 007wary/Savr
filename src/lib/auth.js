import { supabase, SUPABASE_PROJECT_URL } from './supabase'
import AsyncStorage from '@react-native-async-storage/async-storage'

let cachedUser = null
const CACHED_USER_KEY = 'savr_cached_user'

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
  return null
}

export async function getUser(forceRefresh = false) {
  if (cachedUser && !forceRefresh) return cachedUser
  try {
    const { data: { user }, error } = await supabase.auth.getUser()
    if (error) throw error
    cachedUser = user
    return user
  } catch {
    return null
  }
}

export function clearUserCache() {
  cachedUser = null
  AsyncStorage.removeItem(CACHED_USER_KEY).catch(() => {})
}

// Intentional: this listener keeps cachedUser in sync independently of _layout.jsx
// Both listeners serve different purposes (cache vs navigation) — do not merge
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