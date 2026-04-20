import * as Notifications from 'expo-notifications'
import { Platform } from 'react-native'
import { getCurrencySymbol } from './currency'
import AsyncStorage from '@react-native-async-storage/async-storage'

const WEEKLY_NOTIF_KEY = 'savr_last_weekly_notif'
const BUDGET_NOTIF_KEY = 'savr_budget_notifs_sent'

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
  } catch {}
}

export async function checkBudgetAlerts(expenses, budgets, currentMonth) {
  try {
    const symbol = await getCurrencySymbol()
    const sentRaw = await AsyncStorage.getItem(BUDGET_NOTIF_KEY)
    const sent = sentRaw ? JSON.parse(sentRaw) : {}
    let updated = false

    for (const budget of budgets) {
      const spent = expenses
        .filter(e => e.category === budget.category && e.date.startsWith(currentMonth))
        .reduce((sum, e) => sum + parseFloat(e.amount), 0)

      const limit = parseFloat(budget.limit_amount)
      const percentage = (spent / limit) * 100

      const key100 = `${currentMonth}_${budget.category}_100`
      const key80 = `${currentMonth}_${budget.category}_80`

      if (percentage >= 100 && !sent[key100]) {
        await sendNotification(
          `Budget Exceeded - ${budget.category}`,
          `You have spent ${symbol}${spent.toFixed(0)} of your ${symbol}${limit.toFixed(0)} budget`
        )
        sent[key100] = true
        updated = true
      } else if (percentage >= 80 && !sent[key80]) {
        await sendNotification(
          `Budget Warning - ${budget.category}`,
          `You have used ${percentage.toFixed(0)}% of your ${symbol}${limit.toFixed(0)} budget`
        )
        sent[key80] = true
        updated = true
      }
    }

    if (updated) {
      await AsyncStorage.setItem(BUDGET_NOTIF_KEY, JSON.stringify(sent))
    }
  } catch {}
}

export async function checkWeeklySummary(expenses) {
  try {
    const granted = await requestNotificationPermission()
    if (!granted) return

    const today = new Date()
    const dayOfWeek = today.getDay()
    if (dayOfWeek !== 0) return

    const todayStr = today.toISOString().split('T')[0]
    const lastSent = await AsyncStorage.getItem(WEEKLY_NOTIF_KEY)
    if (lastSent === todayStr) return

    const weekExpenses = []
    for (let i = 0; i < 7; i++) {
      const d = new Date()
      d.setDate(d.getDate() - i)
      const dateStr = d.toISOString().split('T')[0]
      weekExpenses.push(...expenses.filter(e => e.date === dateStr))
    }

    if (weekExpenses.length === 0) return

    const weekTotal = weekExpenses.reduce((sum, e) => sum + parseFloat(e.amount), 0)
    const symbol = await getCurrencySymbol()

    const catTotals = {}
    weekExpenses.forEach(e => {
      catTotals[e.category] = (catTotals[e.category] || 0) + parseFloat(e.amount)
    })
    const topCat = Object.entries(catTotals).sort((a, b) => b[1] - a[1])[0]

    const expenseCount = weekExpenses.length
    let message = `You made ${expenseCount} expense${expenseCount !== 1 ? 's' : ''} totalling ${symbol}${weekTotal.toFixed(0)} this week`
    if (topCat) message += ` - Top: ${topCat[0]} (${symbol}${topCat[1].toFixed(0)})`

    // Title based on expense count rather than currency-specific amounts
    let title = 'Weekly Spending Summary'
    if (expenseCount <= 5) title = '🎉 Great week! Low spending activity'
    else if (expenseCount >= 20) title = '📊 Busy week - review your expenses'

    await sendNotification(title, message)
    await AsyncStorage.setItem(WEEKLY_NOTIF_KEY, todayStr)
  } catch {}
}