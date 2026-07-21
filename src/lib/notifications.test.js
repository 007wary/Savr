// Tests the gating logic of checkForecastNudge — the safety guarantees that
// make it acceptable to ship a proactive push: opt-in, over-goal only,
// mid-month window, once per month.
/* eslint-disable import/first -- jest.mock() must be hoisted above imports */

jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  getPermissionsAsync: jest.fn(() => Promise.resolve({ status: 'granted' })),
  requestPermissionsAsync: jest.fn(() => Promise.resolve({ status: 'granted' })),
  scheduleNotificationAsync: jest.fn(() => Promise.resolve('id')),
  cancelScheduledNotificationAsync: jest.fn(() => Promise.resolve()),
}))
jest.mock('./currency', () => ({
  getCurrencySymbol: () => Promise.resolve('₹'),
  roundMoney: (n) => n,
}))

import AsyncStorage from '@react-native-async-storage/async-storage'
import * as Notifications from 'expo-notifications'
import { checkForecastNudge, resolveNotificationTap, FORECAST_NUDGE_KEY } from './notifications'

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
