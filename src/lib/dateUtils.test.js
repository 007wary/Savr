import { localDateKey, monthKey, sortExpenses } from './dateUtils'

describe('localDateKey', () => {
  it('formats using local getters, zero-padded', () => {
    expect(localDateKey(new Date(2026, 0, 5))).toBe('2026-01-05')
    expect(localDateKey(new Date(2026, 10, 30))).toBe('2026-11-30')
  })

  it('defaults to the current date when no argument is given', () => {
    const now = new Date()
    const expected = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
    expect(localDateKey()).toBe(expected)
  })
})

describe('monthKey', () => {
  it('formats using local getters, zero-padded', () => {
    expect(monthKey(new Date(2026, 0, 5))).toBe('2026-01')
    expect(monthKey(new Date(2026, 10, 30))).toBe('2026-11')
  })
})

describe('sortExpenses', () => {
  it('sorts newest date first', () => {
    const data = [
      { date: '2026-01-01', created_at: '2026-01-01T00:00:00Z' },
      { date: '2026-01-03', created_at: '2026-01-03T00:00:00Z' },
      { date: '2026-01-02', created_at: '2026-01-02T00:00:00Z' },
    ]
    expect(sortExpenses(data).map(e => e.date)).toEqual(['2026-01-03', '2026-01-02', '2026-01-01'])
  })

  it('breaks same-day ties by newest created_at first', () => {
    const data = [
      { date: '2026-01-01', created_at: '2026-01-01T10:00:00Z' },
      { date: '2026-01-01', created_at: '2026-01-01T12:00:00Z' },
      { date: '2026-01-01', created_at: '2026-01-01T08:00:00Z' },
    ]
    expect(sortExpenses(data).map(e => e.created_at)).toEqual([
      '2026-01-01T12:00:00Z',
      '2026-01-01T10:00:00Z',
      '2026-01-01T08:00:00Z',
    ])
  })

  it('treats a missing created_at as oldest', () => {
    const data = [
      { date: '2026-01-01', created_at: undefined },
      { date: '2026-01-01', created_at: '2026-01-01T08:00:00Z' },
    ]
    expect(sortExpenses(data).map(e => e.created_at)).toEqual(['2026-01-01T08:00:00Z', undefined])
  })

  it('does not mutate the input array', () => {
    const data = [{ date: '2026-01-01', created_at: '1' }, { date: '2026-01-02', created_at: '2' }]
    const copy = [...data]
    sortExpenses(data)
    expect(data).toEqual(copy)
  })
})
