// Detect if an expense is unusually high compared to historical average

export function detectAnomaly(newAmount, category, allExpenses) {
  try {
    const ninetyDaysAgo = new Date()
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90)
    const ninetyDaysAgoStr = ninetyDaysAgo.toISOString().split('T')[0]
    const todayStr = new Date().toISOString().split('T')[0]

    const historicalExpenses = allExpenses.filter(e =>
      e.category === category &&
      e.date >= ninetyDaysAgoStr &&
      e.date < todayStr
    )

    // Need at least 3 historical expenses to detect anomaly
    if (historicalExpenses.length < 3) return null

    const amounts = historicalExpenses.map(e => parseFloat(e.amount))
    const avg = amounts.reduce((sum, a) => sum + a, 0) / amounts.length

    // Only flag if new amount is more than 2.5x the average
    if (newAmount < avg * 2.5) return null

    return {
      avg: Math.round(avg),
      multiplier: (newAmount / avg).toFixed(1),
      count: historicalExpenses.length,
    }
  } catch {
    return null
  }
}