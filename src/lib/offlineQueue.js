import AsyncStorage from '@react-native-async-storage/async-storage'
import { supabase } from './supabase'
import { getUser } from './auth'

const QUEUE_KEY = 'savr_offline_queue'
const MAX_RETRIES = 3
const RETRY_DELAY_MS = 2000 // 2 seconds between retries
let isSyncing = false

export async function addToQueue(item) {
  try {
    const existing = await getQueue()
    const updated = [...existing, {
      ...item,
      _id: Date.now().toString(),
      _retries: 0,
      _addedAt: new Date().toISOString(),
    }]
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

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function processItem(item, user) {
  const { _id, _retries, _addedAt, type, ...data } = item

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
}

async function processItemWithRetry(item, user) {
  let lastError = null
  const retries = item._retries || 0

  for (let attempt = 0; attempt <= MAX_RETRIES - retries; attempt++) {
    try {
      if (attempt > 0) {
        await delay(RETRY_DELAY_MS * attempt)
      }

      const result = await processItem(item, user)

      if (result?.error) {
        lastError = result.error

        // Don't retry on permanent errors
        if (isPermanentError(result.error)) {
          return { success: false, permanent: true, error: result.error }
        }

        continue // Retry on temporary errors
      }

      return { success: true }
    } catch (err) {
      lastError = err
      // Continue to retry
    }
  }

  return { success: false, permanent: false, error: lastError }
}

function isPermanentError(error) {
  // These errors won't be fixed by retrying
  const permanentCodes = [
    '23505', // Duplicate key
    '23503', // Foreign key violation
    '42501', // Insufficient privilege
    'PGRST116', // Row not found
  ]
  const errorCode = error?.code || error?.message || ''
  return permanentCodes.some(code => errorCode.includes(code))
}

export async function syncQueue() {
  if (isSyncing) return
  isSyncing = true

  try {
    const queue = await getQueue()
    if (queue.length === 0) return

    const user = await getUser()
    if (!user) return

    const failedItems = []
    const deadItems = [] // Items that exceeded max retries

    for (const item of queue) {
      const retries = item._retries || 0

      // Skip items that exceeded max retries — dead letter queue
      if (retries >= MAX_RETRIES) {
        deadItems.push(item)
        continue
      }

      const result = await processItemWithRetry(item, user)

      if (!result.success) {
        if (result.permanent) {
          // Permanent error — discard item
          console.log(`Discarding queue item ${item._id} due to permanent error`)
        } else {
          // Temporary error — increment retry count and keep
          failedItems.push({
            ...item,
            _retries: retries + 1,
            _lastAttempt: new Date().toISOString(),
          })
        }
      }
    }

    // Keep failed items and dead items (for debugging)
    const remaining = [...failedItems, ...deadItems]
    if (remaining.length === 0) {
      await clearQueue()
    } else {
      await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(remaining))
    }
  } catch {
    // Silently fail
  } finally {
    isSyncing = false
  }
}

// Get count of pending items for UI display
export async function getQueueCount() {
  try {
    const queue = await getQueue()
    return queue.filter(item => (item._retries || 0) < MAX_RETRIES).length
  } catch {
    return 0
  }
}

// Clear dead items (items that failed MAX_RETRIES times)
export async function clearDeadItems() {
  try {
    const queue = await getQueue()
    const alive = queue.filter(item => (item._retries || 0) < MAX_RETRIES)
    await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(alive))
  } catch {}
}