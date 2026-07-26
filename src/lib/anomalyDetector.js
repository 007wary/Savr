// Detect if an expense is unusually high compared to historical spending.
//
// Uses the MEDIAN and MAD (median absolute deviation) rather than the mean, so
// a single past splurge doesn't inflate the baseline and hide (or fake) later
// anomalies. An expense is flagged when it sits far above the typical value on
// a robust, outlier-resistant scale.

import { localDateKey } from './dateUtils'

function median(sorted) {
  const n = sorted.length
  const mid = Math.floor(n / 2)
  return n % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

export function detectAnomaly(newAmount, category, allExpenses) {
  try {
    // Get last 90 days expenses for this category (excluding today)
    const ninetyDaysAgo = new Date()
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90)
    const ninetyDaysAgoStr = localDateKey(ninetyDaysAgo)
    const todayStr = localDateKey()

    const historicalExpenses = allExpenses.filter(e =>
      e.category === category &&
      e.date >= ninetyDaysAgoStr &&
      e.date <= todayStr
    )

    // Need at least 4 historical expenses for a meaningful median/MAD.
    if (historicalExpenses.length < 4) return null

    const amounts = historicalExpenses
      .map(e => parseFloat(e.amount))
      .filter(a => Number.isFinite(a) && a > 0)
      .sort((a, b) => a - b)
    if (amounts.length < 4) return null

    const med = median(amounts)
    if (med <= 0) return null

    // MAD scaled into a modified z-score (0.6745 factor) is the standard robust
    // outlier test; a threshold of ~3.5 is the common cutoff. We also require
    // the amount to be at least 2x the median so tiny absolute jumps on cheap
    // categories don't nag the user.
    const deviations = amounts.map(a => Math.abs(a - med)).sort((a, b) => a - b)
    const mad = median(deviations)

    let isAnomaly
    if (mad > 0) {
      const modifiedZ = (0.6745 * (newAmount - med)) / mad
      isAnomaly = modifiedZ >= 3.5 && newAmount >= med * 2
    } else {
      // All historical amounts identical (MAD=0): flag anything ≥2x that value.
      isAnomaly = newAmount >= med * 2
    }
    if (!isAnomaly) return null

    return {
      avg: Math.round(med), // shown as "usual" in the UI; median is the honest center
      max: Math.round(amounts[amounts.length - 1]),
      multiplier: (newAmount / med).toFixed(1),
      count: amounts.length,
    }
  } catch {
    return null
  }
}
