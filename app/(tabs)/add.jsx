import { useState, useEffect, useRef, useCallback } from 'react'
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, Platform, Switch, ActivityIndicator, ScrollView, Animated, Modal
} from 'react-native'
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view'
import DateTimePicker from '@react-native-community/datetimepicker'
import { Ionicons } from '@expo/vector-icons'
import { useRouter, useFocusEffect } from 'expo-router'
import { COLORS, CATEGORIES, SCREEN } from '../../src/constants/theme'
import CustomAlert from '../../src/components/CustomAlert'
import useAlert from '../../src/hooks/useAlert'
import { clearCache, saveCache, loadCache } from '../../src/lib/cache'
import { getUser, getCachedUser } from '../../src/lib/auth'
import { getCurrencySymbol, loadCurrency, formatAmount, getQuickAmounts } from '../../src/lib/currency'
import { detectCategory } from '../../src/lib/categoryDetector'
import { detectAnomaly } from '../../src/lib/anomalyDetector'
import { checkBudgetAlerts } from '../../src/lib/notifications'
import { addExpense, addRecurring, addIncome, addRecurringIncome, addTransfer, getExpenses, getBudgets, getAccounts, updateAccountBalance } from '../../src/services/sqliteService'
import { Analytics } from '../../src/lib/analytics'
import { scheduleBackup } from '../../src/services/backgroundBackup'
import { checkAndRequestReview } from '../../src/lib/reviewService'
import AsyncStorage from '@react-native-async-storage/async-storage'
import ConfettiCannon from 'react-native-confetti-cannon'

const FREQUENCIES = [
  { label: 'Daily', value: 'daily', icon: 'sunny-outline' },
  { label: 'Weekly', value: 'weekly', icon: 'calendar-outline' },
  { label: 'Monthly', value: 'monthly', icon: 'calendar-number-outline' },
]

const INCOME_CATEGORIES = [
  { label: 'Salary', icon: 'briefcase-outline', color: '#4CAF50' },
  { label: 'Freelance', icon: 'laptop-outline', color: '#2196F3' },
  { label: 'Business', icon: 'storefront-outline', color: '#FF9800' },
  { label: 'Investment', icon: 'trending-up-outline', color: '#9C27B0' },
  { label: 'Rental', icon: 'home-outline', color: '#00BCD4' },
  { label: 'Gift', icon: 'gift-outline', color: '#E91E63' },
  { label: 'Other', icon: 'ellipsis-horizontal-outline', color: '#607D8B' },
]

