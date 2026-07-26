import AsyncStorage from '@react-native-async-storage/async-storage'
import { GoogleSignin } from '@react-native-google-signin/google-signin'
// Hermes has no built-in TextDecoder (facebook/hermes#1403) but pako's ungzip
// needs one internally for its `toText` option — polyfill before pako runs.
// No-ops if a TextDecoder already exists, so it's safe alongside Hermes's
// native TextEncoder.
import 'fast-text-encoding'
import { gzip, ungzip } from 'pako'
import { getReadyDB } from './sqliteService'
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

// fetch() has no built-in timeout — on a captive portal or a dead network that
// silently drops packets instead of erroring, every Drive call below would
// hang indefinitely instead of failing, leaving backup/restore stuck forever.
// Every network call in this file goes through here so that can't happen.
async function fetchWithTimeout(url, options = {}, timeoutMs = 15000) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...options, signal: controller.signal })
  } finally {
    clearTimeout(timeout)
  }
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
    // Only trust the cache well inside the ~60-min access-token lifetime. A token
    // cached 55 min ago can be dead by the time verifyToken() runs, which then
    // surfaces as a spurious "Sign In Required" — hence the tighter 45-min window.
    if (storedToken && tokenTime) {
      const age = Date.now() - parseInt(tokenTime, 10)
      if (age < 45 * 60 * 1000) return storedToken
    }

    // Refresh via the native Google session. getTokens() returns a FRESH access
    // token when a native session exists (the library refreshes internally), so
    // it's the real fix path — signInSilently() just (re)establishes that session
    // for a user who came in on a cached Supabase session and never hit signIn()
    // this process. Separate try blocks so a signInSilently() that throws
    // NO_SAVED_CREDENTIAL_FOUND doesn't skip an otherwise-usable getTokens().
    try { await GoogleSignin.signInSilently() } catch {}
    try {
      const { accessToken } = await GoogleSignin.getTokens()
      if (accessToken) {
        await setGoogleAccessToken(accessToken)
        await setGoogleAccessTokenCachedAtNow()
        return accessToken
      }
    } catch (e) {
      logError('getAccessToken.getTokens', e)
    }

    // Last resort: a cached token past its trust window. verifyToken() at the
    // call site still gates it, so a truly dead one becomes SESSION_EXPIRED
    // rather than us silently uploading with a bad bearer.
    if (storedToken) return storedToken
    return null
  } catch (e) {
    logError('getAccessToken', e)
    return null
  }
}

// Interactive re-consent for the Drive scope, used when the native Google
// session can't be silently refreshed (e.g. cached-Supabase-session user who
// never hit signIn() this install, or reinstall). Re-runs the full Google
// account picker and caches the fresh token so the next backup succeeds without
// a heavy-handed sign-out/sign-in of the whole app.
export async function reauthorizeDrive() {
  try {
    await GoogleSignin.hasPlayServices()
    await GoogleSignin.signIn()
    const { accessToken } = await GoogleSignin.getTokens()
    if (accessToken) {
      await setGoogleAccessToken(accessToken)
      await setGoogleAccessTokenCachedAtNow()
      return true
    }
    return false
  } catch (e) {
    logError('reauthorizeDrive', e)
    return false
  }
}

