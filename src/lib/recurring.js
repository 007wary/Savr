import { supabase } from './supabase'

export async function processDueRecurring(userId) {
  const today = new Date()
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`

  // Get all active recurring expenses that are due
  const { data: recurring } = await supabase
    .from('recurring_expenses')
    .select('*')
    .eq('user_id', userId)
    .eq('is_active', true)
    .lte('next_due', todayStr)

  if (!recurring || recurring.length === 0) return 0

  let logged = 0

  for (const item of recurring) {
    // Log it as a real expense
    const { error } = await supabase.from('expenses').insert({
      user_id: userId,
      amount: item.amount,
      category: item.category,
      note: item.note || `Auto: ${item.note || item.category}`,
      date: todayStr,
    })

    if (!error) {
      // Calculate next due date
      const nextDue = new Date(item.next_due)
      if (item.frequency === 'daily') nextDue.setDate(nextDue.getDate() + 1)
      else if (item.frequency === 'weekly') nextDue.setDate(nextDue.getDate() + 7)
      else if (item.frequency === 'monthly') nextDue.setMonth(nextDue.getMonth() + 1)

      const nextDueStr = `${nextDue.getFullYear()}-${String(nextDue.getMonth() + 1).padStart(2, '0')}-${String(nextDue.getDate()).padStart(2, '0')}`

      // Update next due date
      await supabase
        .from('recurring_expenses')
        .update({ next_due: nextDueStr, last_logged: todayStr })
        .eq('id', item.id)

      logged++
    }
  }

  return logged
}