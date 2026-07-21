import { buildReportInsights } from './reportInsights'

const money = (n) => `₹${Math.round(n)}`

// A Saturday-heavy month in 2026-06 (June 2026: 6th & 13th & 20th are Saturdays,
// 7th/14th are Sundays). Build enough rows to clear the min-data gate.
function exp(date, amount, category = 'Food', note = '') {
  return { date, amount, category, note }
}

const base = {
  formatAmount: money, currencySymbol: '₹', currencyCode: 'INR',
}

describe('buildReportInsights', () => {
  it('returns [] below the minimum data threshold', () => {
    expect(buildReportInsights({ ...base, total: 100, expenses: [exp('2026-06-01', 100)] })).toEqual([])
  })

  it('flags a dominant top category', () => {
    const expenses = [
      exp('2026-06-01', 400, 'Food'), exp('2026-06-02', 100, 'Bills'),
      exp('2026-06-03', 50, 'Transport'), exp('2026-06-04', 50, 'Shopping'),
    ]
    const insights = buildReportInsights({
      ...base, total: 600, expenses,
      categoryTotals: [
        { label: 'Food', percentage: 66.7 }, { label: 'Bills', percentage: 16.7 },
      ],
    })
    const top = insights.find(i => i.key === 'top-category')
    expect(top).toBeTruthy()
    expect(top.text).toMatch(/Food makes up 67%/)
  })

  it('detects weekend-heavy spending on a per-day basis', () => {
    const expenses = [
      exp('2026-06-06', 1000), exp('2026-06-07', 1000), // Sat+Sun
      exp('2026-06-01', 100), exp('2026-06-02', 100), exp('2026-06-03', 100),
    ]
    const insights = buildReportInsights({
      ...base, total: 2300, expenses, categoryTotals: [{ label: 'Food', percentage: 100 }],
    })
    // weekend/day = 2000/2 = 1000; weekday/day = 300/5 = 60 → strongly weekend
    expect(insights.find(i => i.key === 'weekend')).toBeTruthy()
    expect(insights.find(i => i.key === 'weekday')).toBeFalsy()
  })

  it('names the priciest weekday', () => {
    const expenses = [
      exp('2026-06-05', 900), // Friday
      exp('2026-06-01', 50), exp('2026-06-02', 50), exp('2026-06-03', 50),
    ]
    const insights = buildReportInsights({
      ...base, total: 1050, expenses, categoryTotals: [{ label: 'Food', percentage: 100 }],
    })
    const busy = insights.find(i => i.key === 'busiest-day')
    expect(busy).toBeTruthy()
    expect(busy.text).toMatch(/Friday/)
  })

  it('reports an upward month-over-month trend', () => {
    const expenses = [
      exp('2026-06-01', 100), exp('2026-06-02', 100), exp('2026-06-03', 100), exp('2026-06-04', 100),
    ]
    const insights = buildReportInsights({
      ...base, total: 3000, expenses, categoryTotals: [{ label: 'Food', percentage: 100 }],
      last6Months: [
        { amount: 1000 }, { amount: 1000 }, { amount: 1000 },
        { amount: 1000 }, { amount: 1000 }, { amount: 3000 }, // this month way up
      ],
    })
    const trend = insights.find(i => i.key === 'trend-up')
    expect(trend).toBeTruthy()
    expect(trend.text).toMatch(/above your recent average/)
  })

  it('caps at 4 insights', () => {
    const expenses = [
      exp('2026-06-06', 1000), exp('2026-06-07', 1000),
      exp('2026-06-05', 900), exp('2026-06-01', 50), exp('2026-06-02', 50),
    ]
    const insights = buildReportInsights({
      ...base, total: 3000, expenses,
      categoryTotals: [{ label: 'Food', percentage: 80 }],
      last6Months: [{ amount: 500 }, { amount: 500 }, { amount: 500 }, { amount: 3000 }],
    })
    expect(insights.length).toBeLessThanOrEqual(4)
  })
})
