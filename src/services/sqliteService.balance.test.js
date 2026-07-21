/**
 * Balance-mutation tests for the SQLite service.
 *
 * These exercise the REAL add/update/delete functions from sqliteService.js
 * against an in-memory fake DB that implements just the subset of the
 * expo-sqlite async API those functions use (runAsync / getFirstAsync /
 * getAllAsync / withTransactionAsync). The point is to lock down account
 * balance arithmetic — the money paths where a regression silently corrupts
 * user data — without pulling in a native SQLite build.
 *
 * The fake is a tiny SQL interpreter matching the exact statement shapes the
 * service emits. If the service starts emitting a statement shape the fake
 * doesn't recognise, the fake throws loudly rather than silently passing.
 */

// ─── Fake expo-sqlite ────────────────────────────────────────────────────────
// Tables are arrays of row objects. Only the columns the balance logic reads
// are modelled faithfully; everything else is stored verbatim from the params.

function createFakeDB() {
  const tables = {
    expenses: [],
    income: [],
    transfers: [],
    accounts: [],
    recurring_expenses: [],
    recurring_income: [],
    budgets: [],
    spending_goals: [],
  }

  // Fail if a transaction body throws AFTER partial writes, to prove atomicity:
  // we snapshot before the body and restore on throw (SQLite would roll back).
  function snapshot() {
    return JSON.parse(JSON.stringify(tables))
  }
  function restore(snap) {
    for (const k of Object.keys(tables)) tables[k] = snap[k]
  }

  function insert(table, columns, params) {
    const row = {}
    columns.forEach((col, i) => { row[col] = params[i] })
    tables[table].push(row)
  }

  const db = {
    // Only INSERT / UPDATE / DELETE go through runAsync in the service.
    async runAsync(sql, params = []) {
      const s = sql.trim().replace(/\s+/g, ' ')

      let m
      // INSERT INTO <table> (col, col, ...) VALUES (?, ?, ...)
      if ((m = s.match(/^INSERT (?:OR REPLACE )?INTO (\w+) \(([^)]+)\) VALUES/i))) {
        const table = m[1]
        const columns = m[2].split(',').map(c => c.trim())
        insert(table, columns, params)
        return { changes: 1 }
      }

      // UPDATE accounts SET balance = balance + ?, updated_at = ? WHERE id = ?
      if (/^UPDATE accounts SET balance = balance \+ \?, updated_at = \? WHERE id = \?$/i.test(s)) {
        const [delta, updatedAt, accId] = params
        const acc = tables.accounts.find(a => a.id === accId)
        if (acc) { acc.balance = (acc.balance || 0) + delta; acc.updated_at = updatedAt }
        return { changes: acc ? 1 : 0 }
      }
      // UPDATE accounts SET balance = balance - ?, updated_at = ? WHERE id = ?
      if (/^UPDATE accounts SET balance = balance - \?, updated_at = \? WHERE id = \?$/i.test(s)) {
        const [delta, updatedAt, accId] = params
        const acc = tables.accounts.find(a => a.id === accId)
        if (acc) { acc.balance = (acc.balance || 0) - delta; acc.updated_at = updatedAt }
        return { changes: acc ? 1 : 0 }
      }

      // UPDATE income SET amount = ?, category = ?, note = ?, date = ?, account_id = ?, updated_at = ? WHERE id = ?
      if (/^UPDATE income SET amount = \?, category = \?, note = \?, date = \?, account_id = \?, updated_at = \? WHERE id = \?$/i.test(s)) {
        const [amount, category, note, date, accountId, updatedAt, rowId] = params
        const row = tables.income.find(r => r.id === rowId)
        if (row) Object.assign(row, { amount, category, note, date, account_id: accountId, updated_at: updatedAt })
        return { changes: row ? 1 : 0 }
      }
      // UPDATE expenses SET amount = ?, category = ?, note = ?, date = ?, account_id = ?, updated_at = ? WHERE id = ?
      if (/^UPDATE expenses SET amount = \?, category = \?, note = \?, date = \?, account_id = \?, updated_at = \? WHERE id = \?$/i.test(s)) {
        const [amount, category, note, date, accountId, updatedAt, rowId] = params
        const row = tables.expenses.find(r => r.id === rowId)
        if (row) Object.assign(row, { amount, category, note, date, account_id: accountId, updated_at: updatedAt })
        return { changes: row ? 1 : 0 }
      }

      // DELETE FROM <table> WHERE id = ?
      if ((m = s.match(/^DELETE FROM (\w+) WHERE id = \?$/i))) {
        const table = m[1]
        const before = tables[table].length
        tables[table] = tables[table].filter(r => r.id !== params[0])
        return { changes: before - tables[table].length }
      }

      throw new Error(`FakeDB.runAsync: unrecognised statement shape: ${s}`)
    },

    async getFirstAsync(sql, params = []) {
      const s = sql.trim().replace(/\s+/g, ' ')
      let m
      // SELECT <cols> FROM <table> WHERE id = ?
      if ((m = s.match(/^SELECT .+ FROM (\w+) WHERE id = \?$/i))) {
        const table = m[1]
        const row = tables[table].find(r => r.id === params[0])
        // Real SQLite returns a detached snapshot row, not a live reference.
        // Clone so a later UPDATE to the stored row can't retroactively mutate
        // the `existing` copy the caller is still branching on.
        return row ? { ...row } : null
      }
      throw new Error(`FakeDB.getFirstAsync: unrecognised statement shape: ${s}`)
    },

    async getAllAsync(sql, params = []) {
      const s = sql.trim().replace(/\s+/g, ' ')
      let m
      if ((m = s.match(/^SELECT \* FROM (\w+) WHERE user_id = \?/i))) {
        const table = m[1]
        return tables[table].filter(r => r.user_id === params[0])
      }
      throw new Error(`FakeDB.getAllAsync: unrecognised statement shape: ${s}`)
    },

    async withTransactionAsync(fn) {
      const snap = snapshot()
      try {
        await fn()
      } catch (e) {
        restore(snap) // emulate ROLLBACK
        throw e
      }
    },

    async execAsync() { /* PRAGMAs etc. — no-op in tests */ },

    // test helpers
    _tables: tables,
    _account(id) { return tables.accounts.find(a => a.id === id) },
    _reset() {
      for (const k of Object.keys(tables)) tables[k] = []
      db.runAsync = db._realRunAsync // undo any per-test override
    },
  }

  db._realRunAsync = db.runAsync
  return db
}

