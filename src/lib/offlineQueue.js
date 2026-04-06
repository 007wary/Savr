import AsyncStorage from '@react-native-async-storage/async-storage'
import { supabase } from './supabase'
import { getUser } from './auth'

const QUEUE_KEY = 'savr_offline_queue'
let isSyncing = false

export async function addToQueue(item) {
  try {
    const existing = await getQueue()
    const updated = [...existing, { ...item, _id: Date.now().toString() }]
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
  if (isSyncing) return
  try {
    const queue = await getQueue()
    if (queue.length === 0) return

    isSyncing = true
    const user = await getUser()
    if (!user) return

    const results = await Promise.allSettled(
      queue.map(item => {
        const { _id, type, ...data } = item

        if (type === 'add_expense') {
          return supabase.from('expenses').insert({
            user_id: user.id,
            amount: data.amount,
            category: data.category,
            note: data.note,
            date: data.date,
          })
        }

        if (type === 'add_recurring') {
          return supabase.from('recurring_expenses').insert({
            user_id: user.id,
            amount: data.amount,
            category: data.category,
            note: data.note,
            frequency: data.frequency,
            next_due: data.next_due,
            is_active: true,
          })
        }

        if (type === 'edit_expense') {
          return supabase.from('expenses').update({
            amount: data.amount,
            category: data.category,
            note: data.note,
            date: data.date,
          }).eq('id', data.id)
        }

        if (type === 'delete_expense') {
          return supabase.from('expenses').delete().eq('id', data.id)
        }

        if (type === 'save_budget') {
          if (data.existing_id && !data.existing_id.toString().startsWith('offline_')) {
            return supabase.from('budgets')
              .update({ limit_amount: data.limit_amount })
              .eq('id', data.existing_id)
          } else {
            return supabase.from('budgets').insert({
              user_id: user.id,
              category: data.category,
              limit_amount: data.limit_amount,
              month: data.month,
            })
          }
        }

        if (type === 'delete_budget') {
          if (data.id?.toString().startsWith('offline_')) {
            return Promise.resolve({ error: null })
          }
          return supabase.from('budgets').delete().eq('id', data.id)
        }

        return Promise.resolve({ error: null })
      })
    )

    const failedItems = queue.filter((_, i) =>
      results[i].status === 'rejected' ||
      (results[i].value && results[i].value.error)
    )

    if (failedItems.length === 0) {
      await clearQueue()
    } else {
      await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(failedItems))
    }
  } catch {} finally {
    isSyncing = false
  }
}