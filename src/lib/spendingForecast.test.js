import { forecastMonthEnd } from './spendingForecast'

// Fixed reference date: 2026-06-10 (June has 30 days, day 10 of 30).
const REF = new Date(2026, 5, 10)

function day(n, total) {
  return { date: `2026-06-${String(n).padStart(2, '0')}`, total }
}

describe('forecastMonthEnd', () => {
  it('projects a steady daily pace across the full month', () => {
    // 100/day for 10 days = 1000 so far; steady pace → ~3000 for 30 days.
    const daily = Array.from({ length: 10 }, (_, i) => day(i + 1, 100))
    const f = forecastMonthEnd(daily, null, REF)
    expect(f.spentSoFar).toBe(1000)
    expect(f.projectedTotal).toBeGreaterThan(2800)
    expect(f.projectedTotal).toBeLessThan(3200)
  })

  it('zero-fills quiet days so pace is not overstated', () => {
    // Spent 1000 but only on day 1; 9 quiet days → low run rate.
    const f = forecastMonthEnd([day(1, 1000)], null, REF)
    expect(f.spentSoFar).toBe(1000)
    // pace ~100/day → ~3000 projected, not 30000
    expect(f.projectedTotal).toBeLessThan(4000)
  })

  it('flags goal exceedance and computes a safe daily spend', () => {
    const daily = Array.from({ length: 10 }, (_, i) => day(i + 1, 200)) // 2000 so far
    const f = forecastMonthEnd(daily, 3000, REF)
    expect(f.willExceedGoal).toBe(true)
    expect(f.projectedOverGoal).toBeGreaterThan(0)
    // remaining budget 1000 over 20 days = 50/day
    expect(f.safeDailySpend).toBe(50)
  })

  it('reports on-track when pace stays within goal', () => {
    const daily = Array.from({ length: 10 }, (_, i) => day(i + 1, 50)) // 500 so far
    const f = forecastMonthEnd(daily, 5000, REF)
    expect(f.willExceedGoal).toBe(false)
  })

  it('handles the last day of the month with no remaining days', () => {
    const f = forecastMonthEnd([day(1, 100)], 1000, new Date(2026, 5, 30))
    expect(f.projectedTotal).toBe(f.spentSoFar)
  })
})
