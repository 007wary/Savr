// Tests the gating logic of checkForecastNudge — the safety guarantees that
// make it acceptable to ship a proactive push: opt-in, over-goal only,
// mid-month window, once per month.
/* eslint-disable import/first -- jest.mock() must be hoisted above imports */

jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  getPermissionsAsync: jest.fn(() => Promise.resolve({ status: 'granted' })),
  requestPermissionsAsync: jest.fn(() => Promise.resolve({ status: 'granted' })),
  // Mirror the real parseTrigger validation: a non-null trigger must carry a
  // `type` (or `channelId`), else the SDK throws. Enforcing it here means a
  // legacy { hour, minute, repeats } trigger fails the test instead of silently
  // no-op'ing at runtime — the exact gap that hid the streak-reminder bug.
  scheduleNotificationAsync: jest.fn((req) => {
    const t = req?.trigger
    if (t !== null && t !== undefined && !('type' in t || 'channelId' in t)) {
      return Promise.reject(new TypeError('invalid trigger: missing type/channelId'))
    }
    return Promise.resolve('id')
  }),
  cancelScheduledNotificationAsync: jest.fn(() => Promise.resolve()),
  setNotificationChannelAsync: jest.fn(() => Promise.resolve()),
  SchedulableTriggerInputTypes: { DAILY: 'daily', DATE: 'date' },
  AndroidImportance: { HIGH: 6 },
  AndroidNotificationVisibility: { PUBLIC: 1 },
}))
jest.mock('./currency', () => ({
  getCurrencySymbol: () => Promise.resolve('₹'),
  roundMoney: (n) => n,
}))

import AsyncStorage from '@react-native-async-storage/async-storage'
import * as Notifications from 'expo-notifications'
import { checkForecastNudge, resolveNotificationTap, scheduleStreakReminder, FORECAST_NUDGE_KEY } from './notifications'

const scheduleMock = Notifications.scheduleNotificationAsync

// Build a notification-response shape with the given data.type.
function tap(type) {
  return { notification: { request: { content: { data: type ? { type } : {} } } } }
}

describe('resolveNotificationTap', () => {
  it('routes a forecast nudge to the dashboard and logs the open', () => {
    expect(resolveNotificationTap(tap('forecast_nudge')))
      .toEqual({ route: '/(tabs)/dashboard', event: 'forecastNudgeOpened' })
  })
  it('routes a streak reminder to add, no event', () => {
    expect(resolveNotificationTap(tap('streak_reminder')))
      .toEqual({ route: '/(tabs)/add', event: null })
  })
  it('returns nulls for unknown or missing types', () => {
    expect(resolveNotificationTap(tap(null))).toEqual({ route: null, event: null })
    expect(resolveNotificationTap(undefined)).toEqual({ route: null, event: null })
  })
})

const overGoal = {
  goal: 3000, willExceedGoal: true, projectedTotal: 4000,
  projectedOverGoal: 1000, safeDailySpend: 50, dayOfMonth: 15,
}

beforeEach(() => {
  scheduleMock.mockClear()
  AsyncStorage.getItem.mockImplementation((k) =>
    Promise.resolve(k === FORECAST_NUDGE_KEY ? 'true' : null))
})

it('sends when enabled, over goal, mid-month, not yet sent', async () => {
  await checkForecastNudge(overGoal, '2026-06')
  expect(scheduleMock).toHaveBeenCalledTimes(1)
})

it('does nothing when the preference is off (opt-in default)', async () => {
  AsyncStorage.getItem.mockImplementation(() => Promise.resolve(null))
  await checkForecastNudge(overGoal, '2026-06')
  expect(scheduleMock).not.toHaveBeenCalled()
})

it('stays silent when on track (not over goal)', async () => {
  await checkForecastNudge({ ...overGoal, willExceedGoal: false }, '2026-06')
  expect(scheduleMock).not.toHaveBeenCalled()
})

it('does nothing without a goal', async () => {
  await checkForecastNudge({ ...overGoal, goal: null }, '2026-06')
  expect(scheduleMock).not.toHaveBeenCalled()
})

it('respects the mid-month window (too early / too late)', async () => {
  await checkForecastNudge({ ...overGoal, dayOfMonth: 5 }, '2026-06')
  await checkForecastNudge({ ...overGoal, dayOfMonth: 27 }, '2026-06')
  expect(scheduleMock).not.toHaveBeenCalled()
})

it('fires only once per month', async () => {
  AsyncStorage.getItem.mockImplementation((k) =>
    Promise.resolve(k === FORECAST_NUDGE_KEY ? 'true' : '2026-06')) // already sent this month
  await checkForecastNudge(overGoal, '2026-06')
  expect(scheduleMock).not.toHaveBeenCalled()
})

it('does nothing with a null forecast', async () => {
  await checkForecastNudge(null, '2026-06')
  expect(scheduleMock).not.toHaveBeenCalled()
})

describe('scheduleStreakReminder', () => {
  it('schedules a batch of dated reminders with valid typed triggers', async () => {
    await scheduleStreakReminder(3)
    // Pre-schedules ~22 individually-dated notifications (today + 21 days out)
    // rather than one repeating DAILY trigger, so a lapsed user who never
    // reopens the app still gets escalating copy without a reschedule.
    expect(scheduleMock.mock.calls.length).toBeGreaterThan(1)
    for (const [req] of scheduleMock.mock.calls) {
      // A bare { hour, minute, repeats } would reject in the mock (as it
      // throws in the real SDK) — assert every trigger is well-formed.
      expect(req.trigger).toMatchObject({ type: 'date' })
      expect(req.trigger.date).toBeInstanceOf(Date)
    }
  })

  it('gives day-0 streak copy to the first reminder when streak is active', async () => {
    await scheduleStreakReminder(3)
    const first = scheduleMock.mock.calls[0][0]
    expect(first.content.title).toMatch(/3 day streak/)
  })
})
