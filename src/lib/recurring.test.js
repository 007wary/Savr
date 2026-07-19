import { calculateNextDue } from './recurring'

jest.mock('../services/sqliteService', () => ({
  getRecurring: jest.fn(),
  processRecurringExpenseItemAtomic: jest.fn(),
  getRecurringIncome: jest.fn(),
  processRecurringIncomeItemAtomic: jest.fn(),
}))

describe('calculateNextDue', () => {
  it('advances daily frequency by 1 day', () => {
    expect(calculateNextDue('2026-07-01', 'daily')).toBe('2026-07-02')
  })

  it('advances weekly frequency by 7 days', () => {
    expect(calculateNextDue('2026-07-01', 'weekly')).toBe('2026-07-08')
  })

  it('advances monthly frequency by 1 month', () => {
    expect(calculateNextDue('2026-07-01', 'monthly')).toBe('2026-08-01')
  })

  it('rolls over correctly across year boundary', () => {
    expect(calculateNextDue('2026-12-15', 'monthly')).toBe('2027-01-15')
    expect(calculateNextDue('2026-12-31', 'daily')).toBe('2027-01-01')
  })

  it('clamps monthly rollover for month-end dates to the last day of the target month', () => {
    expect(calculateNextDue('2026-01-31', 'monthly')).toBe('2026-02-28')
    expect(calculateNextDue('2026-03-31', 'monthly')).toBe('2026-04-30')
  })

  it('keeps a clamped date clamped on subsequent months', () => {
    expect(calculateNextDue('2026-02-28', 'monthly')).toBe('2026-03-28')
  })

  it('handles leap year February', () => {
    expect(calculateNextDue('2027-02-28', 'daily')).toBe('2027-03-01')
    expect(calculateNextDue('2028-02-28', 'daily')).toBe('2028-02-29')
  })
})
