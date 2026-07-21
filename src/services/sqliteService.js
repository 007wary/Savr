import * as SQLite from 'expo-sqlite'
import 'react-native-get-random-values'
import { v4 as uuidv4 } from 'uuid'

let db = null
let opening = null

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

export const initializeDatabase = async () => {
  const database = await getDB()

  // Migration: add account_id to recurring tables if missing
  try {
    await database.execAsync(`ALTER TABLE recurring_expenses ADD COLUMN account_id TEXT`)
  } catch {}
  try {
    await database.execAsync(`ALTER TABLE recurring_income ADD COLUMN account_id TEXT`)
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
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_recurring_income_user ON recurring_income(user_id, is_active);
    CREATE INDEX IF NOT EXISTS idx_accounts_user ON accounts(user_id);
    CREATE INDEX IF NOT EXISTS idx_income_user_id ON income(user_id);
    CREATE INDEX IF NOT EXISTS idx_income_date ON income(user_id, date);
  `)

  return database
}

// ─── HELPERS ────────────────────────────────────────────────
const now = () => new Date().toISOString()
const id = () => uuidv4()

export async function addExpense(userId, { amount, category, note, date, is_recurring = 0, recurring_id = null, account_id = null }) {
  const database = await getDB()
  const newId = id()
  const ts = now()
  await runWithRetry(database,
    `INSERT INTO expenses (id, user_id, amount, category, note, date, is_recurring, recurring_id, account_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [newId, userId, amount, category, note || null, date, is_recurring ? 1 : 0, recurring_id, account_id, ts, ts]
  )
  return newId
}

export async function addExpenseAtomic(userId, { amount, category, note, date, is_recurring = 0, recurring_id = null, account_id = null }) {
  const database = await getDB()
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

export async function getExpenses(userId, { month } = {}) {
  const database = await getDB()
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
  const database = await getDB()
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
        await runWithRetry(database,
          `UPDATE accounts SET balance = balance + ?, updated_at = ? WHERE id = ?`,
          [existing.amount, now(), existing.account_id]
        )
        if (newAccountId) {
          await runWithRetry(database,
            `UPDATE accounts SET balance = balance - ?, updated_at = ? WHERE id = ?`,
            [amount, now(), newAccountId]
          )
        }
      } else if (existing.account_id && existing.account_id === newAccountId) {
        const delta = existing.amount - amount
        if (delta !== 0) {
          await runWithRetry(database,
            `UPDATE accounts SET balance = balance + ?, updated_at = ? WHERE id = ?`,
            [delta, now(), newAccountId]
          )
        }
      } else if (!existing.account_id && newAccountId) {
        await runWithRetry(database,
          `UPDATE accounts SET balance = balance - ?, updated_at = ? WHERE id = ?`,
          [amount, now(), newAccountId]
        )
      }
    }
  })
}

export async function deleteExpense(id) {
  const database = await getDB()
  await runWithRetry(database,`DELETE FROM expenses WHERE id = ?`, [id])
}

// Deletes an expense and restores the debit to its account atomically, so the
// balance can't drift if a caller forgets to reverse it (addExpense debits the
// account, so deleting must credit it back by the same amount).
export async function deleteExpenseAtomic(id) {
  const database = await getDB()
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
  const database = await getDB()
  return await database.getAllAsync(
    `SELECT category, SUM(amount) as total FROM expenses
     WHERE user_id = ? AND date LIKE ?
     GROUP BY category ORDER BY total DESC`,
    [userId, `${month}%`]
  )
}

export async function getMonthlyTotal(userId, month) {
  const database = await getDB()
  const result = await database.getFirstAsync(
    `SELECT SUM(amount) as total FROM expenses WHERE user_id = ? AND date LIKE ?`,
    [userId, `${month}%`]
  )
  return result?.total || 0
}

// ─── BUDGETS ────────────────────────────────────────────────
export async function getBudgets(userId, month) {
  const database = await getDB()
  return await database.getAllAsync(
    `SELECT * FROM budgets WHERE user_id = ? AND month = ?`,
    [userId, month]
  )
}

