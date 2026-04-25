import * as BackgroundFetch from 'expo-background-fetch'
import * as TaskManager from 'expo-task-manager'
import AsyncStorage from '@react-native-async-storage/async-storage'

export const BACKUP_TASK_NAME = 'savr-daily-backup'
const LAST_BACKUP_TRIGGER_KEY = 'savr_last_backup_trigger'

TaskManager.defineTask(BACKUP_TASK_NAME, async () => {
  try {
    const now = new Date()
    const hour = now.getHours()
    const today = now.toISOString().split('T')[0]

    // Only run between 1:00 AM - 1:59 AM
    if (hour !== 1) return BackgroundFetch.BackgroundFetchResult.NoData

    const lastTrigger = await AsyncStorage.getItem(LAST_BACKUP_TRIGGER_KEY)
    if (lastTrigger === today) return BackgroundFetch.BackgroundFetchResult.NoData

    const { backupToDrive } = await import('./driveBackupService')
    const result = await backupToDrive()

    if (result.success) {
      await AsyncStorage.setItem(LAST_BACKUP_TRIGGER_KEY, today)
      return BackgroundFetch.BackgroundFetchResult.NewData
    }
    return BackgroundFetch.BackgroundFetchResult.NoData
  } catch {
    return BackgroundFetch.BackgroundFetchResult.Failed
  }
})

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
        minimumInterval: 60 * 60, // check every hour so it catches the 1 AM window
        stopOnTerminate: false,
        startOnBoot: true,
      })
    }
    return true
  } catch {
    return false
  }
}

export async function unregisterBackupTask() {
  try {
    const isRegistered = await TaskManager.isTaskRegisteredAsync(BACKUP_TASK_NAME)
    if (isRegistered) {
      await BackgroundFetch.unregisterTaskAsync(BACKUP_TASK_NAME)
    }
  } catch {}
}