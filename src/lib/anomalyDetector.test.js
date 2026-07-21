import { detectAnomaly } from './anomalyDetector'

// Helper: build an expense on a date N days ago in YYYY-MM-DD.
function daysAgo(n) {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function history(amounts, category = 'Food') {
  return amounts.map((amount, i) => ({ amount, category, date: daysAgo(i + 1) }))
}

describe('detectAnomaly (median/MAD)', () => {
  it('returns null with fewer than 4 historical expenses', () => {
    expect(detectAnomaly(1000, 'Food', history([100, 100, 100]))).toBeNull()
  })

  it('does not flag a normal expense', () => {
    expect(detectAnomaly(110, 'Food', history([100, 105, 95, 100, 102]))).toBeNull()
  })

  it('flags a clear outlier well above the usual spend', () => {
    const res = detectAnomaly(1000, 'Food', history([100, 105, 95, 100, 102]))
    expect(res).not.toBeNull()
    expect(res.count).toBe(5)
    expect(Number(res.multiplier)).toBeGreaterThan(2)
  })

  it('is not fooled by a single past splurge (robust to outliers)', () => {
    // One historical 5000 splurge would inflate a mean baseline; median ignores it.
    const res = detectAnomaly(400, 'Food', history([100, 105, 95, 100, 5000]))
    expect(res).not.toBeNull() // 400 is still ~4x the median of ~100
  })

  it('handles identical historical amounts (MAD=0) via the 2x fallback', () => {
    expect(detectAnomaly(200, 'Food', history([100, 100, 100, 100]))).not.toBeNull()
    expect(detectAnomaly(150, 'Food', history([100, 100, 100, 100]))).toBeNull()
  })

  it('ignores other categories', () => {
    const mixed = [...history([100, 100, 100, 100], 'Food'), ...history([5, 5, 5, 5], 'Transport')]
    expect(detectAnomaly(300, 'Food', mixed)).not.toBeNull()
  })
})