let mockDB

jest.mock('../lib/errorLog', () => ({ logError: jest.fn() }))
jest.mock('react-native-get-random-values', () => ({}))
jest.mock('uuid', () => {
  let n = 0
  return { v4: () => `id-${++n}` }
})

// Mock expo-sqlite so the service's real getDB() opens OUR fake. This is the
// robust seam: every internal `await getDB()` call resolves to the same fake,
// so the actual service functions run unmodified against it.
jest.mock('expo-sqlite', () => ({
  openDatabaseAsync: () => Promise.resolve(mockDB),
}))

// Create the fake once. getDB() inside the service caches the DB it opens on
// first call, so the reference must stay stable across tests — we reset its
// tables in place in beforeEach rather than swapping the object.
mockDB = createFakeDB()

const svc = require('./sqliteService')

const USER = 'user-1'

function seedAccount(id, balance) {
  mockDB._tables.accounts.push({
    id, user_id: USER, name: id, type: 'bank', balance, currency: 'USD',
    created_at: 't', updated_at: 't',
  })
}

beforeEach(() => {
  mockDB._reset()
})

describe('addExpenseAtomic — debits the account', () => {
  it('reduces balance by the expense amount', async () => {
    seedAccount('acc', 100)
    await svc.addExpenseAtomic(USER, { amount: 30, category: 'Food', date: '2026-07-01', account_id: 'acc' })
    expect(mockDB._account('acc').balance).toBe(70)
  })

  it('leaves balance untouched when no account is linked', async () => {
    seedAccount('acc', 100)
    await svc.addExpenseAtomic(USER, { amount: 30, category: 'Food', date: '2026-07-01' })
    expect(mockDB._account('acc').balance).toBe(100)
  })
})

