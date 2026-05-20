import AsyncStorage from '@react-native-async-storage/async-storage'
import { getCachedUser } from '../lib/auth'
import { hasDataChanged, backupToDrive } from './driveBackupService'

let backupTimer = null

export async function backupOnAppOpen() {
  try {
    const user = getCachedUser()
    if (!user) return
    const changed = await hasDataChanged(user.id)
    if (!changed) return
    await backupToDrive()
  } catch {}
}

export function scheduleBackup() {
  if (backupTimer) clearTimeout(backupTimer)
  backupTimer = setTimeout(async () => {
    try {
      const user = getCachedUser()
      if (!user) return
      const changed = await hasDataChanged(user.id)
      if (!changed) return
      await backupToDrive()
    } catch {}
    backupTimer = null
  }, 60 * 1000)
}