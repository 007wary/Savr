import { getRecurring, addExpense, updateRecurringAfterLog } from '../services/sqliteService'

let isProcessing = false

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
        let currentDue = item.next_due
        let lastLogged = item.last_logged

        // Log all missed entries up to today
        while (currentDue <= todayStr) {
          if (lastLogged === currentDue) {
            currentDue = calculateNextDue(currentDue, item.frequency)
            continue
          }

          await addExpense(userId, {
            amount: item.amount,
            category: item.category,
            note: item.note || `Auto: ${item.category}`,
            date: currentDue,
            is_recurring: 1,
            recurring_id: item.id,
          })

          lastLogged = currentDue
          currentDue = calculateNextDue(currentDue, item.frequency)
          logged++
        }

        await updateRecurringAfterLog(item.id, currentDue, lastLogged)
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
  if (frequency === 'daily') next.setDate(next.getDate() + 1)
  else if (frequency === 'weekly') next.setDate(next.getDate() + 7)
  else if (frequency === 'monthly') next.setMonth(next.getMonth() + 1)
  return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-${String(next.getDate()).padStart(2, '0')}`
}

export async function processRecurringIncome(userId) {
  try {
    const { getRecurringIncome, updateRecurringIncomeAfterLog, addIncome } = await import('../services/sqliteService')
    const items = await getRecurringIncome(userId)
    if (!items || items.length === 0) return 0

    const today = new Date()
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`

    let logged = 0

    for (const item of items) {
      if (item.next_due > todayStr) continue

      try {
        let currentDue = item.next_due
        let lastLogged = item.last_logged

        while (currentDue <= todayStr) {
          if (lastLogged === currentDue) {
            currentDue = calculateNextDue(currentDue, item.frequency)
            continue
          }

          await addIncome(userId, {
            amount: item.amount,
            category: item.category,
            note: item.note || `Auto: ${item.category}`,
            date: currentDue,
          })

          lastLogged = currentDue
          currentDue = calculateNextDue(currentDue, item.frequency)
          logged++
        }

        await updateRecurringIncomeAfterLog(item.id, currentDue, lastLogged)
      } catch {}
    }

    return logged
  } catch {
    return 0
  }
}