import AsyncStorage from '@react-native-async-storage/async-storage'
import { createClient } from '@supabase/supabase-js'
import 'react-native-url-polyfill/auto'

const supabaseUrl = 'https://fsrbsqhlgfdqugixqtxc.supabase.co'
const supabaseAnonKey = 'sb_publishable_fTC_70PzCNPOs0_sNh1nEQ_Boj4EjqC'

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
    storageKey: 'supabase-auth',
  },
})