describe('addIncomeAtomic — credits the account', () => {
  it('increases balance by the income amount', async () => {
    seedAccount('acc', 100)
    await svc.addIncomeAtomic(USER, { amount: 50, category: 'Salary', date: '2026-07-01', account_id: 'acc' })
    expect(mockDB._account('acc').balance).toBe(150)
  })
})

describe('addTransferAtomic — moves money between accounts', () => {
  it('debits from and credits to by the same amount', async () => {
    seedAccount('a', 100)
    seedAccount('b', 20)
    await svc.addTransferAtomic(USER, { from_account_id: 'a', to_account_id: 'b', amount: 40, date: '2026-07-01' })
    expect(mockDB._account('a').balance).toBe(60)
    expect(mockDB._account('b').balance).toBe(60)
  })

  it('conserves total balance across the transfer', async () => {
    seedAccount('a', 100)
    seedAccount('b', 20)
    const before = mockDB._account('a').balance + mockDB._account('b').balance
    await svc.addTransferAtomic(USER, { from_account_id: 'a', to_account_id: 'b', amount: 40, date: '2026-07-01' })
    const after = mockDB._account('a').balance + mockDB._account('b').balance
    expect(after).toBe(before)
  })
})

describe('deleteExpenseAtomic — restores the debit', () => {
  it('credits the amount back to the account', async () => {
    seedAccount('acc', 100)
    const eid = await svc.addExpenseAtomic(USER, { amount: 30, category: 'Food', date: '2026-07-01', account_id: 'acc' })
    expect(mockDB._account('acc').balance).toBe(70)
    await svc.deleteExpenseAtomic(eid)
    expect(mockDB._account('acc').balance).toBe(100) // back to start
  })

  it('add-then-delete is balance-neutral (round trip)', async () => {
    seedAccount('acc', 250)
    const eid = await svc.addExpenseAtomic(USER, { amount: 99.99, category: 'Bills', date: '2026-07-01', account_id: 'acc' })
    await svc.deleteExpenseAtomic(eid)
    expect(mockDB._account('acc').balance).toBeCloseTo(250, 5)
  })

  it('does nothing to balances when the expense had no account', async () => {
    seedAccount('acc', 100)
    const eid = await svc.addExpenseAtomic(USER, { amount: 30, category: 'Food', date: '2026-07-01' })
    await svc.deleteExpenseAtomic(eid)
    expect(mockDB._account('acc').balance).toBe(100)
  })
})

describe('deleteIncomeAtomic — reverses the credit', () => {
  it('debits the amount back off the account', async () => {
    seedAccount('acc', 100)
    const iid = await svc.addIncomeAtomic(USER, { amount: 50, category: 'Salary', date: '2026-07-01', account_id: 'acc' })
    expect(mockDB._account('acc').balance).toBe(150)
    await svc.deleteIncomeAtomic(iid)
    expect(mockDB._account('acc').balance).toBe(100)
  })
})

describe('deleteTransferAtomic — reverses both legs', () => {
  it('restores both accounts to their pre-transfer balances', async () => {
    seedAccount('a', 100)
    seedAccount('b', 20)
    const tid = await svc.addTransferAtomic(USER, { from_account_id: 'a', to_account_id: 'b', amount: 40, date: '2026-07-01' })
    await svc.deleteTransferAtomic(tid)
    expect(mockDB._account('a').balance).toBe(100)
    expect(mockDB._account('b').balance).toBe(20)
  })
})

