/**
 * Backup / restore round-trip tests for the Drive backup service.
 *
 * These exercise the REAL serialize → validate → restore primitives
 * (getAllDataFromSQLite / validateBackupData / writeAllDataToSQLite /
 * restoreAllDataToSQLite) against an in-memory fake DB that implements just the
 * subset of the expo-sqlite async API those functions use. The point is to
 * lock down the money-carrying round trip — the path where a bad backup format
 * or a mid-restore failure could silently wipe or corrupt user data — without
 * touching Google Drive, OAuth, or the network.
 *
 * Round-trip invariant under test: dump the DB → feed the dump back into
 * restore → the DB is byte-for-byte what it was. And the safety invariant:
 * a restore that throws part-way must leave the user with no LESS data than
 * they started with (the snapshot re-apply in restoreAllDataToSQLite).
 */

// ─── Fake expo-sqlite ────────────────────────────────────────────────────────
// The backup service only issues three statement shapes:
//   getAllAsync : SELECT * FROM <table> WHERE user_id = ?
//   runAsync    : DELETE FROM <table> WHERE user_id = ?
//   runAsync    : INSERT OR REPLACE INTO <table> (cols...) VALUES (?...)
// plus withTransactionAsync. Anything else throws loudly so the fake can't
// silently pass on a statement shape the service didn't actually emit.

const TABLES = [
  'expenses', 'budgets', 'recurring_expenses', 'spending_goals',
  'accounts', 'income', 'transfers', 'recurring_income',
]

