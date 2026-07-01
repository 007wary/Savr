import { roundMoney } from './currency'

describe('roundMoney', () => {
  it('corrects binary floating-point drift', () => {
    expect(roundMoney(0.1 + 0.2)).toBe(0.3)
  })

  it('rounds to 2 decimal places', () => {
    expect(roundMoney(1.005)).toBe(1.01)
    expect(roundMoney(19.999)).toBe(20)
  })

  it('sums many small amounts without drift', () => {
    const total = Array(10).fill(0.1).reduce((sum, n) => roundMoney(sum + n), 0)
    expect(total).toBe(1)
  })

  it('returns 0 for non-finite input', () => {
    expect(roundMoney(NaN)).toBe(0)
    expect(roundMoney(Infinity)).toBe(0)
    expect(roundMoney(undefined)).toBe(0)
  })

  it('handles negative amounts', () => {
    expect(roundMoney(-5.005)).toBe(-5)
  })
})
