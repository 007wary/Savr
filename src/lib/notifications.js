import * as Notifications from 'expo-notifications'
import { Platform } from 'react-native'
import { getCurrencySymbol, roundMoney } from './currency'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { Analytics } from './analytics'

const WEEKLY_NOTIF_KEY = 'savr_last_weekly_notif'
const BUDGET_NOTIF_KEY = 'savr_budget_notifs_sent'
const FORECAST_NOTIF_KEY = 'savr_forecast_nudge_sent'
export const BUDGET_ALERTS_KEY = 'savr_budget_alerts_enabled'
// Opt-in (default off): a single mid-month heads-up if you're on pace to blow
// past your goal while there's still time to course-correct.
export const FORECAST_NUDGE_KEY = 'savr_forecast_nudge_enabled'

// How notifications appear when app is open
if (Platform.OS !== 'web') {
  Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
})
}

// Single high-importance Android channel that every notification — local alerts
// AND server promo pushes — routes through. Without an explicit channel, Android
// 8+ dumps everything into an OS-created default whose importance we don't
// control, so `sound: true` / heads-up banners silently don't happen. Promos
// only honor this if the FCM payload sets `android.notification.channel_id` to
// this same id. Call once at startup; creating a channel that exists is a no-op.
export const ANDROID_CHANNEL_ID = 'savr-default'

export async function ensureAndroidChannel() {
  if (Platform.OS !== 'android') return
  try {
    await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
      name: 'Reminders & Alerts',
      importance: Notifications.AndroidImportance.HIGH,
      sound: 'default',
      // Keep spend figures visible on the lock screen — they're not secrets to
      // the device owner, and a redacted alert is useless as a budget nudge.
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    })
  } catch {
    // Best-effort — a failed channel create just falls back to the OS default.
  }
}

export async function requestNotificationPermission() {
  try {
    const { status: existing } = await Notifications.getPermissionsAsync()
    if (existing === 'granted') return 'granted'
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
      trigger: Platform.OS === 'android' ? { channelId: ANDROID_CHANNEL_ID } : null,
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
      const spent = roundMoney(expenses
        .filter(e => e.category === budget.category && e.date.startsWith(currentMonth))
        .reduce((sum, e) => sum + parseFloat(e.amount), 0))

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

// Mid-month forecast nudge. Opt-in, once per month, only when the user is
// actually projected to overshoot their goal AND there's still time to act.
// `forecast` is the object from forecastMonthEnd() (may be null). Silence when
// on-track is intentional — this app doesn't nag.
export async function checkForecastNudge(forecast, currentMonth) {
  try {
    if (!forecast || !forecast.goal || !forecast.willExceedGoal) return

    const granted = await isNotificationGranted()
    if (!granted) return

    // Opt-in preference (defaults off — only fires if explicitly enabled).
    const enabled = await AsyncStorage.getItem(FORECAST_NUDGE_KEY)
    if (enabled !== 'true') return

    // Only nudge in the middle stretch of the month: early is noise (pace isn't
    // trustworthy yet), late is too little runway to matter.
    if (forecast.dayOfMonth < 12 || forecast.dayOfMonth > 20) return

    // Once per calendar month, hard cap.
    const lastSent = await AsyncStorage.getItem(FORECAST_NOTIF_KEY)
    if (lastSent === currentMonth) return

    const symbol = await getCurrencySymbol()
    await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Trending over budget',
        body: `At your current pace you'll finish around ${symbol}${forecast.projectedTotal.toLocaleString('en-US')} — ${symbol}${forecast.projectedOverGoal.toLocaleString('en-US')} over your goal. Keep it under ${symbol}${forecast.safeDailySpend.toLocaleString('en-US')}/day to stay on track.`,
        sound: true,
        data: { type: 'forecast_nudge' },
      },
      trigger: Platform.OS === 'android' ? { channelId: ANDROID_CHANNEL_ID } : null,
    })
    Analytics.forecastNudgeSent()
    await AsyncStorage.setItem(FORECAST_NOTIF_KEY, currentMonth)
  } catch {
    // Silently fail
  }
}

// Given a tapped notification's response, return where the app should go and
// which analytics event to fire, based on the notification's data.type. Keeps
// the routing table in one place instead of scattered across the layout.
// Returns { route, event } — either may be null.
export function resolveNotificationTap(response) {
  const type = response?.notification?.request?.content?.data?.type
  switch (type) {
    case 'forecast_nudge':
      return { route: '/(tabs)/dashboard', event: 'forecastNudgeOpened' }
    case 'streak_reminder':
      return { route: '/(tabs)/add', event: null }
    default:
      return { route: null, event: null }
  }
}

const DAILY_REMINDER_ID_KEY = 'savr_daily_reminder_id'

export async function scheduleStreakReminder(streak = 0) {
  try {
    const granted = await isNotificationGranted()
    if (!granted) return

    const existingId = await AsyncStorage.getItem(DAILY_REMINDER_ID_KEY)
    if (existingId) {
      await Notifications.cancelScheduledNotificationAsync(existingId).catch(() => {})
    }

    const title = streak > 0
      ? `${streak} day streak — keep it going!`
      : 'Log your expenses today'
    const body = streak > 0
      ? `Don't break your ${streak} day streak. Log an expense before midnight.`
      : 'Tap to add an expense and start building your streak.'

    const id = await Notifications.scheduleNotificationAsync({
      content: { title, body, sound: true, data: { type: 'streak_reminder' } },
      // Must carry an explicit `type` — expo-notifications >=0.29 rejects a bare
      // { hour, minute, repeats } object (throws in parseTrigger), which the
      // empty catch below would swallow, silently never scheduling anything.
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour: 21,
        minute: 0,
        ...(Platform.OS === 'android' ? { channelId: ANDROID_CHANNEL_ID } : {}),
      },
    })

    await AsyncStorage.setItem(DAILY_REMINDER_ID_KEY, id)
  } catch {}
}

export async function cancelStreakReminder() {
  try {
    const existingId = await AsyncStorage.getItem(DAILY_REMINDER_ID_KEY)
    if (existingId) {
      await Notifications.cancelScheduledNotificationAsync(existingId).catch(() => {})
      await AsyncStorage.removeItem(DAILY_REMINDER_ID_KEY)
    }
  } catch {}
}

export async function checkWeeklySummary(expenses) {
  try {
    const granted = await isNotificationGranted()
    if (!granted) return

    // Only send on Sundays
    const today = new Date()
    const dayOfWeek = today.getDay()
    if (dayOfWeek !== 0) return

    const toLocalDateStr = (d) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

    const todayStr = toLocalDateStr(today)
    const lastSent = await AsyncStorage.getItem(WEEKLY_NOTIF_KEY)
    if (lastSent === todayStr) return

    // Get last 7 days expenses
    const weekExpenses = []
    for (let i = 0; i < 7; i++) {
      const d = new Date()
      d.setDate(d.getDate() - i)
      const dateStr = toLocalDateStr(d)
      weekExpenses.push(...expenses.filter(e => e.date === dateStr))
    }

    if (weekExpenses.length === 0) return

    const weekTotal = roundMoney(weekExpenses.reduce((sum, e) => sum + parseFloat(e.amount), 0))
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