let analytics = null;

const getAnalytics = async () => {
  if (analytics) return analytics;
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

  // Backup
  backupStarted: () => logEvent('backup_started'),
  backupSuccess: () => logEvent('backup_success'),
  backupFailed: () => logEvent('backup_failed'),
  restoreStarted: () => logEvent('restore_started'),
  restoreSuccess: () => logEvent('restore_success'),

  // Screens
  screen: (name) => logScreenView(name),
};
