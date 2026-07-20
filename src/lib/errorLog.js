import crashlytics from '@react-native-firebase/crashlytics'

export function logError(context, err) {
  try {
    const error = err instanceof Error ? err : new Error(`${context}: ${String(err)}`)
    crashlytics().log(context)
    crashlytics().recordError(error).catch(() => {})
  } catch {}
}
