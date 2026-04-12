import { supabase } from './supabase'

export async function syncUserProfile(user) {
  try {
    if (!user) return
    if (!user.id) return

    const profile = {
      id: user.id,
      email: user.email || '',
      full_name:
        user.user_metadata?.full_name ||
        user.user_metadata?.name ||
        user.email?.split('@')[0] ||
        '',
      avatar_url:
        user.user_metadata?.avatar_url ||
        user.user_metadata?.picture ||
        null,
      provider: user.app_metadata?.provider || 'google',
      updated_at: new Date().toISOString(),
    }

    await supabase
      .from('user_profiles')
      .upsert(profile, { onConflict: 'id' })

  } catch {
    // Silently fail
  }
}

export async function updateUserProfile(userId, updates) {
  try {
    if (!userId) return { error: 'No user ID' }
    const { error } = await supabase
      .from('user_profiles')
      .update({
        ...updates,
        updated_at: new Date().toISOString(),
      })
      .eq('id', userId)
    return { error }
  } catch {
    return { error: null }
  }
}

export async function getUserProfile(userId) {
  try {
    if (!userId) return { data: null, error: 'No user ID' }
    const { data, error } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('id', userId)
      .single()
    return { data, error }
  } catch {
    return { data: null, error: null }
  }
}