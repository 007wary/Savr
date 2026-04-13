import { supabase } from './supabase'

const PROCESSING_KEY = 'savr_recurring_processing'
let isProcessing = false

export async function processDueRecurring(userId) {
  // Prevent double execution
  if (isProcessing) return 0
  isProcessing = true

  try {
    const today = new Date()
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`

    const { data: recurring } = await supabase
      .from('recurring_expenses')
      .select('*')
      .eq('user_id', userId)
      .eq('is_active', true)
      .lte('next_due', todayStr)

    if (!recurring || recurring.length === 0) return 0

    let logged = 0

    for (const item of recurring) {
      // Check if already logged today — prevent duplicates
      const { data: existing } = await supabase
        .from('expenses')
        .select('id')
        .eq('user_id', userId)
        .eq('date', todayStr)
        .eq('category', item.category)
        .eq('amount', item.amount)
        .eq('note', item.note || `Auto: ${item.category}`)
        .limit(1)

      if (existing && existing.length > 0) {
        // Already logged today — just update next_due
        const nextDue = calculateNextDue(item.next_due, item.frequency)
        await supabase
          .from('recurring_expenses')
          .update({ next_due: nextDue, last_logged: todayStr })
          .eq('id', item.id)
        continue
      }

      const { error } = await supabase.from('expenses').insert({
        user_id: userId,
        amount: item.amount,
        category: item.category,
        note: item.note || `Auto: ${item.category}`,
        date: todayStr,
      })

      if (!error) {
        const nextDue = calculateNextDue(item.next_due, item.frequency)
        await supabase
          .from('recurring_expenses')
          .update({ next_due: nextDue, last_logged: todayStr })
          .eq('id', item.id)
        logged++
      }
    }

    return logged
  } catch {
    return 0
  } finally {
    isProcessing = false
  }
}

function calculateNextDue(currentDue, frequency) {
  const nextDue = new Date(currentDue + 'T00:00:00')
  if (frequency === 'daily') nextDue.setDate(nextDue.getDate() + 1)
  else if (frequency === 'weekly') nextDue.setDate(nextDue.getDate() + 7)
  else if (frequency === 'monthly') nextDue.setMonth(nextDue.getMonth() + 1)
  return `${nextDue.getFullYear()}-${String(nextDue.getMonth() + 1).padStart(2, '0')}-${String(nextDue.getDate()).padStart(2, '0')}`
}