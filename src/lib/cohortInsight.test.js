/* eslint-disable import/first -- jest.mock() must be hoisted above imports */
jest.mock('./supabase', () => ({ supabase: { rpc: jest.fn() } }))

import { buildCohortInsight } from './cohortInsight'

describe('buildCohortInsight', () => {
  it('returns null without a top category or cohort data', () => {
    expect(buildCohortInsight(null, 100, { Food: { avg: 100, userCount: 10 } })).toBeNull()
    expect(buildCohortInsight('Food', 100, null)).toBeNull()
  })

  it('returns null when the category has no cohort average (unique or filtered out)', () => {
    expect(buildCohortInsight('Food', 100, { Transport: { avg: 50, userCount: 10 } })).toBeNull()
  })

  it('flags spending below the cohort average', () => {
    const res = buildCohortInsight('Food', 60, { Food: { avg: 100, userCount: 10 } })
    expect(res).toEqual({ category: 'Food', direction: 'below', diffPct: 40 })
  })

  it('flags spending above the cohort average', () => {
    const res = buildCohortInsight('Food', 150, { Food: { avg: 100, userCount: 10 } })
    expect(res).toEqual({ category: 'Food', direction: 'above', diffPct: 50 })
  })

  it('treats near-equal spending as even rather than a noisy percentage', () => {
    const res = buildCohortInsight('Food', 102, { Food: { avg: 100, userCount: 10 } })
    expect(res).toEqual({ category: 'Food', direction: 'even', diffPct: 0 })
  })
})
