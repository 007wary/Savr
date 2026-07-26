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

export async function sendNotification(title, body) {
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

// checkBudgetAlerts can be called twice in close succession (after add-expense,
// then again on the dashboard-load it navigates into). Both read-then-write the
// same AsyncStorage dedup map, so without serializing them a second caller can
// read a stale "not yet sent" state before the first caller's write lands and
// send a duplicate alert. Chain every call onto this promise so they run one at
// a time instead of overlapping.
let budgetAlertsQueue = Promise.resolve()

export function checkBudgetAlerts(expenses, budgets, currentMonth) {
  budgetAlertsQueue = budgetAlertsQueue.then(() => runBudgetAlertsCheck(expenses, budgets, currentMonth))
  return budgetAlertsQueue
}

async function runBudgetAlertsCheck(expenses, budgets, currentMonth) {
  try {
    // Check system permission
    const granted = await isNotificationGranted()
    if (!granted) return

    // Check in-app budget alerts preference
    const budgetAlertsEnabled = await AsyncStorage.getItem(BUDGET_ALERTS_KEY)
    if (budgetAlertsEnabled === 'false') return

    const symbol = await getCurrencySymbol()

    // Track which alerts already sent this month to avoid spam.
    const sentRaw = await AsyncStorage.getItem(BUDGET_NOTIF_KEY)
    const sent = sentRaw ? JSON.parse(sentRaw) : {}

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
        sent[key100] = true
        await AsyncStorage.setItem(BUDGET_NOTIF_KEY, JSON.stringify(sent))
        await sendNotification(
          `Budget Exceeded \u2014 ${budget.category}`,
          `You spent ${symbol}${spent.toFixed(0)} of your ${symbol}${limit.toFixed(0)} budget`
        )
      } else if (percentage >= 80 && percentage < 100 && !sent[key80]) {
        sent[key80] = true
        await AsyncStorage.setItem(BUDGET_NOTIF_KEY, JSON.stringify(sent))
        await sendNotification(
          `Budget Warning \u2014 ${budget.category}`,
          `You've used ${percentage.toFixed(0)}% of your ${symbol}${limit.toFixed(0)} budget`
        )
      }
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

const DAILY_REMINDER_IDS_KEY = 'savr_daily_reminder_ids'
// How many days out to pre-schedule. A single repeating DAILY trigger can't
// vary its copy per-fire, and a lapsed user who never reopens the app never
// triggers a reschedule — so the escalating lapse copy below has to be
// pre-baked into individually-dated notifications scheduled all at once,
// not decided at fire time.
const LAPSE_SCHEDULE_DAYS = 21

// Copy for a user who hasn't logged anything by day N, escalating with how
// long they've been away. A static "log your expenses today" every night for
// weeks reads as noise and gets tuned out — varying the message (and
// eventually going quiet past LAPSE_SCHEDULE_DAYS) gives a lapsed user a
// specific reason to come back instead of the same ignorable ping.
function lapseCopy(daysOut) {
  if (daysOut >= 14) return { title: 'We miss you at Savr', body: "It's been 2 weeks — pick up where you left off, your data's still here." }
  if (daysOut >= 7) return { title: 'A week of unlogged spending', body: 'Catching up now is easier than guessing later. Takes 10 seconds.' }
  if (daysOut >= 3) return { title: '3 days off track', body: "Log today's expenses to keep your spending picture accurate." }
  return { title: 'Log your expenses today', body: 'Tap to add an expense and start building your streak.' }
}

// Called from multiple places close together at app start/dashboard load
// (app-start cached-user path, SIGNED_IN handler, every dashboard load) — each
// call reads-then-cancels-then-rewrites the same pending-IDs list, so without
// serializing, two overlapping calls can race and leave a stray duplicate
// notification. Chain onto this promise so calls run one at a time, same
// pattern as checkBudgetAlerts above.
let streakReminderQueue = Promise.resolve()

export function scheduleStreakReminder(streak = 0) {
  streakReminderQueue = streakReminderQueue.then(() => runScheduleStreakReminder(streak))
  return streakReminderQueue
}

async function runScheduleStreakReminder(streak = 0) {
  try {
    const granted = await isNotificationGranted()
    if (!granted) return

    const existingIdsRaw = await AsyncStorage.getItem(DAILY_REMINDER_IDS_KEY)
    if (existingIdsRaw) {
      const existingIds = JSON.parse(existingIdsRaw)
      await Promise.all(existingIds.map(id => Notifications.cancelScheduledNotificationAsync(id).catch(() => {})))
    }

    // Day 0 (tonight) always reflects the live streak. Days 1..N are
    // pre-scheduled lapse copy for the case the user doesn't come back to
    // reschedule them — if they do reopen the app, this function runs again
    // and replaces the whole queue with a fresh one (streak day 0 restarts).
    const ids = []
    for (let daysOut = 0; daysOut <= LAPSE_SCHEDULE_DAYS; daysOut++) {
      const target = new Date()
      target.setDate(target.getDate() + daysOut)
      target.setHours(21, 0, 0, 0)
      if (target <= new Date()) {
        // Day 0's 9pm slot may already be past by the time the user opens the
        // app tonight — fire shortly instead of silently dropping the live
        // streak reminder for today.
        if (daysOut === 0) target.setTime(Date.now() + 60000)
        else continue
      }

      const { title, body } = daysOut === 0 && streak > 0
        ? { title: `${streak} day streak — keep it going!`, body: `Don't break your ${streak} day streak. Log an expense before midnight.` }
        : lapseCopy(daysOut)

      const id = await Notifications.scheduleNotificationAsync({
        content: { title, body, sound: true, data: { type: 'streak_reminder' } },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: target,
          ...(Platform.OS === 'android' ? { channelId: ANDROID_CHANNEL_ID } : {}),
        },
      })
      ids.push(id)
    }

    await AsyncStorage.setItem(DAILY_REMINDER_IDS_KEY, JSON.stringify(ids))
  } catch {}
}

export function cancelStreakReminder() {
  streakReminderQueue = streakReminderQueue.then(() => runCancelStreakReminder())
  return streakReminderQueue
}

async function runCancelStreakReminder() {
  try {
    const existingIdsRaw = await AsyncStorage.getItem(DAILY_REMINDER_IDS_KEY)
    if (existingIdsRaw) {
      const existingIds = JSON.parse(existingIdsRaw)
      await Promise.all(existingIds.map(id => Notifications.cancelScheduledNotificationAsync(id).catch(() => {})))
      await AsyncStorage.removeItem(DAILY_REMINDER_IDS_KEY)
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