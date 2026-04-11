import AsyncStorage from '@react-native-async-storage/async-storage'

// Cache expiry times in milliseconds
const CACHE_EXPIRY = {
  // Dashboard and history — 30 minutes
  'savr_cache_dashboard': 30 * 60 * 1000,
  'savr_cache_history': 30 * 60 * 1000,
  // Budgets — 30 minutes
  'savr_cache_budgets': 30 * 60 * 1000,
  // Reports — 60 minutes (less volatile)
  'savr_cache_reports': 60 * 60 * 1000,
  // Settings — 24 hours (very stable)
  'savr_cache_settings': 24 * 60 * 60 * 1000,
  // Default — 30 minutes
  'default': 30 * 60 * 1000,
}

function getExpiry(key) {
  // Match key prefix to get expiry time
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
      version: 1,
    }
    await AsyncStorage.setItem(key, JSON.stringify(payload))
  } catch {
    // silently fail
  }
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
        // Cache expired — delete it and return null
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

// Clear all expired cache entries — call on app start
export async function clearExpiredCache() {
  try {
    const keys = await AsyncStorage.getAllKeys()
    const cacheKeys = keys.filter(k => k.startsWith('savr_cache_'))
    const expiredKeys = []

    for (const key of cacheKeys) {
      const raw = await AsyncStorage.getItem(key)
      if (!raw) continue
      const { timestamp } = JSON.parse(raw)
      const expiry = getExpiry(key)
      const age = Date.now() - (timestamp || 0)
      if (age > expiry) expiredKeys.push(key)
    }

    if (expiredKeys.length > 0) {
      await AsyncStorage.multiRemove(expiredKeys)
    }
  } catch {}
}

// Get cache age in minutes — useful for debugging
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