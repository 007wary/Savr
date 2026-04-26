import { supabase } from './supabase'

let cachedUser = null

export async function getUser(forceRefresh = false) {
  if (cachedUser && !forceRefresh) return cachedUser
  try {
    // Try network first
    const { data: { user } } = await supabase.auth.getUser()
    cachedUser = user
    return user
  } catch {
    // Offline — fall back to local session
    try {
      const { data: { session } } = await supabase.auth.getSession()
      cachedUser = session?.user ?? null
      return cachedUser
    } catch {
      return cachedUser // return whatever we have cached
    }
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
  } else if (event === 'USER_UPDATED' || event === 'TOKEN_REFRESHED') {
    cachedUser = null
  }
})
