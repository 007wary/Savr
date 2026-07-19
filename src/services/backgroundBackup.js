import { getCachedUser } from '../lib/auth'
import { hasDataChanged, backupToDrive } from './driveBackupService'

let backupTimer = null

export async function backupOnAppOpen() {
  setTimeout(async () => {
    try {
      const user = getCachedUser()
      if (!user) return
      const changed = await hasDataChanged(user.id)
      if (!changed) return
      await backupToDrive()
    } catch {}
  }, 30 * 1000)
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
  }, 30 * 1000)
}