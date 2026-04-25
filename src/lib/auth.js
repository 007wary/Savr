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

supabase.auth.onAuthStateChange((event, session) => {
  if (event === 'SIGNED_OUT') {
    cachedUser = null
  } else if (event === 'SIGNED_IN' && session?.user) {
    cachedUser = session.user
  } else if (event === 'USER_UPDATED' || event === 'TOKEN_REFRESHED') {
    cachedUser = null
  }
})
