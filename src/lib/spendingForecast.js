// Month-end spending forecast.
//
// Projects where the user will land by month end from their pace so far, and
// compares it against their monthly spending goal. Pure, synchronous, local.
//
// Rather than a naive "spent-so-far / days-elapsed * days-in-month" (which
// swings wildly early in the month and on days with no spend), this uses the
// mean daily spend across ALL elapsed days including zero-spend days — the
// honest run-rate — and adds a light recency weight so a recent change in
// habits is reflected. Both are blended to stay stable.

// `dailyTotals`: [{ date: 'YYYY-MM-DD', total }] for the current month (zero-spend
//   days may be absent — we fill them in).
// `today`: Date (defaults to now). `goal`: number|null (monthly spending goal).
export function forecastMonthEnd(dailyTotals, goal = null, today = new Date()) {
  const year = today.getFullYear()
  const monthIdx = today.getMonth()
  const daysInMonth = new Date(year, monthIdx + 1, 0).getDate()
  const dayOfMonth = today.getDate()

  const byDate = new Map((dailyTotals || []).map(d => [d.date, Number(d.total) || 0]))

  // Spend for each elapsed day, zero-filled, so quiet days pull the pace down
  // honestly instead of being skipped.
  const daily = []
  let spentSoFar = 0
  for (let day = 1; day <= dayOfMonth; day++) {
    const key = `${year}-${String(monthIdx + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    const amt = byDate.get(key) || 0
    daily.push(amt)
    spentSoFar += amt
  }

  const remainingDays = daysInMonth - dayOfMonth
  if (remainingDays <= 0) {
    return buildResult(spentSoFar, spentSoFar, goal, dayOfMonth, daysInMonth)
  }

  // Two run-rate estimates, blended:
  //   overall  — mean daily spend across the whole month so far (stable)
  //   recent   — mean over the last up-to-7 days (adapts to a habit change)
  const overallRate = spentSoFar / dayOfMonth
  const recentWindow = daily.slice(-7)
  const recentRate = recentWindow.reduce((s, v) => s + v, 0) / recentWindow.length

  // Weight recent more as the month progresses (early on there isn't enough
  // recent signal to trust). Caps at 60% recent.
  const recentWeight = Math.min(0.6, dayOfMonth / daysInMonth)
  const blendedRate = overallRate * (1 - recentWeight) + recentRate * recentWeight

  const projected = spentSoFar + blendedRate * remainingDays
  return buildResult(spentSoFar, projected, goal, dayOfMonth, daysInMonth)
}

function buildResult(spentSoFar, projected, goal, dayOfMonth, daysInMonth) {
  const projectedTotal = Math.round(projected)
  const result = {
    spentSoFar: Math.round(spentSoFar),
    projectedTotal,
    dayOfMonth,
    daysInMonth,
    dailyPace: Math.round(spentSoFar / dayOfMonth),
    goal: goal || null,
  }

  if (goal && goal > 0) {
    result.willExceedGoal = projectedTotal > goal
    result.projectedOverGoal = Math.max(0, projectedTotal - goal)
    result.goalUsedPct = Math.round((projectedTotal / goal) * 100)
    // Daily budget the user can afford for the rest of the month to still hit
    // the goal (null if already projected under, or already over).
    const remainingDays = daysInMonth - dayOfMonth
    const remainingBudget = goal - spentSoFar
    result.safeDailySpend = remainingDays > 0 && remainingBudget > 0
      ? Math.floor(remainingBudget / remainingDays)
      : 0
  }

  return result
}
