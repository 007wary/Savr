import { getRecurring, addExpense, updateRecurringAfterLog } from '../services/sqliteService'

let isProcessing = false

export async function processDueRecurring(userId) {
  if (isProcessing) return 0
  isProcessing = true

  try {
    const today = new Date()
    const todayStr = today.toISOString().split('T')[0]

    const recurring = await getRecurring(userId)
    if (!recurring || recurring.length === 0) return 0

    let logged = 0

    for (const item of recurring) {
      if (item.next_due > todayStr) continue
      if (item.last_logged === todayStr) continue

      try {
        await addExpense(userId, {
          amount: item.amount,
          category: item.category,
          note: item.note || `Auto: ${item.category}`,
          date: todayStr,
          is_recurring: 1,
          recurring_id: item.id,
        })

        const nextDue = calculateNextDue(item.next_due, item.frequency)
        await updateRecurringAfterLog(item.id, nextDue, todayStr)
        logged++
      } catch {}
    }

    return logged
  } catch {
    return 0
  } finally {
    isProcessing = false
  }
}

function calculateNextDue(currentDue, frequency) {
  const next = new Date(currentDue + 'T00:00:00')

  if (frequency === 'daily') {
    next.setDate(next.getDate() + 1)
  } else if (frequency === 'weekly') {
    next.setDate(next.getDate() + 7)
  } else if (frequency === 'monthly') {
    const day = next.getDate()
    next.setMonth(next.getMonth() + 1)
    // If month overflowed (e.g. Jan 31 → Mar 3), go to last day of intended month
    if (next.getDate() !== day) next.setDate(0)
  }

  return next.toISOString().split('T')[0]
}