import { calculateNextDue } from './recurring'

jest.mock('../services/sqliteService', () => ({
  getRecurring: jest.fn(),
  processRecurringExpenseItemAtomic: jest.fn(),
  getRecurringIncome: jest.fn(),
  processRecurringIncomeItemAtomic: jest.fn(),
}))

jest.mock('./errorLog', () => ({ logError: jest.fn() }))

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

  describe('with an anchor day (no month-end drift)', () => {
    it('re-anchors to the 31st after a short month instead of drifting', () => {
      // Jan 31 → Feb 28 (clamped) → but next month returns to Mar 31, not Mar 28.
      expect(calculateNextDue('2026-01-31', 'monthly', 31)).toBe('2026-02-28')
      expect(calculateNextDue('2026-02-28', 'monthly', 31)).toBe('2026-03-31')
      expect(calculateNextDue('2026-03-31', 'monthly', 31)).toBe('2026-04-30')
      expect(calculateNextDue('2026-04-30', 'monthly', 31)).toBe('2026-05-31')
    })

    it('re-anchors to the 29th/30th correctly across February', () => {
      expect(calculateNextDue('2026-01-30', 'monthly', 30)).toBe('2026-02-28')
      expect(calculateNextDue('2026-02-28', 'monthly', 30)).toBe('2026-03-30')
      expect(calculateNextDue('2028-01-29', 'monthly', 29)).toBe('2028-02-29') // leap
    })

    it('leaves mid-month anchors unchanged', () => {
      expect(calculateNextDue('2026-07-15', 'monthly', 15)).toBe('2026-08-15')
    })

    it('ignores the anchor for daily/weekly frequencies', () => {
      expect(calculateNextDue('2026-07-01', 'daily', 31)).toBe('2026-07-02')
      expect(calculateNextDue('2026-07-01', 'weekly', 31)).toBe('2026-07-08')
    })
  })

  describe('unrecognized frequency', () => {
    // The processing loops advance `while (currentDue <= today)`, so a frequency
    // that fails to move the date forward would spin forever. An unknown value
    // must still strictly advance the date (falls back to monthly).
    it('advances the date instead of returning it unchanged', () => {
      const next = calculateNextDue('2026-07-15', 'garbage')
      expect(next).not.toBe('2026-07-15')
      expect(next > '2026-07-15').toBe(true)
      expect(next).toBe('2026-08-15')
    })

    it('never returns a non-advancing date for empty/nullish frequency', () => {
      expect(calculateNextDue('2026-07-15', '') > '2026-07-15').toBe(true)
      expect(calculateNextDue('2026-07-15', undefined) > '2026-07-15').toBe(true)
    })
  })
})
