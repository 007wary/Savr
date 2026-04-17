import * as SQLite from 'expo-sqlite'
import 'react-native-get-random-values'
import { v4 as uuidv4 } from 'uuid'

let db = null

export const getDB = async () => {
  if (!db) {
    db = await SQLite.openDatabaseAsync('savr.db')
  }
  return db
}

export const initializeDatabase = async () => {
  const database = await getDB()

  await database.execAsync(`
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS expenses (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      amount REAL NOT NULL,
      category TEXT NOT NULL,
      note TEXT,
      date TEXT NOT NULL,
      is_recurring INTEGER DEFAULT 0,
      recurring_id TEXT,
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
  `)

  return database
}

// ─── HELPERS ────────────────────────────────────────────────
const now = () => new Date().toISOString()
const id = () => uuidv4()

// ─── EXPENSES ───────────────────────────────────────────────
export async function addExpense(userId, { amount, category, note, date, is_recurring = 0, recurring_id = null }) {
  const database = await getDB()
  const newId = id()
  const ts = now()
  await database.runAsync(
    `INSERT INTO expenses (id, user_id, amount, category, note, date, is_recurring, recurring_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [newId, userId, amount, category, note || null, date, is_recurring ? 1 : 0, recurring_id, ts, ts]
  )
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

export async function updateExpense(id, { amount, category, note, date }) {
  const database = await getDB()
  await database.runAsync(
    `UPDATE expenses SET amount = ?, category = ?, note = ?, date = ?, updated_at = ? WHERE id = ?`,
    [amount, category, note || null, date, now(), id]
  )
}

export async function deleteExpense(id) {
  const database = await getDB()
  await database.runAsync(`DELETE FROM expenses WHERE id = ?`, [id])
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
    await database.runAsync(
      `UPDATE budgets SET limit_amount = ?, updated_at = ? WHERE id = ?`,
      [limit_amount, now(), existing.id]
    )
    return existing.id
  } else {
    const newId = id()
    const ts = now()
    await database.runAsync(
      `INSERT INTO budgets (id, user_id, category, limit_amount, month, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [newId, userId, category, limit_amount, month, ts, ts]
    )
    return newId
  }
}

export async function deleteBudget(id) {
  const database = await getDB()
  await database.runAsync(`DELETE FROM budgets WHERE id = ?`, [id])
}

// ─── RECURRING ──────────────────────────────────────────────
export async function getRecurring(userId) {
  const database = await getDB()
  return await database.getAllAsync(
    `SELECT * FROM recurring_expenses WHERE user_id = ? AND is_active = 1 ORDER BY created_at DESC`,
    [userId]
  )
}

export async function addRecurring(userId, { amount, category, note, frequency, next_due }) {
  const database = await getDB()
  const newId = id()
  const ts = now()
  await database.runAsync(
    `INSERT INTO recurring_expenses (id, user_id, amount, category, note, frequency, next_due, last_logged, is_active, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, null, 1, ?, ?)`,
    [newId, userId, amount, category, note || null, frequency, next_due, ts, ts]
  )
  return newId
}

export async function updateRecurringAfterLog(id, nextDue, lastLogged) {
  const database = await getDB()
  await database.runAsync(
    `UPDATE recurring_expenses SET next_due = ?, last_logged = ?, updated_at = ? WHERE id = ?`,
    [nextDue, lastLogged, now(), id]
  )
}

export async function deleteRecurring(id) {
  const database = await getDB()
  await database.runAsync(
    `UPDATE recurring_expenses SET is_active = 0, updated_at = ? WHERE id = ?`,
    [now(), id]
  )
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
    await database.runAsync(
      `UPDATE spending_goals SET title = ?, target_amount = ?, deadline = ?, updated_at = ? WHERE id = ?`,
      [title, target_amount, deadline || null, now(), existing.id]
    )
    return existing.id
  } else {
    const newId = id()
    const ts = now()
    await database.runAsync(
      `INSERT INTO spending_goals (id, user_id, title, target_amount, current_amount, deadline, created_at, updated_at)
       VALUES (?, ?, ?, ?, 0, ?, ?, ?)`,
      [newId, userId, title, target_amount, deadline || null, ts, ts]
    )
    return newId
  }
}

export async function deleteSpendingGoal(userId) {
  const database = await getDB()
  await database.runAsync(`DELETE FROM spending_goals WHERE user_id = ?`, [userId])
}

// ─── APP META ───────────────────────────────────────────────
export async function getMeta(key) {
  const database = await getDB()
  const result = await database.getFirstAsync(`SELECT value FROM app_meta WHERE key = ?`, [key])
  return result?.value || null
}

export async function setMeta(key, value) {
  const database = await getDB()
  await database.runAsync(
    `INSERT OR REPLACE INTO app_meta (key, value) VALUES (?, ?)`,
    [key, String(value)]
  )
}