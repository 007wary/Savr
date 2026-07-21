import { getCachedUser } from '../lib/auth'
import { hasDataChanged, backupToDrive } from './driveBackupService'

let backupTimer = null
let appOpenTimer = null

export async function backupOnAppOpen() {
  if (appOpenTimer) clearTimeout(appOpenTimer)
  appOpenTimer = setTimeout(async () => {
    try {
      const user = getCachedUser()
      if (!user) return
      const changed = await hasDataChanged(user.id)
      if (!changed) return
      await backupToDrive()
    } catch {}
    appOpenTimer = null
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