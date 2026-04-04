import 'react-native-url-polyfill/auto'
import { createClient, processLock } from '@supabase/supabase-js'
import { AppState, Platform } from 'react-native'
import * as SecureStore from 'expo-secure-store'

const supabaseUrl = 'https://fsrbsqhlgfdqugixqtxc.supabase.co'
const supabaseAnonKey = 'sb_publishable_fTC_70PzCNPOs0_sNh1nEQ_Boj4EjqC'

// SecureStore has a 2048 byte limit per key
// So we split large values across multiple keys
const ExpoSecureStoreAdapter = {
  getItem: async (key) => {
    try {
      const value = await SecureStore.getItemAsync(key)
      return value
    } catch {
      return null
    }
  },
  setItem: async (key, value) => {
    try {
      await SecureStore.setItemAsync(key, value)
    } catch (e) {
      // If value too large for SecureStore fall back to splitting
      const chunkSize = 1800
      const chunks = Math.ceil(value.length / chunkSize)
      await SecureStore.setItemAsync(`${key}_chunks`, String(chunks))
      for (let i = 0; i < chunks; i++) {
        await SecureStore.setItemAsync(
          `${key}_${i}`,
          value.slice(i * chunkSize, (i + 1) * chunkSize)
        )
      }
    }
  },
  removeItem: async (key) => {
    try {
      await SecureStore.deleteItemAsync(key)
      // Also clean up any chunks
      const chunks = await SecureStore.getItemAsync(`${key}_chunks`)
      if (chunks) {
        const count = parseInt(chunks)
        for (let i = 0; i < count; i++) {
          await SecureStore.deleteItemAsync(`${key}_${i}`)
        }
        await SecureStore.deleteItemAsync(`${key}_chunks`)
      }
    } catch {}
  },
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: ExpoSecureStoreAdapter,
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