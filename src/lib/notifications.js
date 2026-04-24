import * as Notifications from 'expo-notifications'
import { Platform } from 'react-native'
import { getCurrencySymbol } from './currency'
import AsyncStorage from '@react-native-async-storage/async-storage'

const WEEKLY_NOTIF_KEY = 'savr_last_weekly_notif'
const BUDGET_NOTIF_KEY = 'savr_budget_notifs_sent'
export const BUDGET_ALERTS_KEY = 'savr_budget_alerts_enabled'

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
    if (existing === 'granted') return 'granted'
    if (existing === 'denied') return 'denied'
    const { status } = await Notifications.requestPermissionsAsync()
    return status
  } catch {
    return 'denied'
  }
}

export async function isNotificationGranted() {
  try {
    const { status } = await Notifications.getPermissionsAsync()
    return status === 'granted'
  } catch {
    return false
  }
}

async function sendNotification(title, body) {
  try {
    const granted = await isNotificationGranted()
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
    // Check system permission
    const granted = await isNotificationGranted()
    if (!granted) return

    // Check in-app budget alerts preference
    const budgetAlertsEnabled = await AsyncStorage.getItem(BUDGET_ALERTS_KEY)
    if (budgetAlertsEnabled === 'false') return

    const symbol = await getCurrencySymbol()

    // Track which alerts already sent this month to avoid spam
    const sentRaw = await AsyncStorage.getItem(BUDGET_NOTIF_KEY)
    const sent = sentRaw ? JSON.parse(sentRaw) : {}
    let updated = false

    for (const budget of budgets) {
      const spent = expenses
        .filter(e => e.category === budget.category && e.date.startsWith(currentMonth))
        .reduce((sum, e) => sum + parseFloat(e.amount), 0)

      const limit = parseFloat(budget.limit_amount)
      if (!limit || limit <= 0) continue

      const percentage = (spent / limit) * 100

      const key100 = `${currentMonth}_${budget.category}_100`
      const key80 = `${currentMonth}_${budget.category}_80`

      if (percentage >= 100 && !sent[key100]) {
        await sendNotification(
          `Budget Exceeded \u2014 ${budget.category}`,
          `You spent ${symbol}${spent.toFixed(0)} of your ${symbol}${limit.toFixed(0)} budget`
        )
        sent[key100] = true
        updated = true
      } else if (percentage >= 80 && percentage < 100 && !sent[key80]) {
        await sendNotification(
          `Budget Warning \u2014 ${budget.category}`,
          `You've used ${percentage.toFixed(0)}% of your ${symbol}${limit.toFixed(0)} budget`
        )
        sent[key80] = true
        updated = true
      }
    }

    if (updated) {
      await AsyncStorage.setItem(BUDGET_NOTIF_KEY, JSON.stringify(sent))
    }
  } catch {
    // Silently fail
  }
}

export async function checkWeeklySummary(expenses) {
  try {
    const granted = await isNotificationGranted()
    if (!granted) return

    // Only send on Sundays
    const today = new Date()
    const dayOfWeek = today.getDay()
    if (dayOfWeek !== 0) return

    const todayStr = today.toISOString().split('T')[0]
    const lastSent = await AsyncStorage.getItem(WEEKLY_NOTIF_KEY)
    if (lastSent === todayStr) return

    // Get last 7 days expenses
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
    if (topCat) message += ` \u00B7 Top: ${topCat[0]} (${symbol}${topCat[1].toFixed(0)})`

    let title = 'Weekly Spending Summary'
    if (expenseCount <= 5) title = '\uD83C\uDF89 Great week! Low spending activity'
    else if (expenseCount >= 20) title = '\uD83D\uDCCA Busy week \u2014 review your expenses'

    await sendNotification(title, message)
    await AsyncStorage.setItem(WEEKLY_NOTIF_KEY, todayStr)
  } catch {
    // Silently fail
  }
}