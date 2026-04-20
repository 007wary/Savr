import AsyncStorage from '@react-native-async-storage/async-storage'

const CACHE_EXPIRY = {
  'savr_cache_dashboard': 30 * 60 * 1000,
  'savr_cache_history': 30 * 60 * 1000,
  'savr_cache_budgets': 30 * 60 * 1000,
  'savr_cache_reports': 60 * 60 * 1000,
  'savr_cache_settings': 24 * 60 * 60 * 1000,
  'default': 30 * 60 * 1000,
}

function getExpiry(key) {
  for (const [prefix, expiry] of Object.entries(CACHE_EXPIRY)) {
    if (key.startsWith(prefix)) return expiry
  }
  return CACHE_EXPIRY.default
}

export async function saveCache(key, data) {
  try {
    const payload = {
      data,
      timestamp: Date.now(),
    }
    await AsyncStorage.setItem(key, JSON.stringify(payload))
  } catch {}
}

export async function loadCache(key, ignoreExpiry = false) {
  try {
    const raw = await AsyncStorage.getItem(key)
    if (!raw) return null

    const { data, timestamp } = JSON.parse(raw)

    if (!ignoreExpiry) {
      const expiry = getExpiry(key)
      const age = Date.now() - (timestamp || 0)
      if (age > expiry) {
        await AsyncStorage.removeItem(key)
        return null
      }
    }

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

export async function clearExpiredCache() {
  try {
    const keys = await AsyncStorage.getAllKeys()
    const cacheKeys = keys.filter(k => k.startsWith('savr_cache_'))
    if (cacheKeys.length === 0) return
    const pairs = await AsyncStorage.multiGet(cacheKeys)
    const expiredKeys = []
    for (const [key, raw] of pairs) {
      if (!raw) { expiredKeys.push(key); continue }
      try {
        const { timestamp } = JSON.parse(raw)
        const expiry = getExpiry(key)
        const age = Date.now() - (timestamp || 0)
        if (age > expiry) expiredKeys.push(key)
      } catch { expiredKeys.push(key) }
    }
    if (expiredKeys.length > 0) await AsyncStorage.multiRemove(expiredKeys)
  } catch {}
}

export async function getCacheAge(key) {
  try {
    const raw = await AsyncStorage.getItem(key)
    if (!raw) return null
    const { timestamp } = JSON.parse(raw)
    const ageMs = Date.now() - (timestamp || 0)
    return Math.floor(ageMs / 60000)
  } catch {
    return null
  }
}