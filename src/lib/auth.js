import { supabase } from './supabase'

let cachedUser = null

export async function getUser(forceRefresh = false) {
  if (cachedUser && !forceRefresh) return cachedUser
  try {
    const { data: { user } } = await supabase.auth.getUser()
    cachedUser = user
    return user
  } catch {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      cachedUser = session?.user ?? null
      return cachedUser
    } catch {
      return cachedUser
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
  } else if (event === 'USER_UPDATED' && session?.user) {
    cachedUser = session.user
  } else if (event === 'TOKEN_REFRESHED' && session?.user) {
    cachedUser = session.user
  }
})