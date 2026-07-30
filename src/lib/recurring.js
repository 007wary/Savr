import { getRecurring, processRecurringExpenseItemAtomic } from '../services/sqliteService'
import { localDateKey } from './dateUtils'
import { logError } from './errorLog'

let isProcessing = false
let isProcessingIncome = false

export async function processDueRecurring(userId) {
  if (isProcessing) return 0
  isProcessing = true

  try {
    const todayStr = localDateKey()

    const recurring = await getRecurring(userId)
    if (!recurring || recurring.length === 0) return 0

    let logged = 0

    for (const item of recurring) {
      if (item.next_due > todayStr) continue
      try {
        logged += await processRecurringExpenseItemAtomic(userId, item, todayStr, calculateNextDue)
      } catch (e) {
        logError('processDueRecurring:item', e)
      }
    }

    return logged
  } catch {
    return 0
  } finally {
    isProcessing = false
  }
}

// `anchorDay` (optional, 1–31) is the original day-of-month the monthly series
// was created on. When supplied, each month is computed from that anchor rather
// than from the previous (possibly clamped) due date, so a rule set on the 31st
// lands on Feb 28 but then returns to Mar 31 / Apr 30 instead of permanently
// drifting back to the 28th. Omit it (or pass a non-monthly frequency) to keep
// the legacy "advance from currentDue" behaviour.
export function calculateNextDue(currentDue, frequency, anchorDay = null) {
  const next = new Date(currentDue + 'T00:00:00')
  if (frequency === 'daily') next.setDate(next.getDate() + 1)
  else if (frequency === 'weekly') next.setDate(next.getDate() + 7)
  else {
    // 'monthly' and any unrecognized frequency both advance by a month. Falling
    // back to a month (rather than leaving the date unchanged) is critical: the
    // callers loop `while (currentDue <= todayStr)`, so a frequency that failed
    // to advance the date — e.g. a corrupted value from a hand-edited backup —
    // would spin forever inside a DB transaction and hang the app on startup.
    const day = anchorDay || next.getDate()
    next.setDate(1)
    next.setMonth(next.getMonth() + 1)
    const daysInTargetMonth = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate()
    next.setDate(Math.min(day, daysInTargetMonth))
  }
  return localDateKey(next)
}

export async function processRecurringIncome(userId) {
  if (isProcessingIncome) return 0
  isProcessingIncome = true

  try {
    const { getRecurringIncome, processRecurringIncomeItemAtomic } = await import('../services/sqliteService')
    const items = await getRecurringIncome(userId)
    if (!items || items.length === 0) return 0

    const todayStr = localDateKey()

    let logged = 0

    for (const item of items) {
      if (item.next_due > todayStr) continue
      try {
        logged += await processRecurringIncomeItemAtomic(userId, item, todayStr, calculateNextDue)
      } catch (e) {
        logError('processRecurringIncome:item', e)
      }
    }

    return logged
  } catch {
    return 0
  } finally {
    isProcessingIncome = false
  }
}
