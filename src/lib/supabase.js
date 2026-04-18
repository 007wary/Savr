import 'react-native-url-polyfill/auto'
import { createClient, processLock } from '@supabase/supabase-js'
import { AppState } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import * as SecureStore from 'expo-secure-store'
import Constants from 'expo-constants'

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://fsrbsqhlgfdqugixqtxc.supabase.co'
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable_fTC_70PzCNPOs0_sNh1nEQ_Boj4EjqC'

const isExpoGo = Constants.appOwnership === 'expo'

const storage = isExpoGo ? AsyncStorage : {
  getItem: async (key) => {
    try {
      return await SecureStore.getItemAsync(key)
    } catch {
      return await AsyncStorage.getItem(key)
    }
  },
  setItem: async (key, value) => {
    try {
      await SecureStore.setItemAsync(key, value)
    } catch {
      await AsyncStorage.setItem(key, value)
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
    lock: processLock,
  },
})

AppState.addEventListener('change', (state) => {
  if (state === 'active') {
    supabase.auth.startAutoRefresh()
  } else {
    supabase.auth.stopAutoRefresh()
  }
})
