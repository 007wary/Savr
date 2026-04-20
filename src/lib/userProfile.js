import { supabase } from './supabase'
import * as Device from 'expo-device'
import Constants from 'expo-constants'
import AsyncStorage from '@react-native-async-storage/async-storage'

const LAST_ACTIVE_KEY = 'savr_last_active_sync'

export async function syncUserProfile(user) {
  try {
    if (!user?.id) return
    const now = new Date().toISOString()
    await supabase.from('user_profiles').upsert({
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
      app_version: Constants.expoConfig?.version || '1.0',
      device_model: Device.modelName || null,
      android_version: String(Device.osVersion) || null,
      last_active: now,
      updated_at: now,
    }, { onConflict: 'id' })
  } catch {}
}

export async function updateUserProfile(userId, updates) {
  try {
    if (!userId) return { error: null }
    const now = new Date().toISOString()
    await supabase
      .from('user_profiles')
      .update({
        ...updates,
        last_active: now,
        updated_at: now,
      })
      .eq('id', userId)
    return { error: null }
  } catch {
    return { error: 'Unknown error' }
  }
}

export async function getUserProfile(userId) {
  try {
    if (!userId) return { data: null, error: null }
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

export async function updateLastActive(userId) {
  try {
    if (!userId) return
    const lastSync = await AsyncStorage.getItem(LAST_ACTIVE_KEY)
    if (lastSync && Date.now() - parseInt(lastSync) < 60 * 60 * 1000) return
    await AsyncStorage.setItem(LAST_ACTIVE_KEY, Date.now().toString())
    await supabase
      .from('user_profiles')
      .update({
        last_active: new Date().toISOString(),
        app_version: Constants.expoConfig?.version || '1.0',
      })
      .eq('id', userId)
  } catch {}
}