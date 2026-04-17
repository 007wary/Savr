import { getSpendingGoal, saveSpendingGoal, deleteSpendingGoal } from '../services/sqliteService'

export async function saveGoal(userId, amount) {
  try {
    await saveSpendingGoal(userId, {
      title: 'Monthly Spending Goal',
      target_amount: amount,
      deadline: null,
    })
  } catch {}
}

export async function loadGoal(userId) {
  try {
    const goal = await getSpendingGoal(userId)
    return goal ? goal.target_amount : null
  } catch {
    return null
  }
}

export async function clearGoal(userId) {
  try {
    await deleteSpendingGoal(userId)
  } catch {}
}