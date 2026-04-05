import AsyncStorage from '@react-native-async-storage/async-storage'
import { supabase } from './supabase'

const QUEUE_KEY = 'savr_offline_queue'
let isSyncing = false // Prevent duplicate syncs

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
  if (isSyncing) return // Prevent duplicate syncs
  try {
    const queue = await getQueue()
    if (queue.length === 0) return

    isSyncing = true

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const results = await Promise.all(
      queue.map(expense => {
        const { _queued, _id, isRecurring, frequency, next_due, ...data } = expense

        if (isRecurring) {
          return supabase.from('recurring_expenses').insert({
            user_id: user.id,
            amount: data.amount,
            category: data.category,
            note: data.note,
            frequency,
            next_due,
            is_active: true,
          })
        } else {
          return supabase.from('expenses').insert({
            user_id: user.id,
            ...data,
          })
        }
      })
    )

    const allSucceeded = results.every(r => !r.error)
    if (allSucceeded) await clearQueue()
  } catch {} finally {
    isSyncing = false
  }
}