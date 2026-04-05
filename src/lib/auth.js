import { supabase } from './supabase'

let cachedUser = null

export async function getUser() {
  if (cachedUser) return cachedUser
  const { data: { user } } = await supabase.auth.getUser()
  cachedUser = user
  return user
}

export function clearUserCache() {
  cachedUser = null
}

// Clear cache on sign out
supabase.auth.onAuthStateChange((event) => {
  if (event === 'SIGNED_OUT') {
    cachedUser = null
  }
})