import * as BackgroundFetch from 'expo-background-fetch'
import * as TaskManager from 'expo-task-manager'
import AsyncStorage from '@react-native-async-storage/async-storage'

export const BACKUP_TASK_NAME = 'savr-daily-backup'
const FCM_BACKUP_TASK_NAME = 'savr-fcm-backup'
const LAST_BACKUP_TRIGGER_KEY = 'savr_last_backup_trigger'

TaskManager.defineTask(BACKUP_TASK_NAME, async () => {
  try {
    const d = new Date()
    const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

    const lastTrigger = await AsyncStorage.getItem(LAST_BACKUP_TRIGGER_KEY)
    if (lastTrigger === today) return BackgroundFetch.BackgroundFetchResult.NoData

    const { loadCachedUser } = await import('../lib/auth')
    const user = await loadCachedUser()
    if (!user) return BackgroundFetch.BackgroundFetchResult.NoData

    const { hasDataChanged, backupToDrive } = await import('./driveBackupService')
    const changed = await hasDataChanged(user.id)
    if (!changed) {
      await AsyncStorage.setItem(LAST_BACKUP_TRIGGER_KEY, today)
      return BackgroundFetch.BackgroundFetchResult.NoData
    }

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

TaskManager.defineTask(FCM_BACKUP_TASK_NAME, async ({ data, error }) => {
  try {
    if (error) return

    const messageData = data?.notification?.data || data?.data || {}
    if (messageData.type !== 'silent_backup') return

    const d = new Date()
    const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

    const lastTrigger = await AsyncStorage.getItem(LAST_BACKUP_TRIGGER_KEY)
    if (lastTrigger === today) return

    const { loadCachedUser } = await import('../lib/auth')
    const user = await loadCachedUser()
    if (!user) return

    const { hasDataChanged, backupToDrive } = await import('./driveBackupService')
    const changed = await hasDataChanged(user.id)
    if (!changed) {
      await AsyncStorage.setItem(LAST_BACKUP_TRIGGER_KEY, today)
      return
    }

    const result = await backupToDrive()
    if (result.success) {
      await AsyncStorage.setItem(LAST_BACKUP_TRIGGER_KEY, today)
    }
  } catch {}
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
        minimumInterval: 60 * 60 * 24,
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

export function registerFCMBackupHandler() {
  try {
    const messaging = require('@react-native-firebase/messaging').default
    messaging().setBackgroundMessageHandler(async (remoteMessage) => {
      try {
        const messageType = remoteMessage?.data?.type
        if (messageType !== 'silent_backup') return

        const d = new Date()
        const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
        const lastTrigger = await AsyncStorage.getItem(LAST_BACKUP_TRIGGER_KEY)
        if (lastTrigger === today) return

        const { loadCachedUser } = await import('../lib/auth')
        const user = await loadCachedUser()
        if (!user) return

        const { hasDataChanged, backupToDrive } = await import('./driveBackupService')
        const changed = await hasDataChanged(user.id)
        if (!changed) {
          await AsyncStorage.setItem(LAST_BACKUP_TRIGGER_KEY, today)
          return
        }

        const result = await backupToDrive()
        if (result.success) {
          await AsyncStorage.setItem(LAST_BACKUP_TRIGGER_KEY, today)
        }
      } catch {}
    })
  } catch {}
}
