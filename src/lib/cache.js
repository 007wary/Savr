import AsyncStorage from '@react-native-async-storage/async-storage'

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
    const { data } = JSON.parse(raw)
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