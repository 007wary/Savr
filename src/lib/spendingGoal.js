import AsyncStorage from '@react-native-async-storage/async-storage'

const GOAL_KEY = 'savr_spending_goal'

export async function saveGoal(amount) {
  try {
    await AsyncStorage.setItem(GOAL_KEY, String(amount))
  } catch {}
}

export async function loadGoal() {
  try {
    const val = await AsyncStorage.getItem(GOAL_KEY)
    return val ? parseFloat(val) : null
  } catch {
    return null
  }
}

export async function clearGoal() {
  try {
    await AsyncStorage.removeItem(GOAL_KEY)
  } catch {}
}