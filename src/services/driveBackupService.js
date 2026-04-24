import AsyncStorage from '@react-native-async-storage/async-storage'
import * as SecureStore from 'expo-secure-store'
import { getDB } from './sqliteService'
import { getUser } from '../lib/auth'
import { supabase } from '../lib/supabase'

const BACKUP_FILE_NAME = 'savr_backup.json'
const FOLDER_NAME = 'Savr'
const DRIVE_API_BASE = 'https://www.googleapis.com/drive/v3'
const DRIVE_UPLOAD_BASE = 'https://www.googleapis.com/upload/drive/v3'

// ─── GET GOOGLE ACCESS TOKEN ─────────────────────────────────
async function getAccessToken() {
  try {
    // Try refreshing Supabase session first
    const { data: refreshed } = await supabase.auth.refreshSession()
    if (refreshed?.session?.provider_token) {
      await AsyncStorage.setItem('savr_google_token', refreshed.session.provider_token)
      await AsyncStorage.setItem('savr_google_token_time', Date.now().toString())
      return refreshed.session.provider_token
    }

    // Check if stored token is still fresh (under 55 minutes old)
    const tokenTime = await AsyncStorage.getItem('savr_google_token_time')
    const storedToken = await AsyncStorage.getItem('savr_google_token')
    if (storedToken && tokenTime) {
      const age = Date.now() - parseInt(tokenTime)
      const fiftyFiveMinutes = 55 * 60 * 1000
      if (age < fiftyFiveMinutes) return storedToken
    }

    // Try using refresh token via secure Edge Function (client secret never in app)
    // Refresh token is stored in SecureStore since it grants long-term Drive access
    const refreshToken = await SecureStore.getItemAsync('savr_google_refresh_token')
    if (refreshToken) {
      try {
        const response = await fetch(
          'https://fsrbsqhlgfdqugixqtxc.supabase.co/functions/v1/google-token-refresh',
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'apikey': process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
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
      } catch (error) {
        if (__DEV__) console.error('[driveBackup] token refresh failed:', error)
      }
    }

    // Final fallback — return stored token even if possibly expired
    if (storedToken) return storedToken

    return null
  } catch (error) {
    if (__DEV__) console.error('[driveBackup] getAccessToken failed:', error)
    return null
  }
}

// ─── FIND OR CREATE SAVR FOLDER ──────────────────────────────
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
  } catch (error) {
    if (__DEV__) console.error('[driveBackup] getOrCreateFolder failed:', error)
    return null
  }
}

// ─── FIND EXISTING BACKUP FILE ────────────────────────────────
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
  } catch (error) {
    if (__DEV__) console.error('[driveBackup] findBackupFileId failed:', error)
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
  const now = new Date().toISOString()

  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM expenses WHERE user_id = ?', [userId])
    await db.runAsync('DELETE FROM budgets WHERE user_id = ?', [userId])
    await db.runAsync('DELETE FROM recurring_expenses WHERE user_id = ?', [userId])
    await db.runAsync('DELETE FROM spending_goals WHERE user_id = ?', [userId])

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
  })
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

    return {
      success: true,
      backedUpAt: backupPayload.backedUpAt,
      expenseCount: data.expenses.length,
    }
  } catch (e) {
    if (__DEV__) console.error('[driveBackup] backupToDrive failed:', e)
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
    if (__DEV__) console.error('[driveBackup] restoreFromDrive failed:', e)
    return { success: false, error: e.message }
  }
}

// ─── CHECK IF BACKUP EXISTS ───────────────────────────────────
export async function checkBackupExists() {
  try {
    const localTimestamp = await AsyncStorage.getItem('savr_last_backup')
    if (localTimestamp) {
      return { exists: true, modifiedTime: localTimestamp }
    }

    const accessToken = await getAccessToken()
    if (!accessToken) return null

    // Search without folder first to avoid creating unnecessary folders
    let file = await findBackupFileId(accessToken, null)
    if (!file) {
      const folderId = await getOrCreateFolder(accessToken)
      file = await findBackupFileId(accessToken, folderId)
    }
    if (!file) return null

    await AsyncStorage.setItem('savr_last_backup', file.modifiedTime)
    return { exists: true, modifiedTime: file.modifiedTime }
  } catch (error) {
    if (__DEV__) console.error('[driveBackup] checkBackupExists failed:', error)
    return null
  }
}