describe('updateIncome — adjusts balance for edits', () => {
  it('applies the delta when only the amount changes on the same account', async () => {
    seedAccount('acc', 100)
    const iid = await svc.addIncomeAtomic(USER, { amount: 50, category: 'Salary', date: '2026-07-01', account_id: 'acc' })
    // balance now 150; raise income to 80 → +30
    await svc.updateIncome(iid, { amount: 80, category: 'Salary', date: '2026-07-01', account_id: 'acc' })
    expect(mockDB._account('acc').balance).toBe(180)
  })

  it('moves the credit when the account changes', async () => {
    seedAccount('a', 100)
    seedAccount('b', 100)
    const iid = await svc.addIncomeAtomic(USER, { amount: 50, category: 'Salary', date: '2026-07-01', account_id: 'a' })
    // a = 150, b = 100; move income to b → a back to 100, b += 50
    await svc.updateIncome(iid, { amount: 50, category: 'Salary', date: '2026-07-01', account_id: 'b' })
    expect(mockDB._account('a').balance).toBe(100)
    expect(mockDB._account('b').balance).toBe(150)
  })

  it('credits the account when one is added to a previously unlinked income', async () => {
    seedAccount('acc', 100)
    const iid = await svc.addIncomeAtomic(USER, { amount: 50, category: 'Salary', date: '2026-07-01' }) // no account
    expect(mockDB._account('acc').balance).toBe(100)
    await svc.updateIncome(iid, { amount: 50, category: 'Salary', date: '2026-07-01', account_id: 'acc' })
    expect(mockDB._account('acc').balance).toBe(150)
  })
})

describe('updateExpense — adjusts balance for edits', () => {
  it('applies the delta when only the amount changes on the same account', async () => {
    seedAccount('acc', 100)
    const eid = await svc.addExpenseAtomic(USER, { amount: 30, category: 'Food', date: '2026-07-01', account_id: 'acc' })
    // balance now 70; raise expense to 50 → extra 20 debit
    await svc.updateExpense(eid, { amount: 50, category: 'Food', date: '2026-07-01', account_id: 'acc' })
    expect(mockDB._account('acc').balance).toBe(50)
  })

  it('moves the debit when the account changes', async () => {
    seedAccount('a', 100)
    seedAccount('b', 100)
    const eid = await svc.addExpenseAtomic(USER, { amount: 30, category: 'Food', date: '2026-07-01', account_id: 'a' })
    // a = 70, b = 100; move expense to b → a restored to 100, b -= 30
    await svc.updateExpense(eid, { amount: 30, category: 'Food', date: '2026-07-01', account_id: 'b' })
    expect(mockDB._account('a').balance).toBe(100)
    expect(mockDB._account('b').balance).toBe(70)
  })
})

describe('atomicity — a failed transaction rolls balances back', () => {
  it('restores the account when the transfer body throws mid-way', async () => {
    seedAccount('a', 100)
    // No 'b' account seeded — but UPDATE on a missing account is a no-op in
    // both SQLite and our fake, so to force a real throw we make the second
    // runAsync reject by temporarily breaking the fake.
    const realRun = mockDB.runAsync.bind(mockDB)
    let calls = 0
    mockDB.runAsync = async (sql, params) => {
      calls++
      // Let the INSERT and the first balance UPDATE through, then blow up on
      // the credit leg — simulating a mid-transaction failure.
      if (calls === 3) throw new Error('boom')
      return realRun(sql, params)
    }
    await expect(
      svc.addTransferAtomic(USER, { from_account_id: 'a', to_account_id: 'b', amount: 40, date: '2026-07-01' })
    ).rejects.toThrow('boom')
    // The debit to 'a' that happened before the throw must have been rolled back.
    expect(mockDB._account('a').balance).toBe(100)
    // And no transfer row should survive.
    expect(mockDB._tables.transfers.length).toBe(0)
  })
})
