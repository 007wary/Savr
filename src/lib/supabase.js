import 'react-native-url-polyfill/auto'
import { createClient } from '@supabase/supabase-js'
import { AppState } from 'react-native'
import * as SecureStore from 'expo-secure-store'
import Constants from 'expo-constants'

const extra = Constants.expoConfig?.extra ?? {}
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || extra.supabaseUrl
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || extra.supabaseAnonKey

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing Supabase URL/anon key: set EXPO_PUBLIC_SUPABASE_* in .env or app.json extra.supabaseUrl / extra.supabaseAnonKey.',
  )
}

export const SUPABASE_PROJECT_URL = supabaseUrl
export const SUPABASE_ANON_KEY = supabaseAnonKey

const isExpoGo = Constants.appOwnership === 'expo'

const CHUNK_SIZE = 1800

const SecureChunkStore = {
  getItem: async (key) => {
    try {
      // Try single value first (non-chunked)
      const single = await SecureStore.getItemAsync(key)
      if (single !== null) return single
    } catch {}
    try {
      // Try chunked
      const countStr = await SecureStore.getItemAsync(`${key}_chunks`)
      if (!countStr) return null
      const count = parseInt(countStr, 10)
      // Read all chunks in parallel. SecureStore reads are individually slow on
      // Android (encrypted keystore), and awaiting them one-by-one serialized
      // that cost on the session-restore path at startup — N round-trips became
      // one round-trip's latency. Order is preserved by index.
      const chunks = await Promise.all(
        Array.from({ length: count }, (_, i) => SecureStore.getItemAsync(`${key}_chunk_${i}`))
      )
      if (chunks.some((c) => c === null)) return null
      return chunks.join('')
    } catch {
      return null
    }
  },

  setItem: async (key, value) => {
    try {
      if (!value || value.length <= CHUNK_SIZE) {
        // Small enough — store directly, clean up any old chunks
        await SecureStore.setItemAsync(key, value)
        await SecureChunkStore._deleteChunks(key)
      } else {
        // Split into chunks
        const chunks = []
        for (let i = 0; i < value.length; i += CHUNK_SIZE) {
          chunks.push(value.slice(i, i + CHUNK_SIZE))
        }
        // Delete old single entry if any
        try { await SecureStore.deleteItemAsync(key) } catch {}
        // Write chunks
        for (let i = 0; i < chunks.length; i++) {
          await SecureStore.setItemAsync(`${key}_chunk_${i}`, chunks[i])
        }
        await SecureStore.setItemAsync(`${key}_chunks`, String(chunks.length))
      }
    } catch (e) {
      console.error('SecureChunkStore.setItem error:', e)
    }
  },

  removeItem: async (key) => {
    try { await SecureStore.deleteItemAsync(key) } catch {}
    await SecureChunkStore._deleteChunks(key)
  },

  _deleteChunks: async (key) => {
    try {
      const countStr = await SecureStore.getItemAsync(`${key}_chunks`)
      if (!countStr) return
      const count = parseInt(countStr, 10)
      for (let i = 0; i < count; i++) {
        try { await SecureStore.deleteItemAsync(`${key}_chunk_${i}`) } catch {}
      }
      try { await SecureStore.deleteItemAsync(`${key}_chunks`) } catch {}
    } catch {}
  },
}

const storage = isExpoGo ? {
  // Expo Go doesn't support SecureStore fully — use a memory fallback
  _mem: {},
  getItem(key) { return Promise.resolve(this._mem[key] ?? null) },
  setItem(key, value) { this._mem[key] = value; return Promise.resolve() },
  removeItem(key) { delete this._mem[key]; return Promise.resolve() },
} : SecureChunkStore

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
    // PKCE binds the OAuth callback to a code_verifier held only by this client, so a
    // forged/intercepted redirect can't be exchanged for a session without it — unlike
    // the implicit flow, where tokens ride in the redirect URL with no such binding.
    flowType: 'pkce',
  },
})

AppState.addEventListener('change', (state) => {
  if (state === 'active') {
    supabase.auth.startAutoRefresh()
  } else {
    supabase.auth.stopAutoRefresh()
  }
})