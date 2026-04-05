import AsyncStorage from '@react-native-async-storage/async-storage'
import { supabase } from './supabase'

const QUEUE_KEY = 'savr_offline_queue'

export async function addToQueue(expense) {
  try {
    const existing = await getQueue()
    const updated = [...existing, { ...expense, _queued: true, _id: Date.now().toString() }]
    await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(updated))
  } catch {}
}

export async function getQueue() {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

export async function clearQueue() {
  try {
    await AsyncStorage.removeItem(QUEUE_KEY)
  } catch {}
}

export async function syncQueue() {
  try {
    const queue = await getQueue()
    if (queue.length === 0) return

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const results = await Promise.all(
      queue.map(expense => {
        const { _queued, _id, ...data } = expense
        return supabase.from('expenses').insert({ ...data, user_id: user.id })
      })
    )

    const allSucceeded = results.every(r => !r.error)
    if (allSucceeded) await clearQueue()
  } catch {}
}