async function verifyToken(accessToken) {
  try {
    const response = await fetchWithTimeout(
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
    const searchResponse = await fetchWithTimeout(
      `${DRIVE_API_BASE}/files?q=${encodeURIComponent(folderQuery)}&fields=files(id,name)`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    )
    const searchData = await searchResponse.json()
    if (searchData.files && searchData.files.length > 0) {
      return searchData.files[0].id
    }
    const createResponse = await fetchWithTimeout(
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

async function deleteFile(accessToken, fileId) {
  try {
    await fetchWithTimeout(
      `${DRIVE_API_BASE}/files/${fileId}`,
      { method: 'DELETE', headers: { Authorization: `Bearer ${accessToken}` } }
    )
  } catch {}
}

async function findBackupFileId(accessToken, folderId) {
  try {
    const query = folderId
      ? `name='${BACKUP_FILE_NAME}' and '${folderId}' in parents and trashed=false`
      : `name='${BACKUP_FILE_NAME}' and trashed=false`
    const response = await fetchWithTimeout(
      `${DRIVE_API_BASE}/files?q=${encodeURIComponent(query)}&fields=files(id,name,modifiedTime)`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    )
    const data = await response.json()
    if (!data.files || data.files.length === 0) return null
    if (data.files.length === 1) return data.files[0]

    // More than one savr_backup.json can exist if two uploads ever raced and
    // both missed finding an existing file (each took the create-new path).
    // Keep the most recently modified one and clean up the rest so future
    // lookups don't depend on undefined API ordering to pick the right file.
    const sorted = [...data.files].sort((a, b) => new Date(b.modifiedTime) - new Date(a.modifiedTime))
    const [newest, ...duplicates] = sorted
    await Promise.all(duplicates.map((f) => deleteFile(accessToken, f.id)))
    return newest
  } catch {
    return null
  }
}

async function getAllDataFromSQLite(userId) {
  const db = await getReadyDB()
  const [expenses, budgets, recurring, goals, accounts, income, transfers, recurringIncome, adjustments] = await Promise.all([
    db.getAllAsync('SELECT * FROM expenses WHERE user_id = ?', [userId]),
    db.getAllAsync('SELECT * FROM budgets WHERE user_id = ?', [userId]),
    db.getAllAsync('SELECT * FROM recurring_expenses WHERE user_id = ?', [userId]),
    db.getAllAsync('SELECT * FROM spending_goals WHERE user_id = ?', [userId]),
    db.getAllAsync('SELECT * FROM accounts WHERE user_id = ?', [userId]),
    db.getAllAsync('SELECT * FROM income WHERE user_id = ?', [userId]),
    db.getAllAsync('SELECT * FROM transfers WHERE user_id = ?', [userId]),
    db.getAllAsync('SELECT * FROM recurring_income WHERE user_id = ?', [userId]),
    db.getAllAsync('SELECT * FROM account_adjustments WHERE user_id = ?', [userId]),
  ])
  return { expenses, budgets, recurring, goals, accounts, income, transfers, recurringIncome, adjustments }
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
  adjustments: ['id', 'account_id', 'delta', 'date'],
}

const VALID_FREQUENCIES = ['daily', 'weekly', 'monthly']

// Fields that flow into SQL arithmetic (SUM, balance deltas, roundMoney) and
// must be actual numbers — SQLite is dynamically typed and will silently
// store a string, breaking arithmetic everywhere the value is later read.
const NUMERIC_FIELDS = {
  expenses: ['amount'],
  budgets: ['limit_amount'],
  recurring: ['amount'],
  goals: ['target_amount'],
  accounts: ['balance'],
  income: ['amount'],
  transfers: ['amount'],
  recurringIncome: ['amount'],
  adjustments: ['delta'],
}

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
      for (const field of NUMERIC_FIELDS[key] || []) {
        if (row[field] !== undefined && row[field] !== null && !Number.isFinite(Number(row[field]))) {
          throw new Error(`Invalid backup data: "${key}" row has non-numeric "${field}"`)
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
  await db.runAsync('DELETE FROM account_adjustments WHERE user_id = ?', [userId])

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

  for (const adj of (data.adjustments || [])) {
    await db.runAsync(
      `INSERT OR REPLACE INTO account_adjustments (id, user_id, account_id, delta, note, date, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [adj.id, userId, adj.account_id, adj.delta, adj.note || null, adj.date, adj.created_at || now, adj.updated_at || now]
    )
  }
}

async function restoreAllDataToSQLite(userId, data) {
  validateBackupData(data)

  const db = await getReadyDB()
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
    } catch (snapshotError) {
      // Snapshot re-apply also failed — local rows for this user may now be
      // empty/partial. Surface the original error, but log the snapshot
      // failure too since it's otherwise unrecoverable and invisible.
      logError('restoreAllDataToSQLite:snapshotReapplyFailed', snapshotError)
    }
    throw restoreError
  }
}

export async function generateDataHash(userId) {
  try {
    const db = await getReadyDB()
    // Each table's fingerprint is COUNT + MAX(updated_at) + MIN(updated_at) + a
    // SUM over its primary numeric column. COUNT+MAX alone missed a same-second
    // delete-then-reinsert that kept the row count and newest timestamp
    // unchanged — a real edit that then never got backed up. MIN(updated_at)
    // catches a same-count swap that leaves MAX unchanged, and the numeric SUM
    // catches an in-place amount edit within the same second. `amt` names the
    // per-table numeric column (budgets/goals don't have `amount`).
    const fp = (table, amt) => db.getFirstAsync(
      `SELECT COUNT(*) as count, MAX(updated_at) as latest, MIN(updated_at) as earliest, COALESCE(SUM(${amt}), 0) as total FROM ${table} WHERE user_id = ?`,
      [userId]
    )
    const [exp, inc, acc, tr, bud, rec, goals, recInc, adj] = await Promise.all([
      fp('expenses', 'amount'),
      fp('income', 'amount'),
      fp('accounts', 'balance'),
      fp('transfers', 'amount'),
      fp('budgets', 'limit_amount'),
      fp('recurring_expenses', 'amount'),
      fp('spending_goals', 'target_amount'),
      fp('recurring_income', 'amount'),
      fp('account_adjustments', 'delta'),
    ])
    const p = (row) => `${row?.count || 0}_${row?.latest || ''}_${row?.earliest || ''}_${row?.total || 0}`
    return [exp, inc, acc, tr, bud, rec, goals, recInc, adj].map(p).join('|')
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
    // Gzip the payload before upload — a multi-year user's full transaction
    // history re-uploads on every single edit (no delta sync), so compression
    // is a real bandwidth/time win. Sent as opaque `application/gzip` bytes,
    // not via the `Content-Encoding` header — Drive's handling of that header
    // on uploads is undocumented, so we don't rely on it and instead gunzip
    // explicitly ourselves on restore (see restoreFromDrive).
    const compressed = gzip(jsonContent)
    const folderId = await getOrCreateFolder(accessToken)
    const existingFile = await findBackupFileId(accessToken, folderId)

    if (existingFile) {
      const response = await fetchWithTimeout(
        `${DRIVE_UPLOAD_BASE}/files/${existingFile.id}?uploadType=media`,
        {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/gzip',
          },
          body: compressed,
        },
        30000
      )
      if (!response.ok) {
        const err = await response.json()
        return { success: false, error: err.error?.message || 'Upload failed' }
      }
    } else {
      // Multipart create embeds each part as text in the request body, which
      // can't carry raw gzip bytes safely — upload uncompressed here. This
      // path only runs once ever per user (the very first backup); every
      // subsequent backup goes through the compressed PATCH path above.
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
      const response = await fetchWithTimeout(
        `${DRIVE_UPLOAD_BASE}/files?uploadType=multipart`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': `multipart/related; boundary=${boundary}`,
          },
          body: multipartBody,
        },
        30000
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

    const response = await fetchWithTimeout(
      `${DRIVE_API_BASE}/files/${existingFile.id}?alt=media`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
      30000
    )
    if (!response.ok) return { success: false, error: 'Download failed' }

    // Backups written since gzip support was added are raw gzip bytes; older
    // backups are plain JSON text. Detect by the gzip magic number (0x1f 0x8b)
    // rather than trusting a content-type header, since Drive doesn't reliably
    // preserve the upload's Content-Type on download.
    const bytes = new Uint8Array(await response.arrayBuffer())
    const isGzip = bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b
    let backupPayload
    try {
      const jsonText = isGzip ? ungzip(bytes, { toText: true }) : new TextDecoder().decode(bytes)
      backupPayload = JSON.parse(jsonText)
    } catch {
      return { success: false, error: 'Invalid backup file' }
    }
    if (!backupPayload.data) return { success: false, error: 'Invalid backup file' }

    if (backupPayload.userId && backupPayload.userId !== user.id) {
      return { success: false, error: 'BACKUP_USER_MISMATCH' }
    }

    await restoreAllDataToSQLite(user.id, backupPayload.data)
    await AsyncStorage.setItem('savr_last_backup', backupPayload.backedUpAt)
    // Without this, the next hasDataChanged() check compares against the
    // pre-restore hash, sees a mismatch, and silently re-uploads the data we
    // just downloaded right back to Drive on the next debounced trigger.
    await saveBackupHash(user.id)

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