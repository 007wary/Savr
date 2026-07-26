import * as SQLite from 'expo-sqlite'
import 'react-native-get-random-values'
import { v4 as uuidv4 } from 'uuid'

let db = null
let opening = null
let initPromise = null

function isBusyError(e) {
  const msg = (e?.message || '').toLowerCase()
  return msg.includes('busy') || msg.includes('locked') || msg.includes('3850') || e?.code === 10
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function runWithRetry(database, sql, params = []) {
  const delays = [50, 100, 200]
  for (let attempt = 0; attempt <= 3; attempt++) {
    try {
      return await database.runAsync(sql, params)
    } catch (e) {
      if (isBusyError(e) && attempt < 3) {
        await sleep(delays[attempt])
        continue
      }
      throw e
    }
  }
}

export const getDB = async () => {
  if (opening) return opening
  if (db) return db
  try {
    opening = SQLite.openDatabaseAsync('savr.db')
    db = await opening
    await db.execAsync('PRAGMA busy_timeout = 5000;')
    return db
  } finally {
    opening = null
  }
}

// Runs the actual open + migrations + table/index creation. Memoized via
// initPromise so it executes exactly once per app run no matter how many
// callers race it on cold launch.
const runInit = async () => {
  const database = await getDB()

  // Migration: add account_id to recurring tables if missing
  try {
    await database.execAsync(`ALTER TABLE recurring_expenses ADD COLUMN account_id TEXT`)
  } catch {}
  try {
    await database.execAsync(`ALTER TABLE recurring_income ADD COLUMN account_id TEXT`)
  } catch {}

  // Migration: add anchor_day (1–31) so monthly rules created on the 29th–31st
  // don't permanently drift to an earlier day after a short month. Existing
  // rows are backfilled from the day-of-month of their current next_due, which
  // is correct for any rule that hasn't drifted yet.
  try {
    await database.execAsync(`ALTER TABLE recurring_expenses ADD COLUMN anchor_day INTEGER`)
    await database.execAsync(`UPDATE recurring_expenses SET anchor_day = CAST(strftime('%d', next_due) AS INTEGER) WHERE anchor_day IS NULL AND next_due IS NOT NULL`)
  } catch {}
  try {
    await database.execAsync(`ALTER TABLE recurring_income ADD COLUMN anchor_day INTEGER`)
    await database.execAsync(`UPDATE recurring_income SET anchor_day = CAST(strftime('%d', next_due) AS INTEGER) WHERE anchor_day IS NULL AND next_due IS NOT NULL`)
  } catch {}

  await database.execAsync(`
    PRAGMA journal_mode = WAL;
    PRAGMA busy_timeout = 5000;

    CREATE TABLE IF NOT EXISTS expenses (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      amount REAL NOT NULL,
      category TEXT NOT NULL,
      note TEXT,
      date TEXT NOT NULL,
      is_recurring INTEGER DEFAULT 0,
      recurring_id TEXT,
      account_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS budgets (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      category TEXT NOT NULL,
      limit_amount REAL NOT NULL,
      month TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS recurring_expenses (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      amount REAL NOT NULL,
      category TEXT NOT NULL,
      note TEXT,
      frequency TEXT NOT NULL,
      next_due TEXT NOT NULL,
      last_logged TEXT,
      is_active INTEGER DEFAULT 1,
      anchor_day INTEGER,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS spending_goals (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      title TEXT NOT NULL,
      target_amount REAL NOT NULL,
      current_amount REAL DEFAULT 0,
      deadline TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS app_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    -- Per-user learned category mappings. When a user overrides the keyword
    -- detector (picks a category different from what we auto-detected), we
    -- remember the note token -> category so next time we get it right. The
    -- count column lets a repeated correction outrank a one-off. Local per device.
    CREATE TABLE IF NOT EXISTS learned_categories (
      user_id TEXT NOT NULL,
      token TEXT NOT NULL,
      category TEXT NOT NULL,
      count INTEGER DEFAULT 1,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (user_id, token)
    );
    CREATE INDEX IF NOT EXISTS idx_learned_user ON learned_categories(user_id);
    CREATE INDEX IF NOT EXISTS idx_expenses_user_id ON expenses(user_id);
    CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(date);
    CREATE INDEX IF NOT EXISTS idx_expenses_user_date ON expenses(user_id, date);
    CREATE INDEX IF NOT EXISTS idx_expenses_category ON expenses(user_id, category);
    CREATE INDEX IF NOT EXISTS idx_budgets_user_month ON budgets(user_id, month);
    CREATE INDEX IF NOT EXISTS idx_recurring_user ON recurring_expenses(user_id, is_active);
    CREATE INDEX IF NOT EXISTS idx_goals_user ON spending_goals(user_id);

    CREATE TABLE IF NOT EXISTS accounts (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      balance REAL DEFAULT 0,
      currency TEXT DEFAULT 'USD',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS income (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      amount REAL NOT NULL,
      category TEXT NOT NULL,
      note TEXT,
      date TEXT NOT NULL,
      account_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS transfers (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      from_account_id TEXT NOT NULL,
      to_account_id TEXT NOT NULL,
      amount REAL NOT NULL,
      note TEXT,
      date TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_transfers_user ON transfers(user_id);

    CREATE TABLE IF NOT EXISTS recurring_income (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      amount REAL NOT NULL,
      category TEXT NOT NULL,
      note TEXT,
      frequency TEXT NOT NULL,
      next_due TEXT NOT NULL,
      last_logged TEXT,
      is_active INTEGER DEFAULT 1,
      anchor_day INTEGER,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_recurring_income_user ON recurring_income(user_id, is_active);
    CREATE INDEX IF NOT EXISTS idx_accounts_user ON accounts(user_id);
    CREATE INDEX IF NOT EXISTS idx_income_user_id ON income(user_id);
    CREATE INDEX IF NOT EXISTS idx_income_date ON income(user_id, date);

    -- Manual balance corrections. When the user sets an account balance by
    -- hand (e.g. bank says 1234, correct the tracked balance), we record the
    -- difference as a signed delta ledger row rather than silently overwriting
    -- the balance column, so account history explains the jump and the
    -- every-balance-move-has-a-row invariant holds. The delta is applied to
    -- accounts.balance in the same transaction (addAdjustmentAtomic).
    CREATE TABLE IF NOT EXISTS account_adjustments (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      account_id TEXT NOT NULL,
      delta REAL NOT NULL,
      note TEXT,
      date TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_adjustments_user ON account_adjustments(user_id);
  `)

  return database
}

// Idempotent: the first call kicks off runInit(); every subsequent call (and
// every query via getReadyDB) awaits the same promise. If init fails the
// promise is cleared so a later call can retry.
export const initializeDatabase = async () => {
  if (!initPromise) {
    initPromise = runInit().catch((e) => { initPromise = null; throw e })
  }
  return initPromise
}

// Every read/write goes through this instead of getDB() so no query can run
// against a half-migrated schema on cold launch — they all wait for the
// tables/indexes to exist first. On a warm run initPromise is already
// resolved, so this is a cheap await. Exported so out-of-module callers (e.g.
// the Drive backup service, which dumps/restores the whole DB) get the same
// migration guarantee rather than racing runInit() via a raw getDB().
export const getReadyDB = async () => {
  await initializeDatabase()
  return db
}

// ─── HELPERS ────────────────────────────────────────────────
const now = () => new Date().toISOString()
const id = () => uuidv4()

// Adjusts an account's balance by `delta`, but only if the account row still
// exists. Account deletion unlinks references (deleteAccount), yet a stale
// account_id can survive on restored/imported rows where no matching account
// was restored; mutating a nonexistent account would silently lose money.
// Returns true if a row was updated. Must be called inside a transaction.
async function adjustAccountBalanceIfExists(database, accountId, delta) {
  if (!accountId || delta === 0) return false
  const acc = await database.getFirstAsync(`SELECT id FROM accounts WHERE id = ?`, [accountId])
  if (!acc) return false
  await runWithRetry(database,
    `UPDATE accounts SET balance = balance + ?, updated_at = ? WHERE id = ?`,
    [delta, now(), accountId]
  )
  return true
}

export async function addExpenseAtomic(userId, { amount, category, note, date, is_recurring = 0, recurring_id = null, account_id = null }) {
  const database = await getReadyDB()
  const newId = id()
  const ts = now()
  await database.withTransactionAsync(async () => {
    await runWithRetry(database,
      `INSERT INTO expenses (id, user_id, amount, category, note, date, is_recurring, recurring_id, account_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [newId, userId, amount, category, note || null, date, is_recurring ? 1 : 0, recurring_id, account_id, ts, ts]
    )
    if (account_id) {
      await runWithRetry(database,
        `UPDATE accounts SET balance = balance + ?, updated_at = ? WHERE id = ?`,
        [-amount, now(), account_id]
      )
    }
  })
  return newId
}

// Cheap existence check (not a full row fetch) — used to tell a genuinely
// first-time user (empty ledger) from a returning one, e.g. to route the
// post-login redirect straight into "add your first expense" instead of an
// empty dashboard.
export async function hasAnyLedgerEntries(userId) {
  const database = await getReadyDB()
  const row = await database.getFirstAsync(
    `SELECT EXISTS(SELECT 1 FROM expenses WHERE user_id = ?) OR EXISTS(SELECT 1 FROM income WHERE user_id = ?) AS present`,
    [userId, userId]
  )
  return !!row?.present
}

export async function getExpenses(userId, { month } = {}) {
  const database = await getReadyDB()
  if (month) {
    return await database.getAllAsync(
      `SELECT * FROM expenses WHERE user_id = ? AND date LIKE ? ORDER BY date DESC, created_at DESC`,
      [userId, `${month}%`]
    )
  }
  return await database.getAllAsync(
    `SELECT * FROM expenses WHERE user_id = ? ORDER BY date DESC, created_at DESC`,
    [userId]
  )
}

export async function updateExpense(id, { amount, category, note, date, account_id }) {
  const database = await getReadyDB()
  await database.withTransactionAsync(async () => {
    const existing = await database.getFirstAsync(`SELECT amount, account_id FROM expenses WHERE id = ?`, [id])
    const newAccountId = account_id === undefined ? existing?.account_id ?? null : (account_id || null)
    await runWithRetry(database,
      `UPDATE expenses SET amount = ?, category = ?, note = ?, date = ?, account_id = ?, updated_at = ? WHERE id = ?`,
      [amount, category, note || null, date, newAccountId, now(), id]
    )
    if (existing) {
      if (existing.account_id && existing.account_id !== newAccountId) {
        // Account changed — restore the old account's debit entirely
        await adjustAccountBalanceIfExists(database, existing.account_id, existing.amount)
        if (newAccountId) {
          await adjustAccountBalanceIfExists(database, newAccountId, -amount)
        }
      } else if (existing.account_id && existing.account_id === newAccountId) {
        const delta = existing.amount - amount
        await adjustAccountBalanceIfExists(database, newAccountId, delta)
      } else if (!existing.account_id && newAccountId) {
        await adjustAccountBalanceIfExists(database, newAccountId, -amount)
      }
    }
  })
}

// Deletes an expense and restores the debit to its account atomically, so the
// balance can't drift if a caller forgets to reverse it (an expense debits the
// account, so deleting must credit it back by the same amount).
export async function deleteExpenseAtomic(id) {
  const database = await getReadyDB()
  await database.withTransactionAsync(async () => {
    const existing = await database.getFirstAsync(
      `SELECT amount, account_id FROM expenses WHERE id = ?`, [id]
    )
    await runWithRetry(database, `DELETE FROM expenses WHERE id = ?`, [id])
    if (existing?.account_id) {
      await runWithRetry(database,
        `UPDATE accounts SET balance = balance + ?, updated_at = ? WHERE id = ?`,
        [existing.amount, now(), existing.account_id]
      )
    }
  })
}

export async function getExpenseSummary(userId, month) {
  const database = await getReadyDB()
  return await database.getAllAsync(
    `SELECT category, SUM(amount) as total FROM expenses
     WHERE user_id = ? AND date LIKE ?
     GROUP BY category ORDER BY total DESC`,
    [userId, `${month}%`]
  )
}

export async function getMonthlyTotal(userId, month) {
  const database = await getReadyDB()
  const result = await database.getFirstAsync(
    `SELECT SUM(amount) as total FROM expenses WHERE user_id = ? AND date LIKE ?`,
    [userId, `${month}%`]
  )
  return result?.total || 0
}

// ─── BUDGETS ────────────────────────────────────────────────
export async function getBudgets(userId, month) {
  const database = await getReadyDB()
  return await database.getAllAsync(
    `SELECT * FROM budgets WHERE user_id = ? AND month = ?`,
    [userId, month]
  )
}

export async function saveBudget(userId, { category, limit_amount, month }) {
  const database = await getReadyDB()
  const existing = await database.getFirstAsync(
    `SELECT id FROM budgets WHERE user_id = ? AND category = ? AND month = ?`,
    [userId, category, month]
  )
  if (existing) {
    await runWithRetry(database,
      `UPDATE budgets SET limit_amount = ?, updated_at = ? WHERE id = ?`,
      [limit_amount, now(), existing.id]
    )
    return existing.id
  } else {
    const newId = id()
    const ts = now()
    await runWithRetry(database,
      `INSERT INTO budgets (id, user_id, category, limit_amount, month, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [newId, userId, category, limit_amount, month, ts, ts]
    )
    return newId
  }
}

export async function deleteBudget(id) {
  const database = await getReadyDB()
  await runWithRetry(database,`DELETE FROM budgets WHERE id = ?`, [id])
}

// ─── RECURRING ──────────────────────────────────────────────
export async function getRecurring(userId) {
  const database = await getReadyDB()
  return await database.getAllAsync(
    `SELECT * FROM recurring_expenses WHERE user_id = ? AND is_active = 1 ORDER BY created_at DESC`,
    [userId]
  )
}

// The day-of-month a recurring rule anchors to, parsed from its first due date
// ("YYYY-MM-DD" → 1–31). Stored so monthly rollover can re-anchor each month
// instead of drifting after a short month. Null for non-parseable dates.
function anchorDayFromDate(dateStr) {
  const day = parseInt(String(dateStr || '').slice(8, 10), 10)
  return Number.isFinite(day) && day >= 1 && day <= 31 ? day : null
}

export async function addRecurring(userId, { amount, category, note, frequency, next_due, account_id = null }) {
  const database = await getReadyDB()
  const newId = id()
  const ts = now()
  await runWithRetry(database,
    `INSERT INTO recurring_expenses (id, user_id, amount, category, note, frequency, next_due, last_logged, is_active, account_id, anchor_day, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, null, 1, ?, ?, ?, ?)`,
    [newId, userId, amount, category, note || null, frequency, next_due, account_id, anchorDayFromDate(next_due), ts, ts]
  )
  return newId
}

export async function updateRecurringAfterLog(id, nextDue, lastLogged) {
  const database = await getReadyDB()
  await runWithRetry(database,
    `UPDATE recurring_expenses SET next_due = ?, last_logged = ?, updated_at = ? WHERE id = ?`,
    [nextDue, lastLogged, now(), id]
  )
}

// User-facing edit of a recurring rule (amount/note/frequency). next_due itself
// is a valid calendar date under any frequency, so it is left untouched.
//
// anchor_day is PRESERVED, not re-derived: once a monthly rule set on the 31st
// has drifted its next_due to a short month (e.g. Feb 28), re-deriving the
// anchor from next_due would rewrite it to 28 and lose the original intent the
// column exists to protect. Only backfill it from next_due when the row has no
// anchor yet (a legacy row created before the column existed).
export async function updateRecurringExpense(id, { amount, note, frequency }) {
  const database = await getReadyDB()
  const existing = await database.getFirstAsync(
    `SELECT anchor_day, next_due FROM recurring_expenses WHERE id = ?`, [id]
  )
  const anchorDay = existing?.anchor_day ?? anchorDayFromDate(existing?.next_due)
  await runWithRetry(database,
    `UPDATE recurring_expenses SET amount = ?, note = ?, frequency = ?, anchor_day = ?, updated_at = ? WHERE id = ?`,
    [amount, note || null, frequency, anchorDay, now(), id]
  )
}

// Logs all due occurrences for one recurring expense and updates its next_due/last_logged
// atomically in a single DB transaction, so a crash mid-run can't leave balances
// updated without the rule advancing (or vice versa).
export async function processRecurringExpenseItemAtomic(userId, item, todayStr, calculateNextDue) {
  const database = await getReadyDB()
  let logged = 0
  const anchorDay = item.anchor_day || anchorDayFromDate(item.next_due)
  await database.withTransactionAsync(async () => {
    let currentDue = item.next_due
    let lastLogged = item.last_logged

    while (currentDue <= todayStr) {
      if (lastLogged === currentDue) {
        currentDue = calculateNextDue(currentDue, item.frequency, anchorDay)
        continue
      }

      const newId = id()
      const ts = now()
      await runWithRetry(database,
        `INSERT INTO expenses (id, user_id, amount, category, note, date, is_recurring, recurring_id, account_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)`,
        [newId, userId, item.amount, item.category, item.note || `Auto: ${item.category}`, currentDue, item.id, item.account_id || null, ts, ts]
      )
      if (item.account_id) {
        await runWithRetry(database,
          `UPDATE accounts SET balance = balance + ?, updated_at = ? WHERE id = ?`,
          [-item.amount, now(), item.account_id]
        )
      }

      lastLogged = currentDue
      currentDue = calculateNextDue(currentDue, item.frequency, anchorDay)
      logged++
    }

    await runWithRetry(database,
      `UPDATE recurring_expenses SET next_due = ?, last_logged = ?, updated_at = ? WHERE id = ?`,
      [currentDue, lastLogged, now(), item.id]
    )
  })
  return logged
}

export async function deleteRecurring(id) {
  const database = await getReadyDB()
  await runWithRetry(database,
    `UPDATE recurring_expenses SET is_active = 0, updated_at = ? WHERE id = ?`,
    [now(), id]
  )
}

export async function getInactiveRecurring(userId) {
  const database = await getReadyDB()
  return await database.getAllAsync(
    `SELECT * FROM recurring_expenses WHERE user_id = ? AND is_active = 0 ORDER BY updated_at DESC`,
    [userId]
  )
}

export async function permanentDeleteRecurring(id) {
  const database = await getReadyDB()
  await runWithRetry(database,`DELETE FROM recurring_expenses WHERE id = ?`, [id])
}

// ─── SPENDING GOALS ─────────────────────────────────────────
export async function getSpendingGoal(userId) {
  const database = await getReadyDB()
  return await database.getFirstAsync(
    `SELECT * FROM spending_goals WHERE user_id = ? ORDER BY created_at DESC LIMIT 1`,
    [userId]
  )
}

export async function saveSpendingGoal(userId, { title, target_amount, deadline }) {
  const database = await getReadyDB()
  const existing = await getSpendingGoal(userId)
  if (existing) {
    await runWithRetry(database,
      `UPDATE spending_goals SET title = ?, target_amount = ?, deadline = ?, updated_at = ? WHERE id = ?`,
      [title, target_amount, deadline || null, now(), existing.id]
    )
    return existing.id
  } else {
    const newId = id()
    const ts = now()
    await runWithRetry(database,
      `INSERT INTO spending_goals (id, user_id, title, target_amount, current_amount, deadline, created_at, updated_at)
       VALUES (?, ?, ?, ?, 0, ?, ?, ?)`,
      [newId, userId, title, target_amount, deadline || null, ts, ts]
    )
    return newId
  }
}

export async function deleteSpendingGoal(userId) {
  const database = await getReadyDB()
  await runWithRetry(database,`DELETE FROM spending_goals WHERE user_id = ?`, [userId])
}

// ─── APP META ───────────────────────────────────────────────
export async function getMeta(key) {
  const database = await getReadyDB()
  const result = await database.getFirstAsync(`SELECT value FROM app_meta WHERE key = ?`, [key])
  return result?.value || null
}

export async function setMeta(key, value) {
  const database = await getReadyDB()
  await runWithRetry(database,
    `INSERT OR REPLACE INTO app_meta (key, value) VALUES (?, ?)`,
    [key, String(value)]
  )
}

// ─── LEARNED CATEGORIES ─────────────────────────────────────
// Load the whole per-user map once (it's tiny) so the detector can run
// synchronously on every keystroke without hitting the DB each time.
export async function getLearnedCategories(userId) {
  const database = await getReadyDB()
  const rows = await database.getAllAsync(
    `SELECT token, category, count FROM learned_categories WHERE user_id = ?`,
    [userId]
  )
  return rows || []
}

// Record that `tokens` (words from a note) map to `category`. Called when the
// user picks a category that differs from what we auto-detected. Upserts and
// bumps the count so a repeated correction wins over a stale one.
export async function learnCategory(userId, tokens, category) {
  if (!userId || !category || !Array.isArray(tokens) || tokens.length === 0) return
  const database = await getReadyDB()
  const ts = now()
  for (const token of tokens) {
    if (!token || token.length < 3) continue
    await runWithRetry(database,
      `INSERT INTO learned_categories (user_id, token, category, count, updated_at)
       VALUES (?, ?, ?, 1, ?)
       ON CONFLICT(user_id, token) DO UPDATE SET
         category = excluded.category,
         count = CASE WHEN learned_categories.category = excluded.category
                      THEN learned_categories.count + 1 ELSE 1 END,
         updated_at = excluded.updated_at`,
      [userId, token, category, ts]
    )
  }
}

// Daily expense totals for the current month, used by the spending forecast.
// Returns [{ date, total }] for the given YYYY-MM month key.
export async function getDailyExpenseTotals(userId, month) {
  const database = await getReadyDB()
  const rows = await database.getAllAsync(
    `SELECT date, SUM(amount) AS total FROM expenses
     WHERE user_id = ? AND date LIKE ? GROUP BY date ORDER BY date`,
    [userId, `${month}%`]
  )
  return rows || []
}

// ─── ACCOUNTS ───────────────────────────────────────────────
export async function addAccount(userId, { name, type, balance = 0, currency = 'USD' }) {
  const database = await getReadyDB()
  const newId = id()
  const ts = now()
  await runWithRetry(database,
    `INSERT INTO accounts (id, user_id, name, type, balance, currency, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [newId, userId, name, type, balance, currency, ts, ts]
  )
  return newId
}

export async function getAccounts(userId) {
  const database = await getReadyDB()
  return await database.getAllAsync(
    `SELECT * FROM accounts WHERE user_id = ? ORDER BY created_at ASC`,
    [userId]
  )
}

export async function getAccountsTotal(userId) {
  const database = await getReadyDB()
  const result = await database.getFirstAsync(
    `SELECT SUM(balance) as total, COUNT(*) as count FROM accounts WHERE user_id = ?`,
    [userId]
  )
  return { total: result?.total || 0, count: result?.count || 0 }
}

// Editing an account's metadata must NOT clobber its running balance, which is
// maintained by relative deltas from every linked expense/income/transfer. So
// `balance` is only written when the caller explicitly passes it (i.e. the user
// changed the balance field); omit it and the transaction-driven value is kept.
export async function updateAccount(id, { name, type, balance, currency }) {
  const database = await getReadyDB()
  if (balance === undefined) {
    await runWithRetry(database,
      `UPDATE accounts SET name = ?, type = ?, currency = ?, updated_at = ? WHERE id = ?`,
      [name, type, currency, now(), id]
    )
  } else {
    await runWithRetry(database,
      `UPDATE accounts SET name = ?, type = ?, balance = ?, currency = ?, updated_at = ? WHERE id = ?`,
      [name, type, balance, currency, now(), id]
    )
  }
}

export async function updateAccountBalance(id, delta) {
  const database = await getReadyDB()
  await runWithRetry(database,
    `UPDATE accounts SET balance = balance + ?, updated_at = ? WHERE id = ?`,
    [delta, now(), id]
  )
}

// Deleting an account would otherwise leave expenses/income pointing at a
// nonexistent account_id and transfers with no valid endpoint, so unlink/remove
// those references in the same transaction as the account deletion.
export async function deleteAccount(id) {
  const database = await getReadyDB()
  await database.withTransactionAsync(async () => {
    await runWithRetry(database, `UPDATE expenses SET account_id = NULL WHERE account_id = ?`, [id])
    await runWithRetry(database, `UPDATE income SET account_id = NULL WHERE account_id = ?`, [id])
    await runWithRetry(database, `UPDATE recurring_expenses SET account_id = NULL WHERE account_id = ?`, [id])
    await runWithRetry(database, `UPDATE recurring_income SET account_id = NULL WHERE account_id = ?`, [id])
    await runWithRetry(database, `DELETE FROM transfers WHERE from_account_id = ? OR to_account_id = ?`, [id, id])
    // Adjustments belong to a single account; when it's gone they have no
    // meaning (and their delta already lived only in this account's balance),
    // so remove them rather than orphaning them like expense/income rows.
    await runWithRetry(database, `DELETE FROM account_adjustments WHERE account_id = ?`, [id])
    await runWithRetry(database, `DELETE FROM accounts WHERE id = ?`, [id])
  })
}

// ─── INCOME ─────────────────────────────────────────────────
export async function addIncomeAtomic(userId, { amount, category, note, date, account_id = null }) {
  const database = await getReadyDB()
  const newId = id()
  const ts = now()
  await database.withTransactionAsync(async () => {
    await runWithRetry(database,
      `INSERT INTO income (id, user_id, amount, category, note, date, account_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [newId, userId, amount, category, note || null, date, account_id, ts, ts]
    )
    if (account_id) {
      await runWithRetry(database,
        `UPDATE accounts SET balance = balance + ?, updated_at = ? WHERE id = ?`,
        [amount, now(), account_id]
      )
    }
  })
  return newId
}

export async function getIncome(userId) {
  const database = await getReadyDB()
  return await database.getAllAsync(
    `SELECT * FROM income WHERE user_id = ? ORDER BY date DESC, created_at DESC`,
    [userId]
  )
}

export async function getIncomeByMonth(userId, month) {
  const database = await getReadyDB()
  return await database.getAllAsync(
    `SELECT * FROM income WHERE user_id = ? AND date LIKE ? ORDER BY date DESC, created_at DESC`,
    [userId, `${month}%`]
  )
}

export async function getMonthlyIncomeTotal(userId, month) {
  const database = await getReadyDB()
  const result = await database.getFirstAsync(
    `SELECT SUM(amount) as total FROM income WHERE user_id = ? AND date LIKE ?`,
    [userId, `${month}%`]
  )
  return result?.total || 0
}

export async function getTodayIncomeTotal(userId, date) {
  const database = await getReadyDB()
  const result = await database.getFirstAsync(
    `SELECT SUM(amount) as total FROM income WHERE user_id = ? AND date = ?`,
    [userId, date]
  )
  return result?.total || 0
}

export async function updateIncome(id, { amount, category, note, date, account_id }) {
  const database = await getReadyDB()
  const newAccountId = account_id || null
  await database.withTransactionAsync(async () => {
    const existing = await database.getFirstAsync(`SELECT amount, account_id FROM income WHERE id = ?`, [id])
    await runWithRetry(database,
      `UPDATE income SET amount = ?, category = ?, note = ?, date = ?, account_id = ?, updated_at = ? WHERE id = ?`,
      [amount, category, note || null, date, newAccountId, now(), id]
    )
    if (existing) {
      if (existing.account_id && existing.account_id !== newAccountId) {
        // Account changed — reverse the old account's credit entirely
        await adjustAccountBalanceIfExists(database, existing.account_id, -existing.amount)
        if (newAccountId) {
          await adjustAccountBalanceIfExists(database, newAccountId, amount)
        }
      } else if (existing.account_id && existing.account_id === newAccountId) {
        const delta = amount - existing.amount
        await adjustAccountBalanceIfExists(database, newAccountId, delta)
      } else if (!existing.account_id && newAccountId) {
        await adjustAccountBalanceIfExists(database, newAccountId, amount)
      }
    }
  })
}

// Deletes an income row and reverses the credit to its account atomically
// (income credits the account, so deleting must debit it back).
export async function deleteIncomeAtomic(id) {
  const database = await getReadyDB()
  await database.withTransactionAsync(async () => {
    const existing = await database.getFirstAsync(
      `SELECT amount, account_id FROM income WHERE id = ?`, [id]
    )
    await runWithRetry(database, `DELETE FROM income WHERE id = ?`, [id])
    if (existing?.account_id) {
      await runWithRetry(database,
        `UPDATE accounts SET balance = balance - ?, updated_at = ? WHERE id = ?`,
        [existing.amount, now(), existing.account_id]
      )
    }
  })
}

// ─── TRANSFERS ──────────────────────────────────────────────
export async function addTransferAtomic(userId, { from_account_id, to_account_id, amount, note, date }) {
  const database = await getReadyDB()
  const newId = id()
  const ts = now()
  await database.withTransactionAsync(async () => {
    await runWithRetry(database,
      `INSERT INTO transfers (id, user_id, from_account_id, to_account_id, amount, note, date, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [newId, userId, from_account_id, to_account_id, amount, note || null, date, ts, ts]
    )
    await runWithRetry(database,
      `UPDATE accounts SET balance = balance + ?, updated_at = ? WHERE id = ?`,
      [-amount, now(), from_account_id]
    )
    await runWithRetry(database,
      `UPDATE accounts SET balance = balance + ?, updated_at = ? WHERE id = ?`,
      [amount, now(), to_account_id]
    )
  })
  return newId
}

export async function getTransfers(userId) {
  const database = await getReadyDB()
  return await database.getAllAsync(
    `SELECT * FROM transfers WHERE user_id = ? ORDER BY date DESC, created_at DESC`,
    [userId]
  )
}

// Deletes a transfer and reverses both legs atomically (a transfer debits the
// from-account and credits the to-account, so deleting credits back the from
// and debits back the to).
export async function deleteTransferAtomic(id) {
  const database = await getReadyDB()
  await database.withTransactionAsync(async () => {
    const existing = await database.getFirstAsync(
      `SELECT from_account_id, to_account_id, amount FROM transfers WHERE id = ?`, [id]
    )
    await runWithRetry(database, `DELETE FROM transfers WHERE id = ?`, [id])
    if (existing?.from_account_id) {
      await runWithRetry(database,
        `UPDATE accounts SET balance = balance + ?, updated_at = ? WHERE id = ?`,
        [existing.amount, now(), existing.from_account_id]
      )
    }
    if (existing?.to_account_id) {
      await runWithRetry(database,
        `UPDATE accounts SET balance = balance - ?, updated_at = ? WHERE id = ?`,
        [existing.amount, now(), existing.to_account_id]
      )
    }
  })
}

// ─── ACCOUNT ADJUSTMENTS ────────────────────────────────────
// A manual balance correction: records the signed `delta` as a ledger row AND
// moves the account balance by that same delta in one transaction, so a hand
// edit of an account's balance is auditable in history instead of silently
// overwriting the transaction-driven column. `delta` may be negative.
export async function addAdjustmentAtomic(userId, { account_id, delta, note, date }) {
  const database = await getReadyDB()
  const newId = id()
  const ts = now()
  await database.withTransactionAsync(async () => {
    await runWithRetry(database,
      `INSERT INTO account_adjustments (id, user_id, account_id, delta, note, date, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [newId, userId, account_id, delta, note || null, date, ts, ts]
    )
    await adjustAccountBalanceIfExists(database, account_id, delta)
  })
  return newId
}

export async function getAdjustments(userId) {
  const database = await getReadyDB()
  return await database.getAllAsync(
    `SELECT * FROM account_adjustments WHERE user_id = ? ORDER BY date DESC, created_at DESC`,
    [userId]
  )
}

// Deletes an adjustment and reverses its delta atomically (an adjustment moved
// the balance by +delta, so deleting must move it by -delta).
export async function deleteAdjustmentAtomic(id) {
  const database = await getReadyDB()
  await database.withTransactionAsync(async () => {
    const existing = await database.getFirstAsync(
      `SELECT account_id, delta FROM account_adjustments WHERE id = ?`, [id]
    )
    await runWithRetry(database, `DELETE FROM account_adjustments WHERE id = ?`, [id])
    if (existing?.account_id) {
      await adjustAccountBalanceIfExists(database, existing.account_id, -existing.delta)
    }
  })
}

// ─── RECURRING INCOME ───────────────────────────────────────
export async function addRecurringIncome(userId, { amount, category, note, frequency, next_due, account_id = null }) {
  const database = await getReadyDB()
  const newId = id()
  const ts = now()
  await runWithRetry(database,
    `INSERT INTO recurring_income (id, user_id, amount, category, note, frequency, next_due, last_logged, is_active, account_id, anchor_day, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, null, 1, ?, ?, ?, ?)`,
    [newId, userId, amount, category, note || null, frequency, next_due, account_id, anchorDayFromDate(next_due), ts, ts]
  )
  return newId
}

export async function getRecurringIncome(userId) {
  const database = await getReadyDB()
  return await database.getAllAsync(
    `SELECT * FROM recurring_income WHERE user_id = ? AND is_active = 1 ORDER BY created_at DESC`,
    [userId]
  )
}

export async function getInactiveRecurringIncome(userId) {
  const database = await getReadyDB()
  return await database.getAllAsync(
    `SELECT * FROM recurring_income WHERE user_id = ? AND is_active = 0 ORDER BY updated_at DESC`,
    [userId]
  )
}

export async function updateRecurringIncomeAfterLog(id, nextDue, lastLogged) {
  const database = await getReadyDB()
  await runWithRetry(database,
    `UPDATE recurring_income SET next_due = ?, last_logged = ?, updated_at = ? WHERE id = ?`,
    [nextDue, lastLogged, now(), id]
  )
}

// See updateRecurringExpense — same anchor_day preservation for recurring income.
export async function updateRecurringIncome(id, { amount, note, frequency }) {
  const database = await getReadyDB()
  const existing = await database.getFirstAsync(
    `SELECT anchor_day, next_due FROM recurring_income WHERE id = ?`, [id]
  )
  const anchorDay = existing?.anchor_day ?? anchorDayFromDate(existing?.next_due)
  await runWithRetry(database,
    `UPDATE recurring_income SET amount = ?, note = ?, frequency = ?, anchor_day = ?, updated_at = ? WHERE id = ?`,
    [amount, note || null, frequency, anchorDay, now(), id]
  )
}

// See processRecurringExpenseItemAtomic — same atomicity guarantee for recurring income.
export async function processRecurringIncomeItemAtomic(userId, item, todayStr, calculateNextDue) {
  const database = await getReadyDB()
  let logged = 0
  const anchorDay = item.anchor_day || anchorDayFromDate(item.next_due)
  await database.withTransactionAsync(async () => {
    let currentDue = item.next_due
    let lastLogged = item.last_logged

    while (currentDue <= todayStr) {
      if (lastLogged === currentDue) {
        currentDue = calculateNextDue(currentDue, item.frequency, anchorDay)
        continue
      }

      const newId = id()
      const ts = now()
      await runWithRetry(database,
        `INSERT INTO income (id, user_id, amount, category, note, date, account_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [newId, userId, item.amount, item.category, item.note || `Auto: ${item.category}`, currentDue, item.account_id || null, ts, ts]
      )
      if (item.account_id) {
        await runWithRetry(database,
          `UPDATE accounts SET balance = balance + ?, updated_at = ? WHERE id = ?`,
          [item.amount, now(), item.account_id]
        )
      }

      lastLogged = currentDue
      currentDue = calculateNextDue(currentDue, item.frequency, anchorDay)
      logged++
    }

    await runWithRetry(database,
      `UPDATE recurring_income SET next_due = ?, last_logged = ?, updated_at = ? WHERE id = ?`,
      [currentDue, lastLogged, now(), item.id]
    )
  })
  return logged
}

export async function deleteRecurringIncome(id) {
  const database = await getReadyDB()
  await runWithRetry(database,
    `UPDATE recurring_income SET is_active = 0, updated_at = ? WHERE id = ?`,
    [now(), id]
  )
}

export async function permanentDeleteRecurringIncome(id) {
  const database = await getReadyDB()
  await runWithRetry(database,`DELETE FROM recurring_income WHERE id = ?`, [id])
}