export async function saveBudget(userId, { category, limit_amount, month }) {
  const database = await getDB()
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
  const database = await getDB()
  await runWithRetry(database,`DELETE FROM budgets WHERE id = ?`, [id])
}

// ─── RECURRING ──────────────────────────────────────────────
export async function getRecurring(userId) {
  const database = await getDB()
  return await database.getAllAsync(
    `SELECT * FROM recurring_expenses WHERE user_id = ? AND is_active = 1 ORDER BY created_at DESC`,
    [userId]
  )
}

export async function addRecurring(userId, { amount, category, note, frequency, next_due, account_id = null }) {
  const database = await getDB()
  const newId = id()
  const ts = now()
  await runWithRetry(database,
    `INSERT INTO recurring_expenses (id, user_id, amount, category, note, frequency, next_due, last_logged, is_active, account_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, null, 1, ?, ?, ?)`,
    [newId, userId, amount, category, note || null, frequency, next_due, account_id, ts, ts]
  )
  return newId
}

export async function updateRecurringAfterLog(id, nextDue, lastLogged) {
  const database = await getDB()
  await runWithRetry(database,
    `UPDATE recurring_expenses SET next_due = ?, last_logged = ?, updated_at = ? WHERE id = ?`,
    [nextDue, lastLogged, now(), id]
  )
}

