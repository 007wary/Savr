import AsyncStorage from '@react-native-async-storage/async-storage'
import { getCachedUser } from '../lib/auth'
import { hasDataChanged, backupToDrive } from './driveBackupService'
import { Analytics } from '../lib/analytics'

const DEBOUNCE_MS = 30 * 1000
// A steady stream of triggers under 30s apart (e.g. someone editing several
// transactions in a row) keeps resetting the debounce and could in theory
// delay backup indefinitely. Force a flush once a burst has been running this
// long, regardless of how recently the last trigger fired.
const MAX_WAIT_MS = 2 * 60 * 1000

const FAILURE_COUNT_KEY = 'savr_backup_consecutive_failures'
// Only alert after several failures in a row — a single failed attempt is
// usually just a momentary offline blip and not worth surfacing.
const FAILURE_NOTIFY_THRESHOLD = 3

let backupTimer = null
let maxWaitTimer = null
// Serializes every backup attempt — debounced triggers AND the manual
// "Backup Now" button both funnel through runBackup() below, so two calls
// landing at the same moment run one after another instead of concurrently.
// Without this, a background debounce firing at the same instant as a manual
// backup could both miss finding an existing Drive file and each create their
// own, leaving two duplicate backup files with no cleanup.
let backupChain = Promise.resolve()

// NO_DATA means there was nothing to back up, not that the backup attempt
// failed — excluded so it doesn't skew the backup_failed signal.
function trackBackupResult(result) {
  if (result.success) return Analytics.backupSuccess()
  if (result.error !== 'NO_DATA') Analytics.backupFailed()
}

async function notifyIfRepeatedlyFailing() {
  try {
    const raw = await AsyncStorage.getItem(FAILURE_COUNT_KEY)
    const count = raw ? parseInt(raw, 10) : 0
    if (count !== FAILURE_NOTIFY_THRESHOLD) return // only fire once per streak, not on every failure past it
    const { sendNotification } = await import('../lib/notifications')
    await sendNotification(
      'Backup hasn’t run in a while',
      'Your data hasn’t backed up to Drive in several tries. Open Savr and check your connection.'
    )
  } catch {}
}

async function runBackup() {
  clearMaxWaitTimer()
  try {
    const user = getCachedUser()
    if (!user) return
    const changed = await hasDataChanged(user.id)
    if (!changed) return
    Analytics.backupStarted()
    const result = await backupToDrive()
    trackBackupResult(result)
    const nextCount = result.success ? 0 : (parseInt((await AsyncStorage.getItem(FAILURE_COUNT_KEY)) || '0', 10) + 1)
    await AsyncStorage.setItem(FAILURE_COUNT_KEY, String(nextCount))
    if (!result.success) await notifyIfRepeatedlyFailing()
  } catch {}
}

function clearMaxWaitTimer() {
  if (maxWaitTimer) {
    clearTimeout(maxWaitTimer)
    maxWaitTimer = null
  }
}

function flush() {
  if (backupTimer) {
    clearTimeout(backupTimer)
    backupTimer = null
  }
  clearMaxWaitTimer()
  backupChain = backupChain.then(runBackup)
}

// Debounced Drive backup. A burst of triggers (app open, foreground, several
// edits) collapses into a single upload 30s after the last one — the shared
// timer means an app-open and a post-edit trigger coalesce instead of racing.
function requestBackup() {
  if (!maxWaitTimer) maxWaitTimer = setTimeout(flush, MAX_WAIT_MS)
  if (backupTimer) clearTimeout(backupTimer)
  backupTimer = setTimeout(flush, DEBOUNCE_MS)
}

export const backupOnAppOpen = requestBackup
export const scheduleBackup = requestBackup

// Immediate backup for the manual "Backup Now" button — cancels any pending
// debounced run (it'd be redundant) and chains onto the same serialization
// queue as the debounced path so it can never race a background upload.
export function backupNow() {
  if (backupTimer) {
    clearTimeout(backupTimer)
    backupTimer = null
  }
  clearMaxWaitTimer()
  backupChain = backupChain.then(async () => {
    Analytics.backupStarted()
    const result = await backupToDrive()
    trackBackupResult(result)
    await AsyncStorage.setItem(FAILURE_COUNT_KEY, result.success ? '0' : String((parseInt((await AsyncStorage.getItem(FAILURE_COUNT_KEY)) || '0', 10) + 1)))
    return result
  })
  return backupChain
}
