import * as BackgroundFetch from 'expo-background-fetch'
import * as TaskManager from 'expo-task-manager'

export const BACKUP_TASK_NAME = 'savr-daily-backup'

// Define the background task
TaskManager.defineTask(BACKUP_TASK_NAME, async () => {
  try {
    const { backupToDrive } = await import('./driveBackupService')
    const result = await backupToDrive()
    if (result.success) {
      return BackgroundFetch.BackgroundFetchResult.NewData
    }
    return BackgroundFetch.BackgroundFetchResult.NoData
  } catch {
    return BackgroundFetch.BackgroundFetchResult.Failed
  }
})

// Register the background task
export async function registerBackupTask() {
  try {
    const status = await BackgroundFetch.getStatusAsync()
    if (
      status === BackgroundFetch.BackgroundFetchStatus.Restricted ||
      status === BackgroundFetch.BackgroundFetchStatus.Denied
    ) {
      return false
    }

    const isRegistered = await TaskManager.isTaskRegisteredAsync(BACKUP_TASK_NAME)
    if (!isRegistered) {
      await BackgroundFetch.registerTaskAsync(BACKUP_TASK_NAME, {
        minimumInterval: 60 * 60 * 24, // 24 hours
        stopOnTerminate: false,
        startOnBoot: true,
      })
    }
    return true
  } catch {
    return false
  }
}

// Unregister the background task
export async function unregisterBackupTask() {
  try {
    const isRegistered = await TaskManager.isTaskRegisteredAsync(BACKUP_TASK_NAME)
    if (isRegistered) {
      await BackgroundFetch.unregisterTaskAsync(BACKUP_TASK_NAME)
    }
  } catch {}
}
