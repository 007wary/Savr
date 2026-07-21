import { roundMoney } from './currency'

// Analyze last 3 months and recommend budgets per category
export function generateBudgetRecommendations(allExpenses, categories) {
  const now = new Date()
  const recommendations = {}

  // Get last 3 months keys
  const last3Months = []
  for (let i = 1; i <= 3; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    last3Months.push(
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    )
  }

  categories.forEach(cat => {
    // Get expenses for this category in last 3 months
    const monthlyTotals = last3Months.map(month => {
      const monthExpenses = allExpenses.filter(
        e => e.category === cat.label && e.date.startsWith(month)
      )
      return roundMoney(monthExpenses.reduce((sum, e) => sum + parseFloat(e.amount), 0))
    })

    // Only include months where there was spending
    const activemonths = monthlyTotals.filter(t => t > 0)

    if (activemonths.length === 0) return // No history — skip

    const avg = activemonths.reduce((sum, t) => sum + t, 0) / activemonths.length

    // Decide how aggressively to trim, based on how much this category varies
    // month to month (coefficient of variation = stddev / mean). A near-constant
    // category is a fixed cost — rent, EMI, subscriptions — where recommending
    // "spend 10% less" is nonsense; budget it at ~what it actually is. A highly
    // variable category is discretionary, where there's real room to cut.
    let factor = 0.9 // default: trim 10%
    let fixed = false
    if (activemonths.length >= 2) {
      const variance = activemonths.reduce((s, t) => s + (t - avg) ** 2, 0) / activemonths.length
      const cv = Math.sqrt(variance) / avg
      if (cv < 0.15) { factor = 1.02; fixed = true }   // fixed cost: match spend (+small buffer)
      else if (cv < 0.4) factor = 0.95                 // semi-stable: trim 5%
      else factor = 0.85                               // volatile/discretionary: trim 15%
    }

    recommendations[cat.label] = {
      avg: Math.round(avg),
      recommended: Math.ceil(avg * factor),
      months: activemonths.length,
      fixed, // UI can label these "fixed cost" instead of showing a cut
    }
  })

  return recommendations
}