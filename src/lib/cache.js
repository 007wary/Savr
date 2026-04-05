import AsyncStorage from '@react-native-async-storage/async-storage'

const CACHE_EXPIRY = 1000 * 60 * 60 // 1 hour

export async function saveCache(key, data) {
  try {
    const payload = {
      data,
      timestamp: Date.now(),
    }
    await AsyncStorage.setItem(key, JSON.stringify(payload))
  } catch {
    // silently fail
  }
}

export async function loadCache(key) {
  try {
    const raw = await AsyncStorage.getItem(key)
    if (!raw) return null
    const { data, timestamp } = JSON.parse(raw)
    const isExpired = Date.now() - timestamp > CACHE_EXPIRY
    if (isExpired) return null
    return data
  } catch {
    return null
  }
}

export async function clearCache(key) {
  try {
    await AsyncStorage.removeItem(key)
  } catch {}
}

export async function clearAllCache() {
  try {
    const keys = await AsyncStorage.getAllKeys()
    const cacheKeys = keys.filter(k => k.startsWith('savr_cache_'))
    await AsyncStorage.multiRemove(cacheKeys)
  } catch {}
}