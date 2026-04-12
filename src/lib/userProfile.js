import { supabase } from './supabase'

export async function syncUserProfile(user) {
  try {
    if (!user) return

    const profile = {
      id: user.id,
      email: user.email,
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

    // Upsert — insert if not exists, update if exists
    const { error } = await supabase
      .from('user_profiles')
      .upsert(profile, { onConflict: 'id' })

    if (error) console.log('Profile sync error:', error.message)

  } catch (err) {
    // Silently fail
  }
}

export async function updateUserProfile(userId, updates) {
  try {
    const { error } = await supabase
      .from('user_profiles')
      .update({
        ...updates,
        updated_at: new Date().toISOString(),
      })
      .eq('id', userId)

    return { error }
  } catch {
    return { error: 'Failed to update profile' }
  }
}

export async function getUserProfile(userId) {
  try {
    const { data, error } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('id', userId)
      .single()

    return { data, error }
  } catch {
    return { data: null, error: 'Failed to fetch profile' }
  }
}