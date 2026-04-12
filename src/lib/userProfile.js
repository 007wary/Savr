import { supabase } from './supabase'

export async function syncUserProfile(user) {
  try {
    if (!user?.id) return
    await supabase.from('user_profiles').upsert({
      id: user.id,
      email: user.email || '',
      full_name: user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split('@')[0] || '',
      avatar_url: user.user_metadata?.avatar_url || user.user_metadata?.picture || null,
      provider: user.app_metadata?.provider || 'google',
      updated_at: new Date().toISOString(),
    }, { onConflict: 'id' })
  } catch {}
}

export async function updateUserProfile(userId, updates) {
  try {
    if (!userId) return { error: null }
    await supabase.from('user_profiles').update({
      ...updates,
      updated_at: new Date().toISOString(),
    }).eq('id', userId)
    return { error: null }
  } catch {
    return { error: null }
  }
}

export async function getUserProfile(userId) {
  try {
    if (!userId) return { data: null, error: null }
    const { data, error } = await supabase.from('user_profiles').select('*').eq('id', userId).single()
    return { data, error }
  } catch {
    return { data: null, error: null }
  }
}