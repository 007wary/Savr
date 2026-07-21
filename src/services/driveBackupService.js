import AsyncStorage from '@react-native-async-storage/async-storage'
import { GoogleSignin } from '@react-native-google-signin/google-signin'
import { getDB } from './sqliteService'
import { getUser, getCachedUser } from '../lib/auth'
import {
  getGoogleAccessToken,
  setGoogleAccessToken,
  setGoogleAccessTokenCachedAtNow,
} from '../lib/googleAccessToken'
import { logError } from '../lib/errorLog'

const BACKUP_FILE_NAME = 'savr_backup.json'
const FOLDER_NAME = 'Savr'
const DRIVE_API_BASE = 'https://www.googleapis.com/drive/v3'
const DRIVE_UPLOAD_BASE = 'https://www.googleapis.com/upload/drive/v3'

function backupPayloadHasRows(data) {
  if (!data || typeof data !== 'object') return false
  return Object.values(data).some((v) => Array.isArray(v) && v.length > 0)
}

// Day-of-month (1–31) parsed from a "YYYY-MM-DD" string, used to backfill
// anchor_day for recurring rows from backups made before the column existed.
function anchorDayFromDate(dateStr) {
  const day = parseInt(String(dateStr || '').slice(8, 10), 10)
  return Number.isFinite(day) && day >= 1 && day <= 31 ? day : null
}

async function getAccessToken() {
  try {
    const [tokenTime, storedToken] = await Promise.all([
      AsyncStorage.getItem('savr_google_token_time'),
      getGoogleAccessToken(),
    ])
    if (storedToken && tokenTime) {
      const age = Date.now() - parseInt(tokenTime, 10)
      if (age < 55 * 60 * 1000) return storedToken
    }

    try {
      await GoogleSignin.signInSilently()
      const { accessToken } = await GoogleSignin.getTokens()
      if (accessToken) {
        await setGoogleAccessToken(accessToken)
        await setGoogleAccessTokenCachedAtNow()
        return accessToken
      }
    } catch {}

    if (storedToken) return storedToken
    return null
  } catch {
    return null
  }
}

async function verifyToken(accessToken) {
  try {
    const response = await fetch(
      `https://www.googleapis.com/oauth2/v1/tokeninfo?access_token=${accessToken}`
    )
    const data = await response.json()
    return !data.error && data.expires_in > 0
  } catch {
    return false
  }
}

async function getOrCreateFolder(accessToken) {
  try {
    const folderQuery = `name='${FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`
    const searchResponse = await fetch(
      `${DRIVE_API_BASE}/files?q=${encodeURIComponent(folderQuery)}&fields=files(id,name)`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    )
    const searchData = await searchResponse.json()
    if (searchData.files && searchData.files.length > 0) {
      return searchData.files[0].id
    }
    const createResponse = await fetch(
      `${DRIVE_API_BASE}/files`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: FOLDER_NAME,
          mimeType: 'application/vnd.google-apps.folder',
        }),
      }
    )
    const folderData = await createResponse.json()
    return folderData.id
  } catch {
    return null
  }
}

async function findBackupFileId(accessToken, folderId) {
  try {
    const query = folderId
      ? `name='${BACKUP_FILE_NAME}' and '${folderId}' in parents and trashed=false`
      : `name='${BACKUP_FILE_NAME}' and trashed=false`
    const response = await fetch(
      `${DRIVE_API_BASE}/files?q=${encodeURIComponent(query)}&fields=files(id,name,modifiedTime)`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    )
    const data = await response.json()
    if (data.files && data.files.length > 0) return data.files[0]
    return null
  } catch {
    return null
  }
}

async function getAllDataFromSQLite(userId) {
  const db = await getDB()
  const [expenses, budgets, recurring, goals, accounts, income, transfers, recurringIncome] = await Promise.all([
    db.getAllAsync('SELECT * FROM expenses WHERE user_id = ?', [userId]),
    db.getAllAsync('SELECT * FROM budgets WHERE user_id = ?', [userId]),
    db.getAllAsync('SELECT * FROM recurring_expenses WHERE user_id = ?', [userId]),
    db.getAllAsync('SELECT * FROM spending_goals WHERE user_id = ?', [userId]),
    db.getAllAsync('SELECT * FROM accounts WHERE user_id = ?', [userId]),
    db.getAllAsync('SELECT * FROM income WHERE user_id = ?', [userId]),
    db.getAllAsync('SELECT * FROM transfers WHERE user_id = ?', [userId]),
    db.getAllAsync('SELECT * FROM recurring_income WHERE user_id = ?', [userId]),
  ])
  return { expenses, budgets, recurring, goals, accounts, income, transfers, recurringIncome }
}

