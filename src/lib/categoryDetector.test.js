import { detectCategory, detectCategoryWithSource, tokenizeNote } from './categoryDetector'

describe('detectCategory — priority & longest-match', () => {
  it('returns null for empty/blank notes', () => {
    expect(detectCategory('')).toBeNull()
    expect(detectCategory('   ')).toBeNull()
  })

  it('Bills beats Shopping when both match (amazon prime)', () => {
    // "amazon" is a Shopping keyword, "prime" is a Bills keyword.
    expect(detectCategory('amazon prime')).toBe('Bills')
  })

  it('longest keyword wins (gas station -> Transport, not Bills)', () => {
    expect(detectCategory('gas station')).toBe('Transport')
  })

  it('bare "gas" still resolves to the Bills utility', () => {
    expect(detectCategory('gas bill')).toBe('Bills')
  })

  it('matches a simple single-category note', () => {
    expect(detectCategory('swiggy dinner')).toBe('Food')
  })
})

describe('single-word keywords match whole words, not substrings', () => {
  // Regression: single-word keywords were matched with String.includes(), so a
  // keyword buried inside an unrelated word mis-categorized the expense.
  it('does not match "car" inside "scary"', () => {
    expect(detectCategory('scary movie')).toBe('Entertainment') // via "movie", not Transport
  })
  it('does not match "eat" inside "theater"', () => {
    expect(detectCategory('theater tickets')).toBe('Entertainment') // via "theater"/"ticket", not Food
  })
  it('does not match "tea" inside "teaching"', () => {
    expect(detectCategory('teaching class')).toBe('Education') // via "class", not Food
  })
  it('still matches a keyword that IS a standalone word', () => {
    expect(detectCategory('green tea')).toBe('Food')
    expect(detectCategory('bought a car')).toBe('Transport')
  })
  it('still matches keywords containing . or & as whole tokens', () => {
    expect(detectCategory('booking.com hotel')).toBe('Transport')
    expect(detectCategory('shopping at h&m')).toBe('Shopping')
  })
})

describe('learned categories override keywords', () => {
  const learned = [{ token: 'swiggy', category: 'Bills', count: 3 }]

  it('a learned mapping beats the keyword table', () => {
    // "swiggy" is a Food keyword, but the user has repeatedly filed it as Bills.
    expect(detectCategory('swiggy', learned)).toBe('Bills')
  })

  it('higher-count learned mapping wins on conflict', () => {
    const two = [
      { token: 'club', category: 'Entertainment', count: 1 },
      { token: 'club', category: 'Health', count: 5 },
    ]
    expect(detectCategory('club', two)).toBe('Health')
  })
})

describe('detectCategoryWithSource', () => {
  it('reports keyword source for a table match', () => {
    expect(detectCategoryWithSource('uber ride')).toEqual({ category: 'Transport', source: 'keyword' })
  })

  it('reports learned source when a user mapping matches', () => {
    const learned = [{ token: 'uber', category: 'Bills', count: 2 }]
    expect(detectCategoryWithSource('uber ride', learned)).toEqual({ category: 'Bills', source: 'learned' })
  })

  it('reports null source when nothing matches', () => {
    expect(detectCategoryWithSource('xyzzy blah')).toEqual({ category: null, source: null })
  })
})

describe('tokenizeNote', () => {
  it('lowercases and drops short/punctuation tokens', () => {
    expect(tokenizeNote('Swiggy, at 9pm!')).toEqual(['swiggy', '9pm'])
  })
  it('returns [] for non-strings', () => {
    expect(tokenizeNote(null)).toEqual([])
  })
})
