import * as StoreReview from 'expo-store-review'
import AsyncStorage from '@react-native-async-storage/async-storage'

const COUNT_KEY = 'savr_tx_count_for_review'
const DONE_KEY = 'savr_review_done'
const TRIGGER_AT = 3

export async function checkAndRequestReview() {
  try {
    const done = await AsyncStorage.getItem(DONE_KEY)
    if (done) return

    const raw = await AsyncStorage.getItem(COUNT_KEY)
    const count = raw ? parseInt(raw, 10) : 0
    const newCount = count + 1

    await AsyncStorage.setItem(COUNT_KEY, String(newCount))

    if (newCount >= TRIGGER_AT) {
      const isAvailable = await StoreReview.isAvailableAsync()
      if (isAvailable) {
        await StoreReview.requestReview()
        await AsyncStorage.setItem(DONE_KEY, 'true')
      }
    }
  } catch {}
}