const REQUIRED_FIELDS = {
  expenses: ['id', 'amount', 'category', 'date'],
  budgets: ['id', 'category', 'limit_amount', 'month'],
  recurring: ['id', 'amount', 'category', 'frequency', 'next_due'],
  goals: ['id', 'title', 'target_amount'],
  accounts: ['id', 'name', 'type'],
  income: ['id', 'amount', 'category', 'date'],
  transfers: ['id', 'from_account_id', 'to_account_id', 'amount', 'date'],
  recurringIncome: ['id', 'amount', 'category', 'frequency', 'next_due'],
}

const VALID_FREQUENCIES = ['daily', 'weekly', 'monthly']

function validateBackupData(data) {
  for (const [key, requiredFields] of Object.entries(REQUIRED_FIELDS)) {
    const rows = data[key]
    if (rows === undefined) continue
    if (!Array.isArray(rows)) {
      throw new Error(`Invalid backup data: "${key}" is not an array`)
    }
    for (const row of rows) {
      if (!row || typeof row !== 'object') {
        throw new Error(`Invalid backup data: "${key}" contains a non-object row`)
      }
      for (const field of requiredFields) {
        if (row[field] === undefined || row[field] === null) {
          throw new Error(`Invalid backup data: "${key}" row is missing required field "${field}"`)
        }
      }
      // Recurring rules drive a `while (currentDue <= today)` loop keyed on
      // frequency; an out-of-range value would fail to advance the date and
      // hang the app, so reject it here instead of importing it.
      if ((key === 'recurring' || key === 'recurringIncome') && !VALID_FREQUENCIES.includes(row.frequency)) {
        throw new Error(`Invalid backup data: "${key}" row has invalid frequency "${row.frequency}"`)
      }
    }
  }
}