function createFakeDB() {
  const tables = {}
  for (const t of TABLES) tables[t] = []

  function snapshot() {
    return JSON.parse(JSON.stringify(tables))
  }
  function restore(snap) {
    for (const k of Object.keys(tables)) tables[k] = snap[k]
  }

  const db = {
    async runAsync(sql, params = []) {
      const s = sql.trim().replace(/\s+/g, ' ')
      let m

      // INSERT OR REPLACE INTO <table> (col, col, ...) VALUES (?, ?, ...)
      if ((m = s.match(/^INSERT OR REPLACE INTO (\w+) \(([^)]+)\) VALUES/i))) {
        const table = m[1]
        const columns = m[2].split(',').map(c => c.trim())
        const row = {}
        columns.forEach((col, i) => { row[col] = params[i] })
        // OR REPLACE semantics: a row with the same id replaces the old one.
        const idx = tables[table].findIndex(r => r.id === row.id)
        if (idx >= 0) tables[table][idx] = row
        else tables[table].push(row)
        return { changes: 1 }
      }

      // DELETE FROM <table> WHERE user_id = ?
      if ((m = s.match(/^DELETE FROM (\w+) WHERE user_id = \?$/i))) {
        const table = m[1]
        const before = tables[table].length
        tables[table] = tables[table].filter(r => r.user_id !== params[0])
        return { changes: before - tables[table].length }
      }

      throw new Error(`FakeDB.runAsync: unrecognised statement shape: ${s}`)
    },

    async getAllAsync(sql, params = []) {
      const s = sql.trim().replace(/\s+/g, ' ')
      const m = s.match(/^SELECT \* FROM (\w+) WHERE user_id = \?$/i)
      if (m) {
        const table = m[1]
        // Return detached clones, like real SQLite — the caller serialises
        // these into a backup payload and must not hold live table refs.
        return tables[table].filter(r => r.user_id === params[0]).map(r => ({ ...r }))
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

    async execAsync() { /* PRAGMAs — no-op */ },

    _tables: tables,
    _rows(table) { return tables[table] },
    _reset() {
      for (const k of Object.keys(tables)) tables[k] = []
      db.runAsync = db._realRunAsync
    },
  }

  db._realRunAsync = db.runAsync
  return db
}

let mockDB

jest.mock('../lib/errorLog', () => ({ logError: jest.fn() }))
jest.mock('react-native-get-random-values', () => ({}))
// sqliteService imports uuid at module load; the shipped build is ESM-only and
// jest doesn't transform it. We never generate ids in these tests (restore
// carries ids from the backup), so a trivial stub is enough.
jest.mock('uuid', () => ({ v4: () => 'unused-in-backup-tests' }))

// Mock expo-sqlite so getDB() (in sqliteService, re-used by the backup service)
// opens OUR fake. Same seam the balance suite uses.
jest.mock('expo-sqlite', () => ({
  openDatabaseAsync: () => Promise.resolve(mockDB),
}))

// The backup module pulls in Google Sign-In, auth, and token helpers at import
// time via its public functions. We only touch the __test__ primitives, but the
// imports must resolve — stub the native/side-effecting ones.
jest.mock('@react-native-google-signin/google-signin', () => ({ GoogleSignin: {} }))
jest.mock('../lib/auth', () => ({ getUser: jest.fn(), getCachedUser: jest.fn() }))
jest.mock('../lib/googleAccessToken', () => ({
  getGoogleAccessToken: jest.fn(),
  setGoogleAccessToken: jest.fn(),
  setGoogleAccessTokenCachedAtNow: jest.fn(),
}))

mockDB = createFakeDB()

const {
  getAllDataFromSQLite,
  writeAllDataToSQLite,
  restoreAllDataToSQLite,
  validateBackupData,
} = require('./driveBackupService').__test__

const USER = 'user-1'

// A representative, fully-populated dataset touching every table the backup
// serialises. `writeAllDataToSQLite` maps `data.recurring` → recurring_expenses
// and `data.recurringIncome` → recurring_income, and `getAllDataFromSQLite`
// reads them back under those same payload keys, so the round trip must agree.
function fullDataset() {
  return {
    expenses: [
      { id: 'e1', user_id: USER, amount: 30, category: 'Food', note: 'lunch', date: '2026-07-01', is_recurring: 0, recurring_id: null, account_id: 'a1', created_at: 't', updated_at: 't' },
      { id: 'e2', user_id: USER, amount: 12.5, category: 'Transport', note: null, date: '2026-07-02', is_recurring: 0, recurring_id: null, account_id: 'a1', created_at: 't', updated_at: 't' },
    ],
    budgets: [
      { id: 'b1', user_id: USER, category: 'Food', limit_amount: 500, month: '2026-07', created_at: 't', updated_at: 't' },
    ],
    recurring: [
      { id: 'r1', user_id: USER, amount: 9.99, category: 'Subscriptions', note: 'music', frequency: 'monthly', next_due: '2026-08-01', last_logged: '2026-07-01', is_active: 1, account_id: 'a1', anchor_day: 1, created_at: 't', updated_at: 't' },
    ],
    goals: [
      { id: 'g1', user_id: USER, title: 'Emergency fund', target_amount: 10000, current_amount: 2500, deadline: '2026-12-31', created_at: 't', updated_at: 't' },
    ],
    accounts: [
      { id: 'a1', user_id: USER, name: 'Checking', type: 'bank', balance: 1234.56, currency: 'USD', created_at: 't', updated_at: 't' },
      { id: 'a2', user_id: USER, name: 'Savings', type: 'bank', balance: 5000, currency: 'USD', created_at: 't', updated_at: 't' },
    ],
    income: [
      { id: 'i1', user_id: USER, amount: 3000, category: 'Salary', note: null, date: '2026-07-01', account_id: 'a1', created_at: 't', updated_at: 't' },
    ],
    transfers: [
      { id: 't1', user_id: USER, from_account_id: 'a1', to_account_id: 'a2', amount: 200, note: 'save', date: '2026-07-03', created_at: 't', updated_at: 't' },
    ],
    recurringIncome: [
      { id: 'ri1', user_id: USER, amount: 3000, category: 'Salary', note: null, frequency: 'monthly', next_due: '2026-08-01', last_logged: '2026-07-01', is_active: 1, account_id: 'a1', anchor_day: 1, created_at: 't', updated_at: 't' },
    ],
  }
}

// Seed the fake DB directly (bypassing the service) from a dataset shaped like
// getAllDataFromSQLite's OUTPUT, so we can then dump-and-compare.
function seed(data) {
  const map = {
    expenses: 'expenses',
    budgets: 'budgets',
    recurring: 'recurring_expenses',
    goals: 'spending_goals',
    accounts: 'accounts',
    income: 'income',
    transfers: 'transfers',
    recurringIncome: 'recurring_income',
  }
  for (const [key, table] of Object.entries(map)) {
    for (const row of (data[key] || [])) mockDB._tables[table].push({ ...row })
  }
}

beforeEach(() => {
  mockDB._reset()
})

describe('validateBackupData — gate on malformed payloads', () => {
  it('accepts a well-formed dataset', () => {
    expect(() => validateBackupData(fullDataset())).not.toThrow()
  })

  it('accepts a dataset with entirely missing (optional) tables', () => {
    expect(() => validateBackupData({ expenses: [] })).not.toThrow()
  })

  it('rejects a table that is not an array', () => {
    expect(() => validateBackupData({ expenses: { nope: true } }))
      .toThrow(/not an array/)
  })

  it('rejects a row missing a required field', () => {
    expect(() => validateBackupData({ expenses: [{ id: 'e1', amount: 1, category: 'X' /* no date */ }] }))
      .toThrow(/missing required field "date"/)
  })

  it('rejects a null row inside an otherwise valid table', () => {
    expect(() => validateBackupData({ accounts: [null] }))
      .toThrow(/non-object row/)
  })

  it('accepts recurring rows with a valid frequency', () => {
    expect(() => validateBackupData({
      recurring: [{ id: 'r1', amount: 5, category: 'Rent', frequency: 'monthly', next_due: '2026-08-31' }],
      recurringIncome: [{ id: 'ri1', amount: 5, category: 'Salary', frequency: 'weekly', next_due: '2026-08-01' }],
    })).not.toThrow()
  })

  it('rejects a recurring row with an out-of-range frequency (would hang the process)', () => {
    expect(() => validateBackupData({
      recurring: [{ id: 'r1', amount: 5, category: 'Rent', frequency: 'yearly', next_due: '2026-08-31' }],
    })).toThrow(/invalid frequency/)
  })

  it('rejects a recurring income row with an out-of-range frequency', () => {
    expect(() => validateBackupData({
      recurringIncome: [{ id: 'ri1', amount: 5, category: 'Salary', frequency: 'once', next_due: '2026-08-01' }],
    })).toThrow(/invalid frequency/)
  })
})

describe('backup → restore round trip', () => {
  it('dumps and restores every table byte-for-byte', async () => {
    seed(fullDataset())
    const dumped = await getAllDataFromSQLite(USER)

    // Wipe, then restore from the dump.
    mockDB._reset()
    await restoreAllDataToSQLite(USER, dumped)

    const redumped = await getAllDataFromSQLite(USER)
    expect(redumped).toEqual(dumped)
  })

  it('preserves exact monetary amounts (no float drift, no coercion)', async () => {
    seed(fullDataset())
    const dumped = await getAllDataFromSQLite(USER)
    mockDB._reset()
    await restoreAllDataToSQLite(USER, dumped)
    const redumped = await getAllDataFromSQLite(USER)

    expect(redumped.expenses.find(e => e.id === 'e2').amount).toBe(12.5)
    expect(redumped.accounts.find(a => a.id === 'a1').balance).toBe(1234.56)
    expect(redumped.recurring.find(r => r.id === 'r1').amount).toBe(9.99)
  })

  it('is idempotent — restoring the same backup twice yields the same DB', async () => {
    seed(fullDataset())
    const dumped = await getAllDataFromSQLite(USER)

    await restoreAllDataToSQLite(USER, dumped)
    const afterFirst = await getAllDataFromSQLite(USER)
    await restoreAllDataToSQLite(USER, dumped)
    const afterSecond = await getAllDataFromSQLite(USER)

    expect(afterSecond).toEqual(afterFirst)
  })

  it('replaces existing data rather than appending (no duplicate rows)', async () => {
    seed(fullDataset())
    // Restore a backup that has only ONE expense; the two seeded ones must go.
    const oneExpense = { expenses: [{ id: 'e9', amount: 5, category: 'Snack', date: '2026-07-05' }] }
    await restoreAllDataToSQLite(USER, oneExpense)

    const dump = await getAllDataFromSQLite(USER)
    expect(dump.expenses.map(e => e.id)).toEqual(['e9'])
    // Other tables emptied because the backup omitted them and restore wipes first.
    expect(dump.accounts).toEqual([])
  })

  it('backfills anchor_day from next_due when a legacy backup omits it', async () => {
    // Backups made before the anchor_day column existed carry no such field.
    // Restore must derive it from the day-of-month of next_due so month-end
    // recurring rules stop drifting after the upgrade.
    await restoreAllDataToSQLite(USER, {
      recurring: [{ id: 'r9', amount: 5, category: 'Rent', frequency: 'monthly', next_due: '2026-08-31' }],
      recurringIncome: [{ id: 'ri9', amount: 5, category: 'Salary', frequency: 'monthly', next_due: '2026-08-29' }],
    })
    const dump = await getAllDataFromSQLite(USER)
    expect(dump.recurring.find(r => r.id === 'r9').anchor_day).toBe(31)
    expect(dump.recurringIncome.find(r => r.id === 'ri9').anchor_day).toBe(29)
  })

  it('does not touch another user\'s rows', async () => {
    seed(fullDataset())
    mockDB._tables.expenses.push({ id: 'other', user_id: 'user-2', amount: 1, category: 'X', date: '2026-07-01' })

    await restoreAllDataToSQLite(USER, { expenses: [{ id: 'e1', amount: 30, category: 'Food', date: '2026-07-01' }] })

    // user-2's row survives; user-1's set is exactly the restored one.
    expect(mockDB._tables.expenses.find(r => r.id === 'other')).toBeTruthy()
    const mine = mockDB._tables.expenses.filter(r => r.user_id === USER)
    expect(mine.map(r => r.id)).toEqual(['e1'])
  })
})

describe('restore safety — a failed restore does not lose existing data', () => {
  it('re-applies the pre-restore snapshot when the write throws mid-way', async () => {
    seed(fullDataset())
    const before = await getAllDataFromSQLite(USER)

    // A payload that passes validateBackupData but blows up during the write:
    // make the fake reject the FIRST time it reaches the income INSERT,
    // simulating a mid-restore failure after several tables were already
    // rewritten. The recovery path (re-applying the pre-restore snapshot) must
    // still succeed, so we only fail once — later income INSERTs go through.
    const realRun = mockDB.runAsync.bind(mockDB)
    let failed = false
    mockDB.runAsync = async (sql, params) => {
      if (!failed && /INSERT OR REPLACE INTO income/i.test(sql)) {
        failed = true
        throw new Error('disk full')
      }
      return realRun(sql, params)
    }

    const badBackup = {
      expenses: [{ id: 'x1', amount: 1, category: 'Y', date: '2026-07-09' }],
      income: [{ id: 'ix', amount: 1, category: 'Z', date: '2026-07-09' }],
    }

    await expect(restoreAllDataToSQLite(USER, badBackup)).rejects.toThrow('disk full')

    // Repair the fake so we can read back cleanly.
    mockDB.runAsync = realRun

    const after = await getAllDataFromSQLite(USER)
    // The user must have exactly what they started with — not the half-written
    // bad backup, and not an empty DB.
    expect(after).toEqual(before)
  })

  it('rejects an invalid backup before deleting anything', async () => {
    seed(fullDataset())
    const before = await getAllDataFromSQLite(USER)

    // Missing required "date" on the expense → validateBackupData throws before
    // any DELETE runs.
    await expect(
      restoreAllDataToSQLite(USER, { expenses: [{ id: 'z1', amount: 1, category: 'Q' }] })
    ).rejects.toThrow(/missing required field/)

    const after = await getAllDataFromSQLite(USER)
    expect(after).toEqual(before)
  })
})
