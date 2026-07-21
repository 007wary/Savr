import { supabase } from './supabase'
import * as Device from 'expo-device'
import Constants from 'expo-constants'
import * as Localization from 'expo-localization'
import messaging from '@react-native-firebase/messaging'

export async function syncUserProfile(user) {
  try {
    if (!user?.id) return

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
      android_version: Device.osVersion != null ? String(Device.osVersion) : null,
      timezone: Localization.getCalendars()[0]?.timeZone || null,
      country: Localization.getLocales()[0]?.regionCode || null,
      last_active: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'id' })

    // Save FCM token for push notifications. messaging().getToken() lazily
    // inits Firebase messaging on the JS thread; on a warm launch this runs via
    // a 1s timeout, inside the dashboard's first-paint window, and was measured
    // contributing to a multi-second splash stall. Hold it until first paint.
    try {
      const { afterFirstPaint } = await import('./splashSignal')
      await new Promise((resolve) => afterFirstPaint(resolve))
      const fcmToken = await messaging().getToken()
      if (fcmToken) {
        await supabase
          .from('user_profiles')
          .update({ fcm_token: fcmToken })
          .eq('id', user.id)
      }
    } catch {}

  } catch {}
}

export async function updateUserProfile(userId, updates) {
  try {
    if (!userId) return { error: null }
    const { error } = await supabase
      .from('user_profiles')
      .update({
        ...updates,
        last_active: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', userId)
    return { error }
  } catch (e) {
    return { error: e }
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

// Call this on every app open to keep last_active fresh
export async function updateLastActive(userId) {
  try {
    if (!userId) return
    await supabase
      .from('user_profiles')
      .update({
        last_active: new Date().toISOString(),
        app_version: Constants.expoConfig?.version || '1.0',
      })
      .eq('id', userId)
  } catch {}
}