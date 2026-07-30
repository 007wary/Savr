import { generateBudgetRecommendations } from './budgetRecommendations'

const categories = [{ label: 'Food' }, { label: 'Rent' }]

function monthsAgoKey(n) {
  const now = new Date()
  const d = new Date(now.getFullYear(), now.getMonth() - n, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

describe('generateBudgetRecommendations', () => {
  it('skips categories with no spending history in the last 3 months', () => {
    const result = generateBudgetRecommendations([], categories)
    expect(result).toEqual({})
  })

  it('recommends trimming a volatile discretionary category', () => {
    const expenses = [
      { category: 'Food', date: `${monthsAgoKey(1)}-05`, amount: '100' },
      { category: 'Food', date: `${monthsAgoKey(2)}-05`, amount: '10' },
      { category: 'Food', date: `${monthsAgoKey(3)}-05`, amount: '400' },
    ]
    const result = generateBudgetRecommendations(expenses, categories)
    expect(result.Food.fixed).toBe(false)
    expect(result.Food.recommended).toBeLessThan(result.Food.avg)
    expect(result.Rent).toBeUndefined()
  })

  it('treats a near-constant category as a fixed cost and does not cut it', () => {
    const expenses = [
      { category: 'Rent', date: `${monthsAgoKey(1)}-01`, amount: '1000' },
      { category: 'Rent', date: `${monthsAgoKey(2)}-01`, amount: '1000' },
      { category: 'Rent', date: `${monthsAgoKey(3)}-01`, amount: '1005' },
    ]
    const result = generateBudgetRecommendations(expenses, categories)
    expect(result.Rent.fixed).toBe(true)
    expect(result.Rent.recommended).toBeGreaterThanOrEqual(result.Rent.avg)
  })

  it('sums multiple expenses within the same month before averaging', () => {
    const expenses = [
      { category: 'Food', date: `${monthsAgoKey(1)}-05`, amount: '50' },
      { category: 'Food', date: `${monthsAgoKey(1)}-10`, amount: '50' },
    ]
    const result = generateBudgetRecommendations(expenses, categories)
    expect(result.Food.avg).toBe(100)
    expect(result.Food.months).toBe(1)
  })
})
