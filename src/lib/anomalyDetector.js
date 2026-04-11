// Detect if an expense is unusually high compared to historical average

export function detectAnomaly(newAmount, category, allExpenses) {
  try {
    const now = new Date()

    // Get last 90 days expenses for this category (excluding today)
    const ninetyDaysAgo = new Date()
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90)
    const ninetyDaysAgoStr = `${ninetyDaysAgo.getFullYear()}-${String(ninetyDaysAgo.getMonth() + 1).padStart(2, '0')}-${String(ninetyDaysAgo.getDate()).padStart(2, '0')}`
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`

    const historicalExpenses = allExpenses.filter(e =>
      e.category === category &&
      e.date >= ninetyDaysAgoStr &&
      e.date < todayStr
    )

    // Need at least 3 historical expenses to detect anomaly
    if (historicalExpenses.length < 3) return null

    const amounts = historicalExpenses.map(e => parseFloat(e.amount))
    const avg = amounts.reduce((sum, a) => sum + a, 0) / amounts.length
    const max = Math.max(...amounts)

    // Only flag if new amount is more than 2.5x the average
    if (newAmount < avg * 2.5) return null

    const multiplier = (newAmount / avg).toFixed(1)

    return {
      avg: Math.round(avg),
      max: Math.round(max),
      multiplier,
      count: historicalExpenses.length,
    }
  } catch {
    return null
  }
}