import { supabase } from './supabase'

let cachedUser = null

export async function getUser(forceRefresh = false) {
  if (cachedUser && !forceRefresh) return cachedUser
  const { data: { user } } = await supabase.auth.getUser()
  cachedUser = user
  return user
}

export function clearUserCache() {
  cachedUser = null
}

supabase.auth.onAuthStateChange((event) => {
  if (event === 'SIGNED_OUT' || event === 'USER_UPDATED' || event === 'TOKEN_REFRESHED') {
    cachedUser = null
  }
})
