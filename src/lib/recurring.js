import { getRecurring, processRecurringExpenseItemAtomic } from '../services/sqliteService'

let isProcessing = false
let isProcessingIncome = false

export async function processDueRecurring(userId) {
  if (isProcessing) return 0
  isProcessing = true

  try {
    const today = new Date()
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`

    const recurring = await getRecurring(userId)
    if (!recurring || recurring.length === 0) return 0

    let logged = 0

    for (const item of recurring) {
      if (item.next_due > todayStr) continue
      try {
        logged += await processRecurringExpenseItemAtomic(userId, item, todayStr, calculateNextDue)
      } catch {}
    }

    return logged
  } catch {
    return 0
  } finally {
    isProcessing = false
  }
}

export function calculateNextDue(currentDue, frequency) {
  const next = new Date(currentDue + 'T00:00:00')
  if (frequency === 'daily') next.setDate(next.getDate() + 1)
  else if (frequency === 'weekly') next.setDate(next.getDate() + 7)
  else if (frequency === 'monthly') {
    const day = next.getDate()
    next.setDate(1)
    next.setMonth(next.getMonth() + 1)
    const daysInTargetMonth = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate()
    next.setDate(Math.min(day, daysInTargetMonth))
  }
  return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-${String(next.getDate()).padStart(2, '0')}`
}

export async function processRecurringIncome(userId) {
  if (isProcessingIncome) return 0
  isProcessingIncome = true

  try {
    const { getRecurringIncome, processRecurringIncomeItemAtomic } = await import('../services/sqliteService')
    const items = await getRecurringIncome(userId)
    if (!items || items.length === 0) return 0

    const today = new Date()
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`

    let logged = 0

    for (const item of items) {
      if (item.next_due > todayStr) continue
      try {
        logged += await processRecurringIncomeItemAtomic(userId, item, todayStr, calculateNextDue)
      } catch {}
    }

    return logged
  } catch {
    return 0
  } finally {
    isProcessingIncome = false
  }
}
