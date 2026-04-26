import 'react-native-url-polyfill/auto'
import { createClient } from '@supabase/supabase-js'
import { AppState } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import * as SecureStore from 'expo-secure-store'
import Constants from 'expo-constants'

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://fsrbsqhlgfdqugixqtxc.supabase.co'
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable_fTC_70PzCNPOs0_sNh1nEQ_Boj4EjqC'

const isExpoGo = Constants.appOwnership === 'expo'

// SecureStore has 2048 byte limit — Supabase session tokens exceed this
// Route large values to AsyncStorage, small sensitive keys to SecureStore
const LARGE_KEYS = ['supabase.auth.token', 'sb-', 'supabase']

const storage = isExpoGo ? AsyncStorage : {
  getItem: async (key) => {
    try {
      // For large session keys — read from AsyncStorage directly
      if (LARGE_KEYS.some(k => key.includes(k))) {
        const val = await AsyncStorage.getItem(key)
        if (val) return val
      }
      // For small keys — try SecureStore first
      const secureVal = await SecureStore.getItemAsync(key)
      if (secureVal) return secureVal
      // Fall back to AsyncStorage
      return await AsyncStorage.getItem(key)
    } catch {
      try {
        return await AsyncStorage.getItem(key)
      } catch {
        return null
      }
    }
  },
  setItem: async (key, value) => {
    try {
      // Route large values to AsyncStorage to avoid SecureStore 2048 byte limit
      if (value && value.length > 1800) {
        await AsyncStorage.setItem(key, value)
      } else {
        await SecureStore.setItemAsync(key, value)
      }
    } catch {
      try {
        await AsyncStorage.setItem(key, value)
      } catch {}
    }
  },
  removeItem: async (key) => {
    try {
      await SecureStore.deleteItemAsync(key)
    } catch {}
    try {
      await AsyncStorage.removeItem(key)
    } catch {}
  },
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
})

AppState.addEventListener('change', (state) => {
  if (state === 'active') {
    supabase.auth.startAutoRefresh()
  } else {
    supabase.auth.stopAutoRefresh()
  }
})