async function writeAllDataToSQLite(db, userId, data, now) {
  await db.runAsync('DELETE FROM expenses WHERE user_id = ?', [userId])
  await db.runAsync('DELETE FROM budgets WHERE user_id = ?', [userId])
  await db.runAsync('DELETE FROM recurring_expenses WHERE user_id = ?', [userId])
  await db.runAsync('DELETE FROM spending_goals WHERE user_id = ?', [userId])
  await db.runAsync('DELETE FROM accounts WHERE user_id = ?', [userId])
  await db.runAsync('DELETE FROM income WHERE user_id = ?', [userId])
  await db.runAsync('DELETE FROM transfers WHERE user_id = ?', [userId])
  await db.runAsync('DELETE FROM recurring_income WHERE user_id = ?', [userId])

  for (const e of (data.expenses || [])) {
    await db.runAsync(
      `INSERT OR REPLACE INTO expenses (id, user_id, amount, category, note, date, is_recurring, recurring_id, account_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [e.id, userId, e.amount, e.category, e.note, e.date, e.is_recurring || 0, e.recurring_id, e.account_id || null, e.created_at || now, e.updated_at || now]
    )
  }

  for (const b of (data.budgets || [])) {
    await db.runAsync(
      `INSERT OR REPLACE INTO budgets (id, user_id, category, limit_amount, month, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [b.id, userId, b.category, b.limit_amount, b.month, b.created_at || now, b.updated_at || now]
    )
  }

  for (const r of (data.recurring || [])) {
    await db.runAsync(
      `INSERT OR REPLACE INTO recurring_expenses (id, user_id, amount, category, note, frequency, next_due, last_logged, is_active, account_id, anchor_day, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [r.id, userId, r.amount, r.category, r.note, r.frequency, r.next_due, r.last_logged, r.is_active ?? 1, r.account_id || null, r.anchor_day ?? anchorDayFromDate(r.next_due), r.created_at || now, r.updated_at || now]
    )
  }

  for (const g of (data.goals || [])) {
    await db.runAsync(
      `INSERT OR REPLACE INTO spending_goals (id, user_id, title, target_amount, current_amount, deadline, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [g.id, userId, g.title, g.target_amount, g.current_amount || 0, g.deadline, g.created_at || now, g.updated_at || now]
    )
  }

  for (const a of (data.accounts || [])) {
    await db.runAsync(
      `INSERT OR REPLACE INTO accounts (id, user_id, name, type, balance, currency, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [a.id, userId, a.name, a.type, a.balance || 0, a.currency || 'USD', a.created_at || now, a.updated_at || now]
    )
  }

  for (const i of (data.income || [])) {
    await db.runAsync(
      `INSERT OR REPLACE INTO income (id, user_id, amount, category, note, date, account_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [i.id, userId, i.amount, i.category, i.note, i.date, i.account_id || null, i.created_at || now, i.updated_at || now]
    )
  }

  for (const t of (data.transfers || [])) {
    await db.runAsync(
      `INSERT OR REPLACE INTO transfers (id, user_id, from_account_id, to_account_id, amount, note, date, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [t.id, userId, t.from_account_id, t.to_account_id, t.amount, t.note || null, t.date, t.created_at || now, t.updated_at || now]
    )
  }

  for (const ri of (data.recurringIncome || [])) {
    await db.runAsync(
      `INSERT OR REPLACE INTO recurring_income (id, user_id, amount, category, note, frequency, next_due, last_logged, is_active, account_id, anchor_day, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [ri.id, userId, ri.amount, ri.category, ri.note, ri.frequency, ri.next_due, ri.last_logged, ri.is_active ?? 1, ri.account_id || null, ri.anchor_day ?? anchorDayFromDate(ri.next_due), ri.created_at || now, ri.updated_at || now]
    )
  }
}

async function restoreAllDataToSQLite(userId, data) {
  validateBackupData(data)

  const db = await getDB()
  const now = new Date().toISOString()
  const snapshot = await getAllDataFromSQLite(userId)

  try {
    await db.withTransactionAsync(async () => {
      await writeAllDataToSQLite(db, userId, data, now)
    })
  } catch (restoreError) {
    // The failed restore transaction already rolled itself back at the SQL
    // level, but local rows for this user may now be empty/partial if the
    // failure happened mid-loop before this catch. Re-apply the pre-restore
    // snapshot so a corrupted/truncated Drive backup can't leave the user
    // with less data than they started with.
    try {
      await db.withTransactionAsync(async () => {
        await writeAllDataToSQLite(db, userId, snapshot, now)
      })
    } catch {
      // Snapshot re-apply also failed — surface the original error; there is
      // nothing more we can safely do locally.
    }
    throw restoreError
  }
}

export async function generateDataHash(userId) {
  try {
    const db = await getDB()
    const [
      exp, inc, acc, tr, bud, rec, goals, recInc,
    ] = await Promise.all([
      db.getFirstAsync(`SELECT COUNT(*) as count, MAX(updated_at) as latest FROM expenses WHERE user_id = ?`, [userId]),
      db.getFirstAsync(`SELECT COUNT(*) as count, MAX(updated_at) as latest FROM income WHERE user_id = ?`, [userId]),
      db.getFirstAsync(`SELECT COUNT(*) as count, MAX(updated_at) as latest FROM accounts WHERE user_id = ?`, [userId]),
      db.getFirstAsync(`SELECT COUNT(*) as count, MAX(updated_at) as latest FROM transfers WHERE user_id = ?`, [userId]),
      db.getFirstAsync(`SELECT COUNT(*) as count, MAX(updated_at) as latest FROM budgets WHERE user_id = ?`, [userId]),
      db.getFirstAsync(`SELECT COUNT(*) as count, MAX(updated_at) as latest FROM recurring_expenses WHERE user_id = ?`, [userId]),
      db.getFirstAsync(`SELECT COUNT(*) as count, MAX(updated_at) as latest FROM spending_goals WHERE user_id = ?`, [userId]),
      db.getFirstAsync(`SELECT COUNT(*) as count, MAX(updated_at) as latest FROM recurring_income WHERE user_id = ?`, [userId]),
    ])
    const p = (row) => `${row?.count || 0}_${row?.latest || ''}`
    return [exp, inc, acc, tr, bud, rec, goals, recInc].map(p).join('|')
  } catch {
    return null
  }
}

export async function hasDataChanged(userId) {
  try {
    const currentHash = await generateDataHash(userId)
    if (!currentHash) return true // if error, assume changed
    const lastHash = await AsyncStorage.getItem('savr_last_backup_hash')
    return currentHash !== lastHash
  } catch {
    return true // if error, assume changed
  }
}

export async function saveBackupHash(userId) {
  try {
    const hash = await generateDataHash(userId)
    if (hash) await AsyncStorage.setItem('savr_last_backup_hash', hash)
  } catch {}
}

export async function backupToDrive() {
  try {
    const user = getCachedUser() || await getUser()
    if (!user) return { success: false, error: 'No user found' }

    const [data, accessToken] = await Promise.all([
      getAllDataFromSQLite(user.id),
      getAccessToken(),
    ])
    if (!backupPayloadHasRows(data)) {
      return { success: false, error: 'NO_DATA' }
    }
    if (!accessToken) return { success: false, error: 'NO_TOKEN' }

    const isValid = await verifyToken(accessToken)
    if (!isValid) return { success: false, error: 'SESSION_EXPIRED' }

    const backupPayload = {
      version: 2,
      userId: user.id,
      email: user.email,
      backedUpAt: new Date().toISOString(),
      data,
    }
    const jsonContent = JSON.stringify(backupPayload)
    const folderId = await getOrCreateFolder(accessToken)
    const existingFile = await findBackupFileId(accessToken, folderId)

    if (existingFile) {
      const response = await fetch(
        `${DRIVE_UPLOAD_BASE}/files/${existingFile.id}?uploadType=media`,
        {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: jsonContent,
        }
      )
      if (!response.ok) {
        const err = await response.json()
        return { success: false, error: err.error?.message || 'Upload failed' }
      }
    } else {
      const metadata = {
        name: BACKUP_FILE_NAME,
        parents: folderId ? [folderId] : [],
      }
      const boundary = 'savr_backup_boundary'
      const multipartBody =
        `--${boundary}\r\n` +
        `Content-Type: application/json\r\n\r\n` +
        `${JSON.stringify(metadata)}\r\n` +
        `--${boundary}\r\n` +
        `Content-Type: application/json\r\n\r\n` +
        `${jsonContent}\r\n` +
        `--${boundary}--`
      const response = await fetch(
        `${DRIVE_UPLOAD_BASE}/files?uploadType=multipart`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': `multipart/related; boundary=${boundary}`,
          },
          body: multipartBody,
        }
      )
      if (!response.ok) {
        const err = await response.json()
        return { success: false, error: err.error?.message || 'Upload failed' }
      }
    }

    await AsyncStorage.setItem('savr_last_backup', backupPayload.backedUpAt)
    await saveBackupHash(user.id)
    return {
      success: true,
      backedUpAt: backupPayload.backedUpAt,
    }
  } catch (e) {
    logError('backupToDrive', e)
    return { success: false, error: e.message }
  }
}

export async function restoreFromDrive() {
  try {
    const accessToken = await getAccessToken()
    if (!accessToken) return { success: false, error: 'NO_TOKEN' }

    const isValid = await verifyToken(accessToken)
    if (!isValid) return { success: false, error: 'SESSION_EXPIRED' }

    const user = getCachedUser() || await getUser()
    if (!user) return { success: false, error: 'No user found' }

    const folderId = await getOrCreateFolder(accessToken)
    let existingFile = await findBackupFileId(accessToken, folderId)
    if (!existingFile) existingFile = await findBackupFileId(accessToken, null)
    if (!existingFile) return { success: false, error: 'NO_BACKUP' }

    const response = await fetch(
      `${DRIVE_API_BASE}/files/${existingFile.id}?alt=media`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    )
    if (!response.ok) return { success: false, error: 'Download failed' }

    const backupPayload = await response.json()
    if (!backupPayload.data) return { success: false, error: 'Invalid backup file' }

    if (backupPayload.userId && backupPayload.userId !== user.id) {
      return { success: false, error: 'BACKUP_USER_MISMATCH' }
    }

    await restoreAllDataToSQLite(user.id, backupPayload.data)
    await AsyncStorage.setItem('savr_last_backup', backupPayload.backedUpAt)

    return {
      success: true,
      backedUpAt: backupPayload.backedUpAt,
      expenseCount: backupPayload.data.expenses?.length || 0,
    }
  } catch (e) {
    logError('restoreFromDrive', e)
    return { success: false, error: e.message }
  }
}

export async function checkBackupExists() {
  try {
    const accessToken = await getAccessToken()
    if (!accessToken) return null
    const folderId = await getOrCreateFolder(accessToken)
    let file = await findBackupFileId(accessToken, folderId)
    if (!file) file = await findBackupFileId(accessToken, null)
    if (!file) return null
    await AsyncStorage.setItem('savr_last_backup', file.modifiedTime)
    return { exists: true, modifiedTime: file.modifiedTime }
  } catch {
    return null
  }
}

// Internal round-trip primitives, exported only so the backup/restore unit
// tests can exercise the SQLite serialize → validate → restore path without
// dragging in Google Drive, OAuth, or network I/O. These are not part of the
// public backup API — call backupToDrive/restoreFromDrive in app code.
export const __test__ = {
  getAllDataFromSQLite,
  writeAllDataToSQLite,
  restoreAllDataToSQLite,
  validateBackupData,
}