// Reconstructs recent total-balance history for the accounts sparkline.
//
// There's no stored balance-history table — accounts only carry a live
// running `balance`. But the total across all accounts only moves on income
// and expenses (a transfer is zero-sum across accounts, so it nets out of
// the total and can be ignored). Walking backward from today's total by
// undoing each day's net (income - expense) reconstructs what the total was
// at the start of each of the last N days.
import { localDateKey } from './dateUtils'

export function computeBalanceTrend(currentTotal, expenses, income, days = 7) {
  const dailyNet = {}
  for (const e of expenses) dailyNet[e.date] = (dailyNet[e.date] || 0) - parseFloat(e.amount)
  for (const i of income) dailyNet[i.date] = (dailyNet[i.date] || 0) + parseFloat(i.amount)

  const points = []
  let runningTotal = currentTotal
  const today = new Date()
  for (let i = 0; i < days; i++) {
    const d = new Date(today)
    d.setDate(d.getDate() - i)
    const key = localDateKey(d)
    points.unshift(runningTotal)
    runningTotal -= dailyNet[key] || 0
  }
  return points
}