export default function AddExpense() {
  const [activeTab, setActiveTab] = useState('expense')
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [selectedCategory, setSelectedCategory] = useState(null)
  const [autoDetected, setAutoDetected] = useState(false)
  const [date, setDate] = useState(new Date())
  const [showDatePicker, setShowDatePicker] = useState(false)
  const [isRecurring, setIsRecurring] = useState(false)
  const [frequency, setFrequency] = useState('monthly')
  const [isRecurringIncome, setIsRecurringIncome] = useState(false)
  const [incomeFrequency, setIncomeFrequency] = useState('monthly')
  const [submitting, setSubmitting] = useState(false)
  const [currencySymbol, setCurrencySymbol] = useState('₹')
  const [currencyCode, setCurrencyCode] = useState('INR')
  const [quickAmounts, setQuickAmounts] = useState(['50', '100', '200', '500', '1000', '2000'])
  const [accounts, setAccounts] = useState([])
  const [selectedAccountId, setSelectedAccountId] = useState(null)
  const [transferFromId, setTransferFromId] = useState(null)
  const [transferToId, setTransferToId] = useState(null)
  const [transferNote, setTransferNote] = useState('')
  const [transferDate, setTransferDate] = useState(new Date())
  const [showTransferDatePicker, setShowTransferDatePicker] = useState(false)
  const { alertConfig, showAlert, hideAlert } = useAlert()
  const router = useRouter()
  const userRef = useRef(null)
  const [showCelebration, setShowCelebration] = useState(false)
  const celebrationScale = useRef(new Animated.Value(0)).current
  const celebrationOpacity = useRef(new Animated.Value(0)).current
  const confettiRef = useRef(null)
  const confettiRef2 = useRef(null)

  function triggerCelebration() {
    setShowCelebration(true)
    setTimeout(() => {
      confettiRef.current?.start()
      setTimeout(() => confettiRef2.current?.start(), 150)
    }, 300)
    Animated.parallel([
      Animated.spring(celebrationScale, {
        toValue: 1,
        friction: 7,
        tension: 70,
        useNativeDriver: true,
      }),
      Animated.timing(celebrationOpacity, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start()
  }

  function handleCelebrationDone() {
    setShowCelebration(false)
    celebrationScale.setValue(0)
    celebrationOpacity.setValue(0)
    router.replace('/(tabs)/dashboard')
  }

  useEffect(() => {
    async function init() {
      const symbol = await getCurrencySymbol()
      const code = await loadCurrency()
      setCurrencySymbol(symbol)
      setCurrencyCode(code)
      setQuickAmounts(getQuickAmounts(code))
      userRef.current = getCachedUser() || await getUser()
    }
    init()
  }, [])

  useFocusEffect(useCallback(() => {
    async function refreshAccounts() {
      try {
        const user = getCachedUser() || userRef.current || await getUser()
        if (!user) return
        userRef.current = user
        const accs = await getAccounts(user.id)
        setAccounts(accs)
      } catch {}
    }
    refreshAccounts()
  }, []))

  function handleTabSwitch(tab) {
    setActiveTab(tab)
    setAmount('')
    setNote('')
    setSelectedCategory(null)
    setAutoDetected(false)
    setDate(new Date())
    setIsRecurring(false)
    setFrequency('monthly')
    setIsRecurringIncome(false)
    setIncomeFrequency('monthly')
    setSelectedAccountId(null)
    setTransferFromId(null)
    setTransferToId(null)
    setTransferNote('')
    setTransferDate(new Date())
  }

  function handleNoteChange(text) {
    setNote(text)
    if (activeTab === 'expense') {
      const detected = detectCategory(text)
      if (detected) {
        setSelectedCategory(detected)
        setAutoDetected(true)
      } else if (autoDetected) {
        setSelectedCategory(null)
        setAutoDetected(false)
      }
    }
  }

  function handleCategorySelect(label) {
    setSelectedCategory(label)
    setAutoDetected(false)
  }

  function formatDateStr(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }

  function formatDisplayDate(d) {
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })
  }

  function resetForm() {
    setAmount('')
    setNote('')
    setSelectedCategory(null)
    setAutoDetected(false)
    setDate(new Date())
    setIsRecurring(false)
    setFrequency('monthly')
    setIsRecurringIncome(false)
    setIncomeFrequency('monthly')
    setSelectedAccountId(null)
  }

  async function saveExpense(expenseData, expenseMonth, currentMonth) {
    try {
      const user = getCachedUser() || userRef.current || await getUser()
      if (!user) {
        showAlert('Error', 'Could not save expense. Please try again.')
        setSubmitting(false)
        return
      }
      if (!userRef.current) userRef.current = user

      if (isRecurring) {
        await addRecurring(user.id, {
          amount: expenseData.amount,
          category: expenseData.category,
          note: expenseData.note,
          frequency,
          next_due: expenseData.date,
        })
        const { processDueRecurring } = await import('../../src/lib/recurring')
        await processDueRecurring(user.id)
      } else {
        await addExpense(user.id, { ...expenseData, account_id: selectedAccountId })
        if (selectedAccountId) await updateAccountBalance(selectedAccountId, -expenseData.amount)
      }

      if (isRecurring) {
  Analytics.addRecurringExpense(expenseData.category, expenseData.amount, frequency)
} else {
  Analytics.addExpense(expenseData.category, expenseData.amount)
}

      await clearCache(`savr_cache_dashboard_${expenseMonth}`)
      await clearCache(`savr_cache_budgets_${expenseMonth}`)
      await clearCache(`savr_cache_reports_${expenseMonth}`)

      const newExpense = {
        ...expenseData,
        id: `temp_${Date.now()}`,
        user_id: user.id,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }

      if (expenseMonth === currentMonth) {
        const dashCacheKey = `savr_cache_dashboard_${currentMonth}`
        const dashCached = await loadCache(dashCacheKey)
        if (dashCached) {
          await saveCache(dashCacheKey, {
            ...dashCached,
            expenses: [newExpense, ...dashCached.expenses],
          })
        }
      }

      const historyCached = await loadCache('savr_cache_history') || []
      await saveCache('savr_cache_history', [newExpense, ...historyCached])

      try {
        const allExpenses = await getExpenses(user.id)
        const budgets = await getBudgets(user.id, expenseMonth)
        if (budgets.length > 0) checkBudgetAlerts(allExpenses, budgets, expenseMonth)
      } catch {}

      await AsyncStorage.setItem('savr_request_notif_after_load', 'true')
      const allAfter = await getExpenses(user.id)
      if (allAfter.length === 1) {
        triggerCelebration()
      } else {
        if (!isRecurring) await checkAndRequestReview()
      scheduleBackup()
      router.replace('/(tabs)/dashboard')
      }
    } catch (e) {
    showAlert('Error', 'Could not save expense. Please try again.')
  } finally {
      setSubmitting(false)
    }
  }

  async function saveIncome(incomeData, incomeMonth, currentMonth) {
    try {
      const user = getCachedUser() || userRef.current || await getUser()
      if (!user) {
        showAlert('Error', 'Could not save income. Please try again.')
        setSubmitting(false)
        return
      }
      if (!userRef.current) userRef.current = user

      if (isRecurringIncome) {
        await addRecurringIncome(user.id, {
          amount: incomeData.amount,
          category: incomeData.category,
          note: incomeData.note,
          frequency: incomeFrequency,
          next_due: incomeData.date,
        })
        const { processRecurringIncome } = await import('../../src/lib/recurring')
        await processRecurringIncome(user.id)
      } else {
        await addIncome(user.id, { ...incomeData, account_id: selectedAccountId })
        if (selectedAccountId) await updateAccountBalance(selectedAccountId, incomeData.amount)
      }

      if (isRecurringIncome) {
        Analytics.addRecurringIncome(incomeData.category, incomeData.amount, incomeFrequency)
      } else {
        Analytics.addIncome(incomeData.category, incomeData.amount)
      }

      await clearCache(`savr_cache_dashboard_${incomeMonth}`)
      await clearCache(`savr_cache_reports_${incomeMonth}`)

      const newIncome = {
        ...incomeData,
        id: `temp_${Date.now()}`,
        type: 'income',
        user_id: user.id,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }
      const historyCached = await loadCache('savr_cache_history') || []
      await saveCache('savr_cache_history', [newIncome, ...historyCached])

      if (!isRecurringIncome) await checkAndRequestReview()
      scheduleBackup()
      router.replace('/(tabs)/dashboard')
    } catch (e) {
      showAlert('Error', 'Could not save income. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  async function saveTransfer() {
    if (!transferFromId || !transferToId) {
      return showAlert('Missing info', 'Please select both From and To accounts')
    }
    if (transferFromId === transferToId) {
      return showAlert('Invalid', 'From and To accounts cannot be the same')
    }
    if (!amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
      return showAlert('Invalid amount', 'Please enter a valid amount')
    }
    setSubmitting(true)
    try {
      const user = getCachedUser() || userRef.current || await getUser()
      if (!user) { showAlert('Error', 'Could not save transfer.'); setSubmitting(false); return }
      const transferAmount = parseFloat(amount)
      const dateStr = `${transferDate.getFullYear()}-${String(transferDate.getMonth() + 1).padStart(2, '0')}-${String(transferDate.getDate()).padStart(2, '0')}`
      await addTransfer(user.id, {
        from_account_id: transferFromId,
        to_account_id: transferToId,
        amount: transferAmount,
        note: transferNote.trim(),
        date: dateStr,
      })
      await updateAccountBalance(transferFromId, -transferAmount)
      await updateAccountBalance(transferToId, transferAmount)
      setAmount('')
      setTransferNote('')
      setTransferFromId(null)
      setTransferToId(null)
      setTransferDate(new Date())
      scheduleBackup()
      router.replace('/(tabs)/dashboard')
    } catch {
      showAlert('Error', 'Could not save transfer. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleAdd() {
    if (submitting) return
    if (activeTab === 'transfer') { await saveTransfer(); return }

    if (!amount || !selectedCategory) {
      return showAlert('Missing info', 'Please enter an amount and select a category')
    }
    if (isNaN(parseFloat(amount))) {
      return showAlert('Invalid amount', 'Please enter a valid number')
    }

    setSubmitting(true)
    const entryDate = new Date(date)
    const entryMonth = `${entryDate.getFullYear()}-${String(entryDate.getMonth() + 1).padStart(2, '0')}`
    const now = new Date()
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

    if (activeTab === 'income') {
      const incomeData = {
        amount: parseFloat(amount),
        category: selectedCategory,
        note: note.trim(),
        date: formatDateStr(date),
      }
      resetForm()
      await saveIncome(incomeData, entryMonth, currentMonth)
      return
    }

    const expenseData = {
      amount: parseFloat(amount),
      category: selectedCategory,
      note: note.trim(),
      date: formatDateStr(date),
    }

    if (!isRecurring) {
      try {
        const user = getCachedUser() || userRef.current || await getUser()
        const allExpenses = user ? await getExpenses(user.id) : []
        const anomaly = detectAnomaly(expenseData.amount, selectedCategory, allExpenses)
        if (anomaly) {
          setSubmitting(false)
          showAlert(
            '⚠️ Unusual Expense Detected',
            `This ${selectedCategory} expense of ${formatAmount(expenseData.amount, currencySymbol, currencyCode)} is ${anomaly.multiplier}x your usual spending.\n\nYour average ${selectedCategory} expense is ${formatAmount(anomaly.avg, currencySymbol, currencyCode)} based on ${anomaly.count} past transactions.\n\nWas this intentional?`,
            [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Yes, Add It',
                onPress: async () => {
                  try {
                    setSubmitting(true)
                    resetForm()
                    await saveExpense(expenseData, entryMonth, currentMonth)
                  } catch {
                    setSubmitting(false)
                    showAlert('Error', 'Could not save expense. Please try again.')
                  }
                }
              }
            ]
          )
          return
        }
      } catch {}
    }

    resetForm()
    await saveExpense(expenseData, entryMonth, currentMonth)
  }

  const selectedCat = CATEGORIES.find(c => c.label === selectedCategory)

  const tabColor = activeTab === 'income' ? '#4CAF50' : activeTab === 'transfer' ? '#607D8B' : COLORS.accent

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.bg }}>

      {/* Back button header */}
      <View style={[styles.header, { paddingTop: SCREEN.paddingTop }]}>
        <TouchableOpacity onPress={() => router.replace('/(tabs)/dashboard')}>
          <Ionicons name="chevron-back" size={26} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>
          {activeTab === 'income' ? 'Add Income' : activeTab === 'transfer' ? 'Transfer' : 'Add Expense'}
        </Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Scrollable content */}
        <KeyboardAwareScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled" enableOnAndroid extraScrollHeight={100} style={{ flex: 1 }}>

          {/* ── TRANSFER TAB ── */}
          {activeTab === 'transfer' && (
            <>
              {accounts.length < 2 ? (
                <View style={styles.transferStub}>
                  <View style={styles.transferIconBox}>
                    <Ionicons name="swap-horizontal-outline" size={40} color={COLORS.textMuted} />
                  </View>
                  <Text style={styles.transferTitle}>No accounts yet</Text>
                  <Text style={styles.transferSub}>You need at least 2 accounts to make a transfer.</Text>
                  <TouchableOpacity style={styles.transferSetupBtn} onPress={() => router.push('/(tabs)/accounts')}>
                    <Ionicons name="card-outline" size={16} color="#fff" style={{ marginRight: 6 }} />
                    <Text style={styles.transferSetupBtnText}>Set Up Accounts</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <>
                  <Text style={styles.label}>Amount ({currencySymbol})</Text>
                  <TextInput
                    style={styles.input}
                    placeholder={`${currencySymbol}0.00`}
                    placeholderTextColor={COLORS.textMuted}
                    value={amount}
                    onChangeText={setAmount}
                    keyboardType="numeric"
                  />

                  <View style={styles.quickAmounts}>
                    {quickAmounts.map(q => (
                      <TouchableOpacity
                        key={q}
                        style={[styles.quickBtn, amount === q && { backgroundColor: '#607D8B', borderColor: '#607D8B' }]}
                        onPress={() => setAmount(q)}
                      >
                        <Text style={[styles.quickText, amount === q && styles.quickTextActive]}>
                          {currencySymbol}{q}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  <Text style={styles.label}>From Account</Text>
                  <View style={styles.accountSelectGrid}>
                    {accounts.map(acc => (
                      <TouchableOpacity
                        key={acc.id}
                        style={[styles.accountSelectBtn, transferFromId === acc.id && styles.accountSelectBtnActive('#F44336')]}
                        onPress={() => setTransferFromId(acc.id)}
                      >
                        <Ionicons name="arrow-up-circle-outline" size={16} color={transferFromId === acc.id ? '#fff' : COLORS.textMuted} style={{ marginRight: 6 }} />
                        <Text style={[styles.accountSelectText, transferFromId === acc.id && { color: '#fff' }]}>{acc.name}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  <Text style={styles.label}>To Account</Text>
                  <View style={styles.accountSelectGrid}>
                    {accounts.map(acc => (
                      <TouchableOpacity
                        key={acc.id}
                        style={[styles.accountSelectBtn, transferToId === acc.id && styles.accountSelectBtnActive('#4CAF50')]}
                        onPress={() => setTransferToId(acc.id)}
                      >
                        <Ionicons name="arrow-down-circle-outline" size={16} color={transferToId === acc.id ? '#fff' : COLORS.textMuted} style={{ marginRight: 6 }} />
                        <Text style={[styles.accountSelectText, transferToId === acc.id && { color: '#fff' }]}>{acc.name}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  <Text style={styles.label}>Note (optional)</Text>
                  <TextInput
                    style={[styles.input, { height: 80, textAlignVertical: 'top' }]}
                    placeholder="e.g. Moving savings to wallet"
                    placeholderTextColor={COLORS.textMuted}
                    value={transferNote}
                    onChangeText={setTransferNote}
                    multiline
                  />

                  <Text style={styles.label}>Date</Text>
                  <TouchableOpacity style={styles.datePicker} onPress={() => setShowTransferDatePicker(true)}>
                    <Text style={styles.dateText}>{formatDisplayDate(transferDate)}</Text>
                    <Ionicons name="calendar-outline" size={18} color={COLORS.textMuted} />
                  </TouchableOpacity>

                  {showTransferDatePicker && (
                    <DateTimePicker
                      value={transferDate}
                      mode="date"
                      display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                      onChange={(event, selectedDate) => {
                        setShowTransferDatePicker(Platform.OS === 'ios')
                        if (selectedDate) setTransferDate(selectedDate)
                      }}
                    />
                  )}

                  <TouchableOpacity
  style={[styles.btn, { backgroundColor: '#607D8B' }, submitting && { opacity: 0.6 }]}
  onPress={handleAdd}
  disabled={submitting}
>
                    {submitting
                      ? <ActivityIndicator size="small" color="#fff" style={{ marginRight: 8 }} />
                      : <Ionicons name="swap-horizontal-outline" size={18} color="#fff" style={{ marginRight: 8 }} />
                    }
                    <Text style={styles.btnText}>{submitting ? 'Saving...' : 'Transfer'}</Text>
                  </TouchableOpacity>
                </>
              )}
            </>
          )}

          {/* ── INCOME & EXPENSE TABS ── */}
          {activeTab !== 'transfer' && (
            <>
              <Text style={styles.label}>Amount ({currencySymbol})</Text>
              <TextInput
                style={styles.input}
                placeholder={`${currencySymbol}0.00`}
                placeholderTextColor={COLORS.textMuted}
                value={amount}
                onChangeText={setAmount}
                keyboardType="numeric"
              />

              <View style={styles.quickAmounts}>
                {quickAmounts.map(q => (
                  <TouchableOpacity
                    key={q}
                    style={[styles.quickBtn, amount === q && { backgroundColor: tabColor, borderColor: tabColor }]}
                    onPress={() => setAmount(q)}
                  >
                    <Text style={[styles.quickText, amount === q && styles.quickTextActive]}>
                      {currencySymbol}{q}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.label}>Note (optional)</Text>
              <View style={styles.noteContainer}>
                <TextInput
                  style={[styles.input, styles.noteInput]}
                  placeholder={activeTab === 'income' ? 'e.g. Monthly salary, Client payment' : 'What was this for? (e.g. Swiggy, Petrol, Amazon)'}
                  placeholderTextColor={COLORS.textMuted}
                  value={note}
                  onChangeText={handleNoteChange}
                  multiline
                />
                {activeTab === 'expense' && autoDetected && selectedCategory && (
                  <View style={styles.autoDetectBadge}>
                    <Ionicons name="flash" size={12} color={COLORS.accentGreen} />
                    <Text style={styles.autoDetectText}>
                      Auto-detected: {selectedCat && <Ionicons name={selectedCat.icon} size={12} color={COLORS.accentGreen} />} {selectedCategory}
                    </Text>
                  </View>
                )}
              </View>

              <View style={styles.categoryHeader}>
                <Text style={styles.label}>Category</Text>
                {activeTab === 'expense' && autoDetected && (
                  <View style={styles.autoDetectHintRow}>
                    <Ionicons name="flash" size={11} color={COLORS.accentGreen} />
                    <Text style={styles.autoDetectHint}> Auto-selected from your note</Text>
                  </View>
                )}
              </View>

              <View style={styles.categoryGrid}>
                {(activeTab === 'income' ? INCOME_CATEGORIES : CATEGORIES).map((cat) => (
                  <TouchableOpacity
                    key={cat.label}
                    style={[
                      styles.categoryBtn,
                      selectedCategory === cat.label && { backgroundColor: cat.color + '22', borderColor: cat.color, borderWidth: 2 },
                      activeTab === 'expense' && selectedCategory === cat.label && autoDetected && styles.categoryBtnAutoDetected,
                    ]}
                    onPress={() => handleCategorySelect(cat.label)}
                  >
                    <View style={[styles.categoryIconBox, { backgroundColor: selectedCategory === cat.label ? cat.color : COLORS.cardAlt }]}>
                      <Ionicons name={cat.icon} size={20} color={selectedCategory === cat.label ? '#fff' : cat.color} />
                    </View>
                    <Text style={[styles.categoryLabel, selectedCategory === cat.label && { color: COLORS.text, fontWeight: '700' }]}>
                      {cat.label}
                    </Text>
                    {activeTab === 'expense' && selectedCategory === cat.label && autoDetected && <View style={styles.autoDetectDot} />}
                  </TouchableOpacity>
                ))}
              </View>

              {activeTab === 'income' && (
                <>
                  <View style={styles.recurringToggleRow}>
                    <View style={styles.recurringToggleLeft}>
                      <View style={[styles.recurringIconBox, { backgroundColor: '#4CAF5022' }]}>
                        <Ionicons name="repeat" size={18} color="#4CAF50" />
                      </View>
                      <View>
                        <Text style={styles.recurringToggleTitle}>Repeat this income</Text>
                        <Text style={styles.recurringToggleSub}>Auto-log daily, weekly or monthly</Text>
                      </View>
                    </View>
                    <Switch
                      value={isRecurringIncome}
                      onValueChange={setIsRecurringIncome}
                      trackColor={{ false: COLORS.border, true: '#4CAF50' }}
                      thumbColor="#fff"
                    />
                  </View>

                  {isRecurringIncome && (
                    <View style={styles.frequencySection}>
                      <Text style={styles.label}>Repeat every</Text>
                      <View style={styles.freqRow}>
                        {FREQUENCIES.map(f => (
                          <TouchableOpacity
                            key={f.value}
                            style={[styles.freqBtn, incomeFrequency === f.value && { backgroundColor: '#4CAF50', borderColor: '#4CAF50' }]}
                            onPress={() => setIncomeFrequency(f.value)}
                          >
                            <Ionicons name={f.icon} size={16} color={incomeFrequency === f.value ? '#fff' : COLORS.textMuted} />
                            <Text style={[styles.freqLabel, incomeFrequency === f.value && { color: '#fff' }]}>{f.label}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </View>
                  )}
                </>
              )}

              {accounts.length > 0 && (
                <>
                  <Text style={styles.label}>Account (optional)</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 20 }}>
                    <View style={{ flexDirection: 'row', gap: 8, paddingVertical: 4 }}>
                      <TouchableOpacity
                        style={[styles.accountPill, selectedAccountId === null && styles.accountPillActive(tabColor)]}
                        onPress={() => setSelectedAccountId(null)}
                      >
                        <Ionicons name="close-circle-outline" size={14} color={selectedAccountId === null ? '#fff' : COLORS.textMuted} style={{ marginRight: 4 }} />
                        <Text style={[styles.accountPillText, selectedAccountId === null && { color: '#fff' }]}>None</Text>
                      </TouchableOpacity>
                      {accounts.map(acc => (
                        <TouchableOpacity
                          key={acc.id}
                          style={[styles.accountPill, selectedAccountId === acc.id && styles.accountPillActive(tabColor)]}
                          onPress={() => setSelectedAccountId(acc.id)}
                        >
                          <Ionicons name="card-outline" size={14} color={selectedAccountId === acc.id ? '#fff' : COLORS.textMuted} style={{ marginRight: 4 }} />
                          <Text style={[styles.accountPillText, selectedAccountId === acc.id && { color: '#fff' }]}>{acc.name}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </ScrollView>
                </>
              )}

              <Text style={styles.label}>{isRecurring ? 'First Due Date' : 'Date'}</Text>
              <TouchableOpacity style={styles.datePicker} onPress={() => setShowDatePicker(true)}>
                <Text style={styles.dateText}>{formatDisplayDate(date)}</Text>
                <Ionicons name="calendar-outline" size={18} color={COLORS.textMuted} />
              </TouchableOpacity>

              {showDatePicker && (
                <DateTimePicker
                  value={date}
                  mode="date"
                  display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                  onChange={(event, selectedDate) => {
                    setShowDatePicker(Platform.OS === 'ios')
                    if (selectedDate) setDate(selectedDate)
                  }}
                />
              )}

              {activeTab === 'expense' && (
                <>
                  <View style={styles.recurringToggleRow}>
                    <View style={styles.recurringToggleLeft}>
                      <View style={styles.recurringIconBox}>
                        <Ionicons name="repeat" size={18} color={COLORS.accent} />
                      </View>
                      <View>
                        <Text style={styles.recurringToggleTitle}>Repeat this expense</Text>
                        <Text style={styles.recurringToggleSub}>Auto-log daily, weekly or monthly</Text>
                      </View>
                    </View>
                    <Switch
                      value={isRecurring}
                      onValueChange={setIsRecurring}
                      trackColor={{ false: COLORS.border, true: COLORS.accent }}
                      thumbColor="#fff"
                    />
                  </View>

                  {isRecurring && (
                    <View style={styles.frequencySection}>
                      <Text style={styles.label}>Repeat every</Text>
                      <View style={styles.freqRow}>
                        {FREQUENCIES.map(f => (
                          <TouchableOpacity
                            key={f.value}
                            style={[styles.freqBtn, frequency === f.value && styles.freqBtnActive]}
                            onPress={() => setFrequency(f.value)}
                          >
                            <Ionicons name={f.icon} size={16} color={frequency === f.value ? '#fff' : COLORS.textMuted} />
                            <Text style={[styles.freqLabel, frequency === f.value && { color: '#fff' }]}>{f.label}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </View>
                  )}
                </>
              )}

              <TouchableOpacity
                style={[styles.btn, { backgroundColor: tabColor }, submitting && { opacity: 0.6 }]}
                onPress={handleAdd}
                disabled={submitting}
              >
                {submitting
                  ? <ActivityIndicator size="small" color="#fff" style={{ marginRight: 8 }} />
                  : <Ionicons
                      name={activeTab === 'income' ? 'arrow-down-circle-outline' : isRecurring ? 'repeat' : 'checkmark'}
                      size={18}
                      color="#fff"
                      style={{ marginRight: 8 }}
                    />
                }
                <Text style={styles.btnText}>
                  {submitting ? 'Saving...' : activeTab === 'income' ? isRecurringIncome ? 'Add Recurring Income' : 'Add Income' : isRecurring ? 'Add Recurring Expense' : 'Add Expense'}
                </Text>
              </TouchableOpacity>
            </>
          )}
        </KeyboardAwareScrollView>

      {/* ── BOTTOM TAB SWITCHER ── */}
      <View style={styles.bottomTabRow}>
          {[
            { key: 'income', label: 'Income', icon: 'arrow-down-circle-outline', color: '#4CAF50' },
            { key: 'expense', label: 'Expense', icon: 'arrow-up-circle-outline', color: COLORS.accent },
            { key: 'transfer', label: 'Transfer', icon: 'swap-horizontal-outline', color: '#607D8B' },
          ].map(tab => (
            <TouchableOpacity
              key={tab.key}
              style={[styles.bottomTabBtn, activeTab === tab.key && { borderTopColor: tab.color, borderTopWidth: 2 }]}
              onPress={() => handleTabSwitch(tab.key)}
            >
              <Ionicons
                name={tab.icon}
                size={22}
                color={activeTab === tab.key ? tab.color : COLORS.textMuted}
              />
              <Text style={[styles.bottomTabText, activeTab === tab.key && { color: tab.color, fontWeight: '700' }]}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

      <CustomAlert
        visible={alertConfig.visible}
        title={alertConfig.title}
        message={alertConfig.message}
        buttons={alertConfig.buttons}
        onClose={hideAlert}
      />

      <Modal visible={showCelebration} transparent animationType="fade" onRequestClose={handleCelebrationDone}>
        <View style={styles.celebrationOverlay}>
          <ConfettiCannon
            ref={confettiRef}
            count={100}
            origin={{ x: -10, y: 0 }}
            autoStart={false}
            fadeOut
            colors={[COLORS.accent, '#FFB800', '#00D9A5', '#FF6B6B', '#fff']}
          />
          <ConfettiCannon
            ref={confettiRef2}
            count={100}
            origin={{ x: 400, y: 0 }}
            autoStart={false}
            fadeOut
            colors={[COLORS.accent, '#FFB800', '#00D9A5', '#FF6B6B', '#fff']}
          />
          <Animated.View style={[styles.celebrationCard, {
            transform: [{ scale: celebrationScale }],
            opacity: celebrationOpacity,
          }]}>
            <View style={styles.celebrationEmojiWrap}>
  <Ionicons name="trophy-outline" size={44} color={COLORS.accent} />
</View>
            <Text style={styles.celebrationTitle}>First expense logged!</Text>
            <Text style={styles.celebrationMessage}>
              Great start! You're on your way to taking control of your money.{'\n\n'}Come back tomorrow to build your streak.
            </Text>
            <TouchableOpacity
              style={styles.celebrationBtn}
              onPress={handleCelebrationDone}
              activeOpacity={0.85}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
  <Text style={styles.celebrationBtnText}>Let's go!</Text>
  <Ionicons name="arrow-forward-circle" size={20} color="#fff" />
</View>
            </TouchableOpacity>
          </Animated.View>
        </View>
      </Modal>
    </View>
  )
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 12 },
  headerTitle: { fontSize: 17, fontWeight: '700', color: COLORS.text },
  container: { paddingHorizontal: 24, paddingTop: 8, paddingBottom: 40 },
  label: { fontSize: 13, color: COLORS.textMuted, marginBottom: 8, marginLeft: 2 },
  input: { backgroundColor: COLORS.card, borderRadius: 12, padding: 16, color: COLORS.text, fontSize: 15, borderWidth: 1, borderColor: COLORS.border, marginBottom: 20 },
  noteContainer: { marginBottom: 20 },
  noteInput: { marginBottom: 0, height: 80, textAlignVertical: 'top' },
  autoDetectBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: COLORS.accentGreen + '15', borderRadius: 8, padding: 8, marginTop: 6, borderWidth: 1, borderColor: COLORS.accentGreen + '33' },
  autoDetectText: { fontSize: 12, color: COLORS.accentGreen, fontWeight: '600' },
  categoryHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  autoDetectHint: { fontSize: 11, color: COLORS.accentGreen, fontWeight: '600' },
  autoDetectHintRow: { flexDirection: 'row', alignItems: 'center' },
  quickAmounts: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20, marginTop: -12 },
  quickBtn: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 20, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.card },
  quickText: { fontSize: 13, color: COLORS.textMuted, fontWeight: '600' },
  quickTextActive: { color: '#fff' },
  categoryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 20 },
  categoryBtn: { width: '22%', alignItems: 'center', paddingVertical: 12, borderRadius: 14, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.card, gap: 8 },
  categoryBtnAutoDetected: { borderColor: COLORS.accentGreen, backgroundColor: COLORS.accentGreen + '11' },
  categoryIconBox: { width: 44, height: 44, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  categoryLabel: { fontSize: 11, color: COLORS.textMuted, fontWeight: '500', textAlign: 'center' },
  autoDetectDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: COLORS.accentGreen, position: 'absolute', top: 6, right: 6 },
  datePicker: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: COLORS.card, borderRadius: 12, padding: 16, marginBottom: 20, borderWidth: 1, borderColor: COLORS.border },
  dateText: { fontSize: 15, color: COLORS.text, fontWeight: '500' },
  recurringToggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: COLORS.card, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: COLORS.border, marginBottom: 16 },
  recurringToggleLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  recurringIconBox: { width: 36, height: 36, borderRadius: 10, backgroundColor: COLORS.accent + '22', justifyContent: 'center', alignItems: 'center' },
  recurringToggleTitle: { fontSize: 15, fontWeight: '600', color: COLORS.text },
  recurringToggleSub: { fontSize: 12, color: COLORS.textMuted, marginTop: 2 },
  frequencySection: { backgroundColor: COLORS.card, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: COLORS.border, marginBottom: 16 },
  freqRow: { flexDirection: 'row', gap: 10 },
  freqBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, borderRadius: 12, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.cardAlt },
  freqBtnActive: { backgroundColor: COLORS.accent, borderColor: COLORS.accent },
  freqLabel: { fontSize: 13, color: COLORS.textMuted, fontWeight: '600' },
  btn: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', borderRadius: 12, padding: 16, marginTop: 8, marginBottom: 20 },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  transferStub: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80, paddingHorizontal: 32 },
  transferIconBox: { width: 80, height: 80, borderRadius: 24, backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border, justifyContent: 'center', alignItems: 'center', marginBottom: 20 },
  transferTitle: { fontSize: 18, fontWeight: '700', color: COLORS.text, marginBottom: 10, textAlign: 'center' },
  transferSub: { fontSize: 14, color: COLORS.textMuted, textAlign: 'center', lineHeight: 22 },
  bottomTabRow: { flexDirection: 'row', backgroundColor: COLORS.card, borderTopWidth: 1, borderTopColor: COLORS.border, height: 80, paddingBottom: 24 },
  bottomTabBtn: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 3, paddingTop: 6 },
  bottomTabText: { fontSize: 11, color: COLORS.textMuted, fontWeight: '600' },
  accountPill: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, paddingHorizontal: 14, borderRadius: 20, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.card },
  accountPillActive: (color) => ({ backgroundColor: color, borderColor: color }),
  accountPillText: { fontSize: 13, color: COLORS.textMuted, fontWeight: '600' },
  transferSetupBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.accent, borderRadius: 12, paddingVertical: 14, paddingHorizontal: 24, marginTop: 24 },
  transferSetupBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  accountSelectGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20 },
  accountSelectBtn: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 14, borderRadius: 20, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.card },
  accountSelectBtnActive: (color) => ({ backgroundColor: color, borderColor: color }),
  accountSelectText: { fontSize: 13, color: COLORS.textMuted, fontWeight: '600' },
  celebrationOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 28 },
  celebrationCard: { backgroundColor: COLORS.card, borderRadius: 28, padding: 28, alignItems: 'center', borderWidth: 1.5, borderColor: COLORS.accent + '55', width: '100%' },
  celebrationEmojiWrap: { width: 88, height: 88, borderRadius: 44, backgroundColor: COLORS.accent + '18', borderWidth: 1.5, borderColor: COLORS.accent + '44', justifyContent: 'center', alignItems: 'center', marginBottom: 20 },
  celebrationTitle: { fontSize: 24, fontWeight: '900', color: COLORS.text, marginBottom: 10, textAlign: 'center', letterSpacing: -0.5 },
  celebrationMessage: { fontSize: 14, color: COLORS.textMuted, textAlign: 'center', lineHeight: 22, marginBottom: 28 },
  celebrationBtn: { backgroundColor: COLORS.accent, borderRadius: 14, paddingVertical: 16, paddingHorizontal: 40, width: '100%', alignItems: 'center', elevation: 4 },
  celebrationBtnText: { fontSize: 17, fontWeight: '800', color: '#fff' },
})