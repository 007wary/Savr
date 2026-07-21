import { afterFirstPaint } from './splashSignal';

let analytics = null;

// The first Firebase analytics call triggers a dynamic import + native module
// init, which lands on the JS thread. If that happens during the launch
// first-paint window it competes with the dashboard's initial render and was
// measured stalling the splash for seconds on some cold launches. Hold every
// analytics call until first paint, then let them through.
let paintReady = false;
afterFirstPaint(() => { paintReady = true; });
const waitForPaint = () =>
  paintReady ? Promise.resolve() : new Promise((resolve) => afterFirstPaint(resolve));

const getAnalytics = async () => {
  if (analytics) return analytics;
  await waitForPaint();
  try {
    const module = await import('@react-native-firebase/analytics');
    analytics = module.default();
    return analytics;
  } catch {
    return null;
  }
};

export const logEvent = async (eventName, params = {}) => {
  try {
    const a = await getAnalytics();
    if (!a) return;
    await a.logEvent(eventName, params);
  } catch {}
};

export const logScreenView = async (screenName) => {
  try {
    const a = await getAnalytics();
    if (!a) return;
    await a.logScreenView({ screen_name: screenName, screen_class: screenName });
  } catch {}
};

export const setUserId = async (userId) => {
  try {
    const a = await getAnalytics();
    if (!a) return;
    await a.setUserId(userId);
  } catch {}
};

// Key events for Savr
export const Analytics = {
  // Auth
  login: () => logEvent('login', { method: 'google' }),
  logout: () => logEvent('logout'),

  // Expenses
addExpense: (category, amount) => logEvent('add_expense', { category, amount }),
deleteExpense: () => logEvent('delete_expense'),
editExpense: () => logEvent('edit_expense'),

// Income
addIncome: (category, amount) => logEvent('add_income', { category, amount }),
deleteIncome: () => logEvent('delete_income'),
editIncome: () => logEvent('edit_income'),

// Recurring
addRecurringExpense: (category, amount, frequency) => logEvent('add_recurring_expense', { category, amount, frequency }),
deleteRecurringExpense: () => logEvent('delete_recurring_expense'),
addRecurringIncome: (category, amount, frequency) => logEvent('add_recurring_income', { category, amount, frequency }),
deleteRecurringIncome: () => logEvent('delete_recurring_income'),

  // Budgets
  setBudget: (category) => logEvent('set_budget', { category }),

  // Goals
  addGoal: () => logEvent('add_goal'),

  // Algorithm signals — categorical only (no amounts), so we can measure
  // whether the smart features actually work without logging spend data.
  //
  // Categorization: correction rate is our accuracy proxy; learned_hit tells
  // us the per-user learning is kicking in. `source` = 'keyword' | 'learned'.
  categoryAutodetected: (category, source) => logEvent('category_autodetected', { category, source }),
  categoryCorrected: (from, to) => logEvent('category_corrected', { detected: from || 'none', chosen: to }),
  learnedCategoryHit: (category) => logEvent('learned_category_hit', { category }),

  // Anomaly: confirmed = kept it (true positive), dismissed = cancelled (likely
  // false positive). The ratio tells us if the threshold is well-tuned.
  anomalyShown: (category) => logEvent('anomaly_shown', { category }),
  anomalyConfirmed: (category) => logEvent('anomaly_confirmed', { category }),
  anomalyDismissed: (category) => logEvent('anomaly_dismissed', { category }),

  // Forecast nudge funnel. `sent` fires today. `opened` is ready to wire the
  // moment we add notification-tap routing: the nudge already carries
  // data.type === 'forecast_nudge', so a response listener just calls this.
  // Pair with subsequent spend pace to judge whether the nudge changes behavior.
  forecastNudgeSent: () => logEvent('forecast_nudge_sent'),
  forecastNudgeOpened: () => logEvent('forecast_nudge_opened'),

  // Backup
  backupStarted: () => logEvent('backup_started'),
  backupSuccess: () => logEvent('backup_success'),
  backupFailed: () => logEvent('backup_failed'),
  restoreStarted: () => logEvent('restore_started'),
  restoreSuccess: () => logEvent('restore_success'),

  // Screens
  screen: (name) => logScreenView(name),
};
