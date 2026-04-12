import * as Notifications from 'expo-notifications'
import { Platform } from 'react-native'
import { getCurrencySymbol } from './currency'
import AsyncStorage from '@react-native-async-storage/async-storage'

const WEEKLY_NOTIF_KEY = 'savr_last_weekly_notif'

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

// Check and send weekly summary if due
export async function checkWeeklySummary(expenses) {
  try {
    const granted = await requestNotificationPermission()
    if (!granted) return

    // Only send on Sundays
    const today = new Date()
    const dayOfWeek = today.getDay() // 0 = Sunday
    if (dayOfWeek !== 0) return

    // Only send once per week — check last sent date
    const lastSent = await AsyncStorage.getItem(WEEKLY_NOTIF_KEY)
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
    if (lastSent === todayStr) return

    // Get last 7 days expenses
    const weekExpenses = []
    for (let i = 0; i < 7; i++) {
      const d = new Date()
      d.setDate(d.getDate() - i)
      const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      const dayExpenses = expenses.filter(e => e.date === dateStr)
      weekExpenses.push(...dayExpenses)
    }

    if (weekExpenses.length === 0) return

    const weekTotal = weekExpenses.reduce((sum, e) => sum + parseFloat(e.amount), 0)
    const symbol = await getCurrencySymbol()

    // Find top category
    const catTotals = {}
    weekExpenses.forEach(e => {
      catTotals[e.category] = (catTotals[e.category] || 0) + parseFloat(e.amount)
    })
    const topCat = Object.entries(catTotals).sort((a, b) => b[1] - a[1])[0]

    // Build motivational message
    const dailyAvg = weekTotal / 7
    let message = `You spent ${symbol}${weekTotal.toFixed(0)} this week`
    if (topCat) {
      message += ` · Top: ${topCat[0]} (${symbol}${topCat[1].toFixed(0)})`
    }

    let title = '📊 Weekly Spending Summary'
    if (dailyAvg < 500) title = '🎉 Great week! Spending looks good'
    else if (dailyAvg > 2000) title = '📈 High spending week — review your expenses'

    await sendNotification(title, message)

    // Save today as last sent
    await AsyncStorage.setItem(WEEKLY_NOTIF_KEY, todayStr)
  } catch {
    // Silently fail
  }
}