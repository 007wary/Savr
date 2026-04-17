import { getDB } from './sqliteService'
import { getUser } from '../lib/auth'
import { supabase } from '../lib/supabase'

const BACKUP_FILE_NAME = 'savr_backup.json'
const DRIVE_API_BASE = 'https://www.googleapis.com/drive/v3'
const DRIVE_UPLOAD_BASE = 'https://www.googleapis.com/upload/drive/v3'

async function getAccessToken() {
  try {
    const { data: { session } } = await supabase.auth.getSession()
    if (session?.provider_token) return session.provider_token

    // Fallback to stored token
    const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default
    const stored = await AsyncStorage.getItem('savr_google_token')
    if (stored) return stored

    return null
  } catch {
    return null
  }
}

async function findBackupFileId(accessToken) {
  try {
    const response = await fetch(
      `${DRIVE_API_BASE}/files?q=name='${BACKUP_FILE_NAME}'&fields=files(id,name,modifiedTime)`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    )
    const data = await response.json()
    if (data.files && data.files.length > 0) return data.files[0]
    return null
  } catch {
    return null
  }
}

// ─── READ ALL DATA FROM SQLITE ────────────────────────────────
async function getAllDataFromSQLite(userId) {
  const db = await getDB()
  const expenses = await db.getAllAsync('SELECT * FROM expenses WHERE user_id = ?', [userId])
  const budgets = await db.getAllAsync('SELECT * FROM budgets WHERE user_id = ?', [userId])
  const recurring = await db.getAllAsync('SELECT * FROM recurring_expenses WHERE user_id = ?', [userId])
  const goals = await db.getAllAsync('SELECT * FROM spending_goals WHERE user_id = ?', [userId])
  return { expenses, budgets, recurring, goals }
}

// ─── WRITE ALL DATA TO SQLITE ─────────────────────────────────
async function restoreAllDataToSQLite(userId, data) {
  const db = await getDB()

  await db.runAsync('DELETE FROM expenses WHERE user_id = ?', [userId])
  await db.runAsync('DELETE FROM budgets WHERE user_id = ?', [userId])
  await db.runAsync('DELETE FROM recurring_expenses WHERE user_id = ?', [userId])
  await db.runAsync('DELETE FROM spending_goals WHERE user_id = ?', [userId])

  const now = new Date().toISOString()

  for (const e of (data.expenses || [])) {
    await db.runAsync(
      `INSERT OR REPLACE INTO expenses (id, user_id, amount, category, note, date, is_recurring, recurring_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [e.id, userId, e.amount, e.category, e.note, e.date, e.is_recurring || 0, e.recurring_id, e.created_at || now, e.updated_at || now]
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
      `INSERT OR REPLACE INTO recurring_expenses (id, user_id, amount, category, note, frequency, next_due, last_logged, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [r.id, userId, r.amount, r.category, r.note, r.frequency, r.next_due, r.last_logged, r.is_active ?? 1, r.created_at || now, r.updated_at || now]
    )
  }

  for (const g of (data.goals || [])) {
    await db.runAsync(
      `INSERT OR REPLACE INTO spending_goals (id, user_id, title, target_amount, current_amount, deadline, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [g.id, userId, g.title, g.target_amount, g.current_amount || 0, g.deadline, g.created_at || now, g.updated_at || now]
    )
  }
}

// ─── BACKUP TO GOOGLE DRIVE ───────────────────────────────────
export async function backupToDrive() {
  try {
    const accessToken = await getAccessToken()
    if (!accessToken) return { success: false, error: 'NO_TOKEN' }

    const user = await getUser()
    if (!user) return { success: false, error: 'No user found' }

    const data = await getAllDataFromSQLite(user.id)

    const backupPayload = {
      version: 1,
      userId: user.id,
      email: user.email,
      backedUpAt: new Date().toISOString(),
      data,
    }

    const jsonContent = JSON.stringify(backupPayload)
    const existingFile = await findBackupFileId(accessToken)

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
      const metadata = { name: BACKUP_FILE_NAME }
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

    return {
      success: true,
      backedUpAt: backupPayload.backedUpAt,
      expenseCount: data.expenses.length,
    }
  } catch (e) {
    return { success: false, error: e.message }
  }
}

// ─── RESTORE FROM GOOGLE DRIVE ────────────────────────────────
export async function restoreFromDrive() {
  try {
    const accessToken = await getAccessToken()
    if (!accessToken) return { success: false, error: 'NO_TOKEN' }

    const user = await getUser()
    if (!user) return { success: false, error: 'No user found' }

    const existingFile = await findBackupFileId(accessToken)
    if (!existingFile) return { success: false, error: 'NO_BACKUP' }

    const response = await fetch(
      `${DRIVE_API_BASE}/files/${existingFile.id}?alt=media`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    )
    if (!response.ok) return { success: false, error: 'Download failed' }

    const backupPayload = await response.json()
    if (!backupPayload.data) return { success: false, error: 'Invalid backup file' }

    await restoreAllDataToSQLite(user.id, backupPayload.data)

    return {
      success: true,
      backedUpAt: backupPayload.backedUpAt,
      expenseCount: backupPayload.data.expenses?.length || 0,
    }
  } catch (e) {
    return { success: false, error: e.message }
  }
}

// ─── CHECK IF BACKUP EXISTS ───────────────────────────────────
export async function checkBackupExists() {
  try {
    const accessToken = await getAccessToken()
    if (!accessToken) return null
    const file = await findBackupFileId(accessToken)
    if (!file) return null
    return { exists: true, modifiedTime: file.modifiedTime }
  } catch {
    return null
  }
}