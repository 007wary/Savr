import { computeBalanceTrend } from './balanceTrend'
import { localDateKey } from './dateUtils'

function daysAgo(n) {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return localDateKey(d)
}

describe('computeBalanceTrend', () => {
  it('returns a flat line when there is no recent activity', () => {
    const points = computeBalanceTrend(1000, [], [], 5)
    expect(points).toEqual([1000, 1000, 1000, 1000, 1000])
  })

  it('reconstructs a rising balance from income added yesterday', () => {
    const income = [{ date: daysAgo(1), amount: '200' }]
    const points = computeBalanceTrend(1000, [], income, 3)
    // [2-days-ago, yesterday, today] — the 200 income landed on "yesterday",
    // so everything before that day must be 200 lower than current.
    expect(points).toEqual([800, 1000, 1000])
  })

  it('reconstructs a falling balance from an expense today', () => {
    const expenses = [{ date: daysAgo(0), amount: '150' }]
    const points = computeBalanceTrend(850, expenses, [], 3)
    expect(points).toEqual([1000, 1000, 850])
  })

  it('nets multiple same-day transactions', () => {
    const expenses = [{ date: daysAgo(0), amount: '50' }]
    const income = [{ date: daysAgo(0), amount: '30' }]
    const points = computeBalanceTrend(980, expenses, income, 2)
    expect(points).toEqual([1000, 980])
  })
})
