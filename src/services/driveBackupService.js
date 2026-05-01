import AsyncStorage from '@react-native-async-storage/async-storage'
import * as SecureStore from 'expo-secure-store'
import { getDB } from './sqliteService'
import { getUser, getCachedUser } from '../lib/auth'
import { supabase } from '../lib/supabase'

const BACKUP_FILE_NAME = 'savr_backup.json'
const FOLDER_NAME = 'Savr'
const DRIVE_API_BASE = 'https://www.googleapis.com/drive/v3'
const DRIVE_UPLOAD_BASE = 'https://www.googleapis.com/upload/drive/v3'

async function getAccessToken() {
  try {
    // Check cached token FIRST — avoid network call if still fresh
    const tokenTime = await AsyncStorage.getItem('savr_google_token_time')
    const storedToken = await AsyncStorage.getItem('savr_google_token')
    if (storedToken && tokenTime) {
      const age = Date.now() - parseInt(tokenTime)
      if (age < 55 * 60 * 1000) return storedToken
    }

    // Token expired or missing — try Supabase session refresh
    const { data: refreshed } = await supabase.auth.refreshSession()
    if (refreshed?.session?.provider_token) {
      await AsyncStorage.setItem('savr_google_token', refreshed.session.provider_token)
      await AsyncStorage.setItem('savr_google_token_time', Date.now().toString())
      return refreshed.session.provider_token
    }

    // Migrate refresh token from AsyncStorage to SecureStore if needed
    // This handles users who had the old version before SecureStore fix
    let refreshToken = await SecureStore.getItemAsync('savr_google_refresh_token')
    if (!refreshToken) {
      const oldToken = await AsyncStorage.getItem('savr_google_refresh_token')
      if (oldToken) {
        await SecureStore.setItemAsync('savr_google_refresh_token', oldToken)
        await AsyncStorage.removeItem('savr_google_refresh_token')
        refreshToken = oldToken
      }
    }

    // Try using refresh token via secure Edge Function
    if (refreshToken) {
      try {
        const response = await fetch(
          'https://fsrbsqhlgfdqugixqtxc.supabase.co/functions/v1/google-token-refresh',
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'apikey': process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable_fTC_70PzCNPOs0_sNh1nEQ_Boj4EjqC',
            },
            body: JSON.stringify({ refresh_token: refreshToken }),
          }
        )
        const data = await response.json()
        if (data.access_token) {
          await AsyncStorage.setItem('savr_google_token', data.access_token)
          await AsyncStorage.setItem('savr_google_token_time', Date.now().toString())
          return data.access_token
        }
      } catch {}
    }

    // Final fallback — return stored token even if possibly expired
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
    const searchResponse = await fetch(
      `${DRIVE_API_BASE}/files?q=name='${FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false&fields=files(id,name)`,
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
  const expenses = await db.getAllAsync('SELECT * FROM expenses WHERE user_id = ?', [userId])
  const budgets = await db.getAllAsync('SELECT * FROM budgets WHERE user_id = ?', [userId])
  const recurring = await db.getAllAsync('SELECT * FROM recurring_expenses WHERE user_id = ?', [userId])
  const goals = await db.getAllAsync('SELECT * FROM spending_goals WHERE user_id = ?', [userId])
  const accounts = await db.getAllAsync('SELECT * FROM accounts WHERE user_id = ?', [userId])
  const income = await db.getAllAsync('SELECT * FROM income WHERE user_id = ?', [userId])
  const transfers = await db.getAllAsync('SELECT * FROM transfers WHERE user_id = ?', [userId])
  const recurringIncome = await db.getAllAsync('SELECT * FROM recurring_income WHERE user_id = ?', [userId])
  return { expenses, budgets, recurring, goals, accounts, income, transfers, recurringIncome }
}

async function restoreAllDataToSQLite(userId, data) {
  const db = await getDB()
  const now = new Date().toISOString()

  await db.withTransactionAsync(async () => {
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

    for (const a of (data.accounts || [])) {
      await db.runAsync(
        `INSERT OR REPLACE INTO accounts (id, user_id, name, type, balance, currency, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [a.id, userId, a.name, a.type, a.balance || 0, a.currency || 'INR', a.created_at || now, a.updated_at || now]
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
        `INSERT OR REPLACE INTO recurring_income (id, user_id, amount, category, note, frequency, next_due, last_logged, is_active, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [ri.id, userId, ri.amount, ri.category, ri.note, ri.frequency, ri.next_due, ri.last_logged, ri.is_active ?? 1, ri.created_at || now, ri.updated_at || now]
      )
    }
  })
}

export async function generateDataHash(userId) {
  try {
    const db = await getDB()
    const [exp, inc, acc, tr] = await Promise.all([
      db.getFirstAsync(`SELECT COUNT(*) as count, MAX(updated_at) as latest FROM expenses WHERE user_id = ?`, [userId]),
      db.getFirstAsync(`SELECT COUNT(*) as count, MAX(updated_at) as latest FROM income WHERE user_id = ?`, [userId]),
      db.getFirstAsync(`SELECT COUNT(*) as count, MAX(updated_at) as latest FROM accounts WHERE user_id = ?`, [userId]),
      db.getFirstAsync(`SELECT COUNT(*) as count, MAX(updated_at) as latest FROM transfers WHERE user_id = ?`, [userId]),
    ])
    return `${exp?.count || 0}_${exp?.latest || ''}_${inc?.count || 0}_${inc?.latest || ''}_${acc?.count || 0}_${acc?.latest || ''}_${tr?.count || 0}_${tr?.latest || ''}`
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

    // Never backup empty database — prevents overwriting real backup
    const data = await getAllDataFromSQLite(user.id)
    if (!data.expenses || data.expenses.length === 0) {
      return { success: false, error: 'NO_DATA' }
    }

    const accessToken = await getAccessToken()
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

    await restoreAllDataToSQLite(user.id, backupPayload.data)
    await AsyncStorage.setItem('savr_last_backup', backupPayload.backedUpAt)

    return {
      success: true,
      backedUpAt: backupPayload.backedUpAt,
      expenseCount: backupPayload.data.expenses?.length || 0,
    }
  } catch (e) {
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