// Logs all due occurrences for one recurring expense and updates its next_due/last_logged
// atomically in a single DB transaction, so a crash mid-run can't leave balances
// updated without the rule advancing (or vice versa).
export async function processRecurringExpenseItemAtomic(userId, item, todayStr, calculateNextDue) {
  const database = await getDB()
  let logged = 0
  await database.withTransactionAsync(async () => {
    let currentDue = item.next_due
    let lastLogged = item.last_logged

    while (currentDue <= todayStr) {
      if (lastLogged === currentDue) {
        currentDue = calculateNextDue(currentDue, item.frequency)
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
      currentDue = calculateNextDue(currentDue, item.frequency)
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
  const database = await getDB()
  await runWithRetry(database,
    `UPDATE recurring_expenses SET is_active = 0, updated_at = ? WHERE id = ?`,
    [now(), id]
  )
}

export async function getInactiveRecurring(userId) {
  const database = await getDB()
  return await database.getAllAsync(
    `SELECT * FROM recurring_expenses WHERE user_id = ? AND is_active = 0 ORDER BY updated_at DESC`,
    [userId]
  )
}

export async function permanentDeleteRecurring(id) {
  const database = await getDB()
  await runWithRetry(database,`DELETE FROM recurring_expenses WHERE id = ?`, [id])
}

// ─── SPENDING GOALS ─────────────────────────────────────────
export async function getSpendingGoal(userId) {
  const database = await getDB()
  return await database.getFirstAsync(
    `SELECT * FROM spending_goals WHERE user_id = ? ORDER BY created_at DESC LIMIT 1`,
    [userId]
  )
}

export async function saveSpendingGoal(userId, { title, target_amount, deadline }) {
  const database = await getDB()
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
  const database = await getDB()
  await runWithRetry(database,`DELETE FROM spending_goals WHERE user_id = ?`, [userId])
}

// ─── APP META ───────────────────────────────────────────────
export async function getMeta(key) {
  const database = await getDB()
  const result = await database.getFirstAsync(`SELECT value FROM app_meta WHERE key = ?`, [key])
  return result?.value || null
}

export async function setMeta(key, value) {
  const database = await getDB()
  await runWithRetry(database,
    `INSERT OR REPLACE INTO app_meta (key, value) VALUES (?, ?)`,
    [key, String(value)]
  )
}

// ─── ACCOUNTS ───────────────────────────────────────────────
export async function addAccount(userId, { name, type, balance = 0, currency = 'USD' }) {
  const database = await getDB()
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
  const database = await getDB()
  return await database.getAllAsync(
    `SELECT * FROM accounts WHERE user_id = ? ORDER BY created_at ASC`,
    [userId]
  )
}

export async function getAccountsTotal(userId) {
  const database = await getDB()
  const result = await database.getFirstAsync(
    `SELECT SUM(balance) as total, COUNT(*) as count FROM accounts WHERE user_id = ?`,
    [userId]
  )
  return { total: result?.total || 0, count: result?.count || 0 }
}

export async function updateAccount(id, { name, type, balance, currency }) {
  const database = await getDB()
  await runWithRetry(database,
    `UPDATE accounts SET name = ?, type = ?, balance = ?, currency = ?, updated_at = ? WHERE id = ?`,
    [name, type, balance, currency, now(), id]
  )
}

export async function updateAccountBalance(id, delta) {
  const database = await getDB()
  await runWithRetry(database,
    `UPDATE accounts SET balance = balance + ?, updated_at = ? WHERE id = ?`,
    [delta, now(), id]
  )
}

// Deleting an account would otherwise leave expenses/income pointing at a
// nonexistent account_id and transfers with no valid endpoint, so unlink/remove
// those references in the same transaction as the account deletion.
export async function deleteAccount(id) {
  const database = await getDB()
  await database.withTransactionAsync(async () => {
    await runWithRetry(database, `UPDATE expenses SET account_id = NULL WHERE account_id = ?`, [id])
    await runWithRetry(database, `UPDATE income SET account_id = NULL WHERE account_id = ?`, [id])
    await runWithRetry(database, `UPDATE recurring_expenses SET account_id = NULL WHERE account_id = ?`, [id])
    await runWithRetry(database, `UPDATE recurring_income SET account_id = NULL WHERE account_id = ?`, [id])
    await runWithRetry(database, `DELETE FROM transfers WHERE from_account_id = ? OR to_account_id = ?`, [id, id])
    await runWithRetry(database, `DELETE FROM accounts WHERE id = ?`, [id])
  })
}

// ─── INCOME ─────────────────────────────────────────────────
export async function addIncome(userId, { amount, category, note, date, account_id = null }) {
  const database = await getDB()
  const newId = id()
  const ts = now()
  await runWithRetry(database,
    `INSERT INTO income (id, user_id, amount, category, note, date, account_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [newId, userId, amount, category, note || null, date, account_id, ts, ts]
  )
  return newId
}

export async function addIncomeAtomic(userId, { amount, category, note, date, account_id = null }) {
  const database = await getDB()
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
  const database = await getDB()
  return await database.getAllAsync(
    `SELECT * FROM income WHERE user_id = ? ORDER BY date DESC, created_at DESC`,
    [userId]
  )
}

export async function getIncomeByMonth(userId, month) {
  const database = await getDB()
  return await database.getAllAsync(
    `SELECT * FROM income WHERE user_id = ? AND date LIKE ? ORDER BY date DESC, created_at DESC`,
    [userId, `${month}%`]
  )
}

export async function getMonthlyIncomeTotal(userId, month) {
  const database = await getDB()
  const result = await database.getFirstAsync(
    `SELECT SUM(amount) as total FROM income WHERE user_id = ? AND date LIKE ?`,
    [userId, `${month}%`]
  )
  return result?.total || 0
}

export async function getTodayIncomeTotal(userId, date) {
  const database = await getDB()
  const result = await database.getFirstAsync(
    `SELECT SUM(amount) as total FROM income WHERE user_id = ? AND date = ?`,
    [userId, date]
  )
  return result?.total || 0
}

export async function updateIncome(id, { amount, category, note, date, account_id }) {
  const database = await getDB()
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
        await runWithRetry(database,
          `UPDATE accounts SET balance = balance - ?, updated_at = ? WHERE id = ?`,
          [existing.amount, now(), existing.account_id]
        )
        if (newAccountId) {
          await runWithRetry(database,
            `UPDATE accounts SET balance = balance + ?, updated_at = ? WHERE id = ?`,
            [amount, now(), newAccountId]
          )
        }
      } else if (existing.account_id && existing.account_id === newAccountId) {
        const delta = amount - existing.amount
        if (delta !== 0) {
          await runWithRetry(database,
            `UPDATE accounts SET balance = balance + ?, updated_at = ? WHERE id = ?`,
            [delta, now(), newAccountId]
          )
        }
      } else if (!existing.account_id && newAccountId) {
        await runWithRetry(database,
          `UPDATE accounts SET balance = balance + ?, updated_at = ? WHERE id = ?`,
          [amount, now(), newAccountId]
        )
      }
    }
  })
}

export async function deleteIncome(id) {
  const database = await getDB()
  await runWithRetry(database,`DELETE FROM income WHERE id = ?`, [id])
}

// Deletes an income row and reverses the credit to its account atomically
// (addIncome credits the account, so deleting must debit it back).
export async function deleteIncomeAtomic(id) {
  const database = await getDB()
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
export async function addTransfer(userId, { from_account_id, to_account_id, amount, note, date }) {
  const database = await getDB()
  const newId = id()
  const ts = now()
  await runWithRetry(database,
    `INSERT INTO transfers (id, user_id, from_account_id, to_account_id, amount, note, date, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [newId, userId, from_account_id, to_account_id, amount, note || null, date, ts, ts]
  )
  return newId
}

export async function addTransferAtomic(userId, { from_account_id, to_account_id, amount, note, date }) {
  const database = await getDB()
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
  const database = await getDB()
  return await database.getAllAsync(
    `SELECT * FROM transfers WHERE user_id = ? ORDER BY date DESC, created_at DESC`,
    [userId]
  )
}

export async function deleteTransfer(id) {
  const database = await getDB()
  await runWithRetry(database, `DELETE FROM transfers WHERE id = ?`, [id])
}

// Deletes a transfer and reverses both legs atomically (a transfer debits the
// from-account and credits the to-account, so deleting credits back the from
// and debits back the to).
export async function deleteTransferAtomic(id) {
  const database = await getDB()
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

// ─── RECURRING INCOME ───────────────────────────────────────
export async function addRecurringIncome(userId, { amount, category, note, frequency, next_due, account_id = null }) {
  const database = await getDB()
  const newId = id()
  const ts = now()
  await runWithRetry(database,
    `INSERT INTO recurring_income (id, user_id, amount, category, note, frequency, next_due, last_logged, is_active, account_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, null, 1, ?, ?, ?)`,
    [newId, userId, amount, category, note || null, frequency, next_due, account_id, ts, ts]
  )
  return newId
}

export async function getRecurringIncome(userId) {
  const database = await getDB()
  return await database.getAllAsync(
    `SELECT * FROM recurring_income WHERE user_id = ? AND is_active = 1 ORDER BY created_at DESC`,
    [userId]
  )
}

export async function getInactiveRecurringIncome(userId) {
  const database = await getDB()
  return await database.getAllAsync(
    `SELECT * FROM recurring_income WHERE user_id = ? AND is_active = 0 ORDER BY updated_at DESC`,
    [userId]
  )
}

export async function updateRecurringIncomeAfterLog(id, nextDue, lastLogged) {
  const database = await getDB()
  await runWithRetry(database,
    `UPDATE recurring_income SET next_due = ?, last_logged = ?, updated_at = ? WHERE id = ?`,
    [nextDue, lastLogged, now(), id]
  )
}

// See processRecurringExpenseItemAtomic — same atomicity guarantee for recurring income.
export async function processRecurringIncomeItemAtomic(userId, item, todayStr, calculateNextDue) {
  const database = await getDB()
  let logged = 0
  await database.withTransactionAsync(async () => {
    let currentDue = item.next_due
    let lastLogged = item.last_logged

    while (currentDue <= todayStr) {
      if (lastLogged === currentDue) {
        currentDue = calculateNextDue(currentDue, item.frequency)
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
      currentDue = calculateNextDue(currentDue, item.frequency)
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
  const database = await getDB()
  await runWithRetry(database,
    `UPDATE recurring_income SET is_active = 0, updated_at = ? WHERE id = ?`,
    [now(), id]
  )
}

export async function permanentDeleteRecurringIncome(id) {
  const database = await getDB()
  await runWithRetry(database,`DELETE FROM recurring_income WHERE id = ?`, [id])
}