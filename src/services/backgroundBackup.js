import { getCachedUser } from '../lib/auth'
import { hasDataChanged, backupToDrive } from './driveBackupService'

let backupTimer = null

// Debounced Drive backup. A burst of triggers (app open, foreground, several
// edits) collapses into a single upload 30s after the last one — the shared
// timer means an app-open and a post-edit trigger coalesce instead of racing.
function requestBackup() {
  if (backupTimer) clearTimeout(backupTimer)
  backupTimer = setTimeout(async () => {
    backupTimer = null
    try {
      const user = getCachedUser()
      if (!user) return
      const changed = await hasDataChanged(user.id)
      if (!changed) return
      await backupToDrive()
    } catch {}
  }, 30 * 1000)
}

export const backupOnAppOpen = requestBackup
export const scheduleBackup = requestBackup
