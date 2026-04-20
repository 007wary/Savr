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

  // Pre-group expenses by category for O(n) lookup instead of O(n*m)
  const expensesByCategory = {}
  allExpenses.forEach(e => {
    if (!expensesByCategory[e.category]) expensesByCategory[e.category] = []
    expensesByCategory[e.category].push(e)
  })

  categories.forEach(cat => {
    const monthlyTotals = last3Months.map(month => {
      const catExpenses = expensesByCategory[cat.label] || []
      const monthExpenses = catExpenses.filter(e => e.date.startsWith(month))
      return monthExpenses.reduce((sum, e) => sum + parseFloat(e.amount), 0)
    })

    // Only include months where there was spending
    const activeMonths = monthlyTotals.filter(t => t > 0)
    if (activeMonths.length === 0) return

    const avg = activeMonths.reduce((sum, t) => sum + t, 0) / activeMonths.length
    const recommended = Math.ceil(avg * 0.9) // 10% less than average

    recommendations[cat.label] = {
      avg: Math.round(avg),
      recommended,
      months: activeMonths.length,
    }
  })

  return recommendations
}