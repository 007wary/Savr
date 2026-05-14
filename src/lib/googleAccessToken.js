import AsyncStorage from '@react-native-async-storage/async-storage'
import * as SecureStore from 'expo-secure-store'

const SECURE_KEY = 'savr_google_access_token'
const LEGACY_ASYNC_KEY = 'savr_google_token'
const TIME_KEY = 'savr_google_token_time'

export async function getGoogleAccessToken() {
  try {
    const s = await SecureStore.getItemAsync(SECURE_KEY)
    if (s) return s
  } catch {}
  const legacy = await AsyncStorage.getItem(LEGACY_ASYNC_KEY)
  if (legacy) {
    try {
      await SecureStore.setItemAsync(SECURE_KEY, legacy)
      await AsyncStorage.removeItem(LEGACY_ASYNC_KEY)
    } catch {}
    return legacy
  }
  return null
}

export async function setGoogleAccessToken(token) {
  if (!token) return
  try {
    await SecureStore.setItemAsync(SECURE_KEY, token)
    await AsyncStorage.removeItem(LEGACY_ASYNC_KEY)
  } catch {
    await AsyncStorage.setItem(LEGACY_ASYNC_KEY, token)
  }
}

export async function setGoogleAccessTokenCachedAtNow() {
  await AsyncStorage.setItem(TIME_KEY, Date.now().toString())
}

export async function cacheGoogleAccessToken(token) {
  await setGoogleAccessToken(token)
  await setGoogleAccessTokenCachedAtNow()
}

export async function getGoogleAccessTokenCachedTime() {
  return AsyncStorage.getItem(TIME_KEY)
}

export async function clearGoogleAccessToken() {
  try {
    await SecureStore.deleteItemAsync(SECURE_KEY)
  } catch {}
  await AsyncStorage.multiRemove([LEGACY_ASYNC_KEY, TIME_KEY])
}
