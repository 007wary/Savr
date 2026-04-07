import * as Notifications from 'expo-notifications'
import { Platform } from 'react-native'
import { getCurrencySymbol } from './currency'

// How notifications appear when app is open
if (Platform.OS !== 'web') {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  })
}

export async function requestNotificationPermission() {
  try {
    const { status: existing } = await Notifications.getPermissionsAsync()
    if (existing === 'granted') return true
    const { status } = await Notifications.requestPermissionsAsync()
    return status === 'granted'
  } catch {
    return false
  }
}

export async function sendNotification(title, body) {
  try {
    const granted = await requestNotificationPermission()
    if (!granted) return
    await Notifications.scheduleNotificationAsync({
      content: { title, body, sound: true },
      trigger: null,
    })
  } catch {
    // Silently fail
  }
}

export async function checkBudgetAlerts(expenses, budgets, currentMonth) {
  try {
    const symbol = await getCurrencySymbol()
    for (const budget of budgets) {
      const spent = expenses
        .filter(e => e.category === budget.category && e.date.startsWith(currentMonth))
        .reduce((sum, e) => sum + parseFloat(e.amount), 0)

      const limit = parseFloat(budget.limit_amount)
      const percentage = (spent / limit) * 100

      if (percentage >= 100) {
        await sendNotification(
          `🚨 Budget Exceeded — ${budget.category}`,
          `You've spent ${symbol}${spent.toFixed(0)} of your ${symbol}${limit.toFixed(0)} budget`
        )
      } else if (percentage >= 80) {
        await sendNotification(
          `⚠️ Budget Warning — ${budget.category}`,
          `You've used ${percentage.toFixed(0)}% of your ${symbol}${limit.toFixed(0)} budget`
        )
      }
    }
  } catch {
    // Silently fail
  }
}