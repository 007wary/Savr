import { useState, useEffect } from 'react'
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, ScrollView, KeyboardAvoidingView,
  Platform, Switch, ActivityIndicator
} from 'react-native'
import DateTimePicker from '@react-native-community/datetimepicker'
import { Ionicons } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import NetInfo from '@react-native-community/netinfo'
import { supabase } from '../../src/lib/supabase'
import { COLORS, CATEGORIES } from '../../src/constants/theme'
import { checkBudgetAlerts } from '../../src/lib/notifications'
import CustomAlert from '../../src/components/CustomAlert'
import useAlert from '../../src/hooks/useAlert'
import { addToQueue, syncQueue } from '../../src/lib/offlineQueue'
import { clearCache, saveCache, loadCache } from '../../src/lib/cache'
import { getUser } from '../../src/lib/auth'
import { getCurrencySymbol, loadCurrency, formatAmount, getQuickAmounts } from '../../src/lib/currency'
import { detectCategory } from '../../src/lib/categoryDetector'
import { detectAnomaly } from '../../src/lib/anomalyDetector'

const FREQUENCIES = [
  { label: 'Daily', value: 'daily', icon: '📅' },
  { label: 'Weekly', value: 'weekly', icon: '📆' },
  { label: 'Monthly', value: 'monthly', icon: '🗓️' },
]

export default function AddExpense() {
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [selectedCategory, setSelectedCategory] = useState(null)
  const [autoDetected, setAutoDetected] = useState(false)
  const [date, setDate] = useState(new Date())
  const [showDatePicker, setShowDatePicker] = useState(false)
  const [isRecurring, setIsRecurring] = useState(false)
  const [frequency, setFrequency] = useState('monthly')
  const [isOnline, setIsOnline] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [currencySymbol, setCurrencySymbol] = useState('₹')
  const [currencyCode, setCurrencyCode] = useState('INR')
  const [quickAmounts, setQuickAmounts] = useState(['50', '100', '200', '500', '1000', '2000'])
  const { alertConfig, showAlert, hideAlert } = useAlert()
  const router = useRouter()

  useEffect(() => {
    async function loadCurrencyData() {
      const symbol = await getCurrencySymbol()
      const code = await loadCurrency()
      setCurrencySymbol(symbol)
      setCurrencyCode(code)
      setQuickAmounts(getQuickAmounts(code))
    }
    loadCurrencyData()
  }, [])

  useEffect(() => {
    let syncTimeout = null
    const unsub = NetInfo.addEventListener(async state => {
      const online = state.isConnected && state.isInternetReachable !== false
      setIsOnline(!!online)
      if (online) {
        if (syncTimeout) clearTimeout(syncTimeout)
        syncTimeout = setTimeout(async () => {
          await syncQueue()
          const now = new Date()
          const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
          await clearCache(`savr_cache_dashboard_${currentMonth}`)
          await clearCache('savr_cache_history')
          await clearCache(`savr_cache_budgets_${currentMonth}`)
          await clearCache(`savr_cache_reports_${currentMonth}`)
        }, 1000)
      }
    })
    return () => {
      unsub()
      if (syncTimeout) clearTimeout(syncTimeout)
    }
  }, [])

  function handleNoteChange(text) {
    setNote(text)
    const detected = detectCategory(text)
    if (detected) {
      setSelectedCategory(detected)
      setAutoDetected(true)
    } else if (autoDetected) {
      setSelectedCategory(null)
      setAutoDetected(false)
    }
  }

  function handleCategorySelect(label) {
    setSelectedCategory(label)
    setAutoDetected(false)
  }

  function formatDate(d) {
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
  }

  async function saveExpense(expenseData, expenseMonth, currentMonth) {
    // ---- OFFLINE PATH ----
    if (!isOnline) {
      if (isRecurring) {
        await addToQueue({
          type: 'add_recurring',
          ...expenseData,
          frequency,
          next_due: formatDate(date),
        })
      } else {
        await addToQueue({ type: 'add_expense', ...expenseData })
        const tempExpense = {
          ...expenseData,
          id: `offline_${Date.now()}`,
          user_id: 'offline',
          created_at: new Date().toISOString(),
        }
        const historyCached = await loadCache('savr_cache_history') || []
        await saveCache('savr_cache_history', [tempExpense, ...historyCached])
        if (expenseMonth === currentMonth) {
          const dashCacheKey = `savr_cache_dashboard_${currentMonth}`
          const dashCached = await loadCache(dashCacheKey)
          if (dashCached) {
            await saveCache(dashCacheKey, {
              ...dashCached,
              expenses: [tempExpense, ...dashCached.expenses]
            })
          }
        }
      }
      setSubmitting(false)
      router.replace('/(tabs)/dashboard')
      return
    }

    // ---- ONLINE PATH ----
    const user = await getUser()

    if (isRecurring) {
  // Save recurring rule to Supabase
  await supabase.from('recurring_expenses').insert({
  user_id: user.id,
  amount: expenseData.amount,
  category: expenseData.category,
  note: expenseData.note,
  frequency,
  next_due: formatDate(date),
  is_active: true,
  last_logged: expenseData.date,
})

  // Also insert first expense immediately so it shows right away
  const { error: firstError } = await supabase.from('expenses').insert({
    user_id: user.id,
    amount: expenseData.amount,
    category: expenseData.category,
    note: expenseData.note || `Auto: ${expenseData.category}`,
    date: expenseData.date,
  })

  // Clear all caches
  await clearCache(`savr_cache_dashboard_${expenseMonth}`)
  await clearCache('savr_cache_history')
  await clearCache(`savr_cache_budgets_${expenseMonth}`)
  await clearCache(`savr_cache_reports_${expenseMonth}`)

  // Update dashboard and history cache immediately
  if (!firstError) {
    const newExpense = {
      ...expenseData,
      id: `temp_${Date.now()}`,
      user_id: user.id,
      created_at: new Date().toISOString(),
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
  }

    } else {
      // Save regular expense
      const { error } = await supabase.from('expenses').insert({
        user_id: user.id,
        ...expenseData,
      })

      if (error) {
        await addToQueue({ type: 'add_expense', ...expenseData })
      } else {
        // Step 1 — clear all caches
        await clearCache(`savr_cache_dashboard_${expenseMonth}`)
        await clearCache('savr_cache_history')
        await clearCache(`savr_cache_budgets_${expenseMonth}`)
        await clearCache(`savr_cache_reports_${expenseMonth}`)

        // Step 2 — build temp expense object
        const newExpense = {
          ...expenseData,
          id: `temp_${Date.now()}`,
          user_id: user.id,
          created_at: new Date().toISOString(),
        }

        // Step 3 — update dashboard cache immediately
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

        // Step 4 — update history cache immediately
        const historyCached = await loadCache('savr_cache_history') || []
        await saveCache('savr_cache_history', [newExpense, ...historyCached])

        // Step 5 — check budget alerts in background
        supabase.from('expenses').select('*').eq('user_id', user.id)
          .then(({ data: allExpenses }) => {
            supabase.from('budgets').select('*')
              .eq('user_id', user.id)
              .eq('month', expenseMonth)
              .then(({ data: budgets }) => {
                if (allExpenses && budgets && budgets.length > 0) {
                  checkBudgetAlerts(allExpenses, budgets, expenseMonth)
                }
              })
          })
      }
    }

    // Navigate LAST — after all cache updates complete
    setSubmitting(false)
    router.replace('/(tabs)/dashboard')
  }

  async function handleAdd() {
    if (submitting) return
    if (!amount || !selectedCategory) {
      return showAlert('Missing info', 'Please enter an amount and select a category')
    }
    if (isNaN(parseFloat(amount))) {
      return showAlert('Invalid amount', 'Please enter a valid number')
    }

    setSubmitting(true)
    const expenseDate = new Date(date)
    const expenseMonth = `${expenseDate.getFullYear()}-${String(expenseDate.getMonth() + 1).padStart(2, '0')}`
    const now = new Date()
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

    const expenseData = {
      amount: parseFloat(amount),
      category: selectedCategory,
      note: note.trim(),
      date: formatDate(date),
    }

    // Check for anomaly before saving
    if (!isRecurring) {
      try {
        const historyCached = await loadCache('savr_cache_history') || []
        const anomaly = detectAnomaly(expenseData.amount, selectedCategory, historyCached)
        if (anomaly) {
          resetForm()
          setSubmitting(false)
          showAlert(
            '⚠️ Unusual Expense Detected',
            `This ${selectedCategory} expense of ${formatAmount(expenseData.amount, currencySymbol, currencyCode)} is ${anomaly.multiplier}x your usual spending.\n\nYour average ${selectedCategory} expense is ${formatAmount(anomaly.avg, currencySymbol, currencyCode)} based on ${anomaly.count} past transactions.\n\nWas this intentional?`,
            [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Yes, Add It',
                onPress: async () => {
                  setSubmitting(true)
                  await saveExpense(expenseData, expenseMonth, currentMonth)
                }
              }
            ]
          )
          return
        }
      } catch {}
    }

    resetForm()
    await saveExpense(expenseData, expenseMonth, currentMonth)
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={{ flex: 1, backgroundColor: COLORS.bg }}
    >
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Text style={styles.heading}>Add Expense</Text>

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
              style={[styles.quickBtn, amount === q && styles.quickBtnActive]}
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
            placeholder="What was this for? (e.g. Swiggy, Petrol, Amazon)"
            placeholderTextColor={COLORS.textMuted}
            value={note}
            onChangeText={handleNoteChange}
            multiline
          />
          {autoDetected && selectedCategory && (
            <View style={styles.autoDetectBadge}>
              <Ionicons name="flash" size={12} color={COLORS.accentGreen} />
              <Text style={styles.autoDetectText}>
                Auto-detected: {CATEGORIES.find(c => c.label === selectedCategory)?.icon} {selectedCategory}
              </Text>
            </View>
          )}
        </View>

        <View style={styles.categoryHeader}>
          <Text style={styles.label}>Category</Text>
          {autoDetected && (
            <Text style={styles.autoDetectHint}>✨ Auto-selected from your note</Text>
          )}
        </View>
        <View style={styles.categoryGrid}>
          {CATEGORIES.map((cat) => (
            <TouchableOpacity
              key={cat.label}
              style={[
                styles.categoryBtn,
                selectedCategory === cat.label && {
                  backgroundColor: cat.color + '22',
                  borderColor: cat.color,
                  borderWidth: 2,
                },
                selectedCategory === cat.label && autoDetected && styles.categoryBtnAutoDetected,
              ]}
              onPress={() => handleCategorySelect(cat.label)}
            >
              <View style={[
                styles.categoryIconBox,
                { backgroundColor: selectedCategory === cat.label ? cat.color : COLORS.cardAlt }
              ]}>
                <Text style={styles.categoryIcon}>{cat.icon}</Text>
              </View>
              <Text style={[
                styles.categoryLabel,
                selectedCategory === cat.label && { color: COLORS.text, fontWeight: '700' }
              ]}>
                {cat.label}
              </Text>
              {selectedCategory === cat.label && autoDetected && (
                <View style={styles.autoDetectDot} />
              )}
            </TouchableOpacity>
          ))}
        </View>

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
                  <Text style={{ fontSize: 16 }}>{f.icon}</Text>
                  <Text style={[styles.freqLabel, frequency === f.value && { color: '#fff' }]}>
                    {f.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        <TouchableOpacity
          style={[
            styles.btn,
            isRecurring && { backgroundColor: COLORS.accentGreen },
            submitting && { opacity: 0.6 }
          ]}
          onPress={handleAdd}
          disabled={submitting}
        >
          {submitting ? (
            <ActivityIndicator size="small" color="#fff" style={{ marginRight: 8 }} />
          ) : (
            <Ionicons
              name={isRecurring ? 'repeat' : 'checkmark'}
              size={18} color="#fff"
              style={{ marginRight: 8 }}
            />
          )}
          <Text style={styles.btnText}>
            {submitting ? 'Saving...' : isRecurring ? 'Add Recurring Expense' : 'Add Expense'}
          </Text>
        </TouchableOpacity>
      </ScrollView>

      <CustomAlert
        visible={alertConfig.visible}
        title={alertConfig.title}
        message={alertConfig.message}
        buttons={alertConfig.buttons}
        onClose={hideAlert}
      />
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: { padding: 24, paddingTop: 60 },
  heading: { fontSize: 26, fontWeight: '700', color: COLORS.text, marginBottom: 28 },
  label: { fontSize: 13, color: COLORS.textMuted, marginBottom: 8, marginLeft: 2 },
  input: {
    backgroundColor: COLORS.card, borderRadius: 12, padding: 16,
    color: COLORS.text, fontSize: 15, borderWidth: 1,
    borderColor: COLORS.border, marginBottom: 20,
  },
  noteContainer: { marginBottom: 20 },
  noteInput: { marginBottom: 0, height: 80, textAlignVertical: 'top' },
  autoDetectBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: COLORS.accentGreen + '15',
    borderRadius: 8, padding: 8, marginTop: 6,
    borderWidth: 1, borderColor: COLORS.accentGreen + '33',
  },
  autoDetectText: { fontSize: 12, color: COLORS.accentGreen, fontWeight: '600' },
  categoryHeader: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', marginBottom: 8,
  },
  autoDetectHint: { fontSize: 11, color: COLORS.accentGreen, fontWeight: '600' },
  quickAmounts: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20, marginTop: -12 },
  quickBtn: {
    paddingVertical: 8, paddingHorizontal: 14, borderRadius: 20,
    borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.card
  },
  quickBtnActive: { backgroundColor: COLORS.accent, borderColor: COLORS.accent },
  quickText: { fontSize: 13, color: COLORS.textMuted, fontWeight: '600' },
  quickTextActive: { color: '#fff' },
  categoryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 20 },
  categoryBtn: {
    width: '22%', alignItems: 'center',
    paddingVertical: 12, borderRadius: 14,
    borderWidth: 1, borderColor: COLORS.border,
    backgroundColor: COLORS.card, gap: 8,
  },
  categoryBtnAutoDetected: {
    borderColor: COLORS.accentGreen,
    backgroundColor: COLORS.accentGreen + '11',
  },
  categoryIconBox: {
    width: 44, height: 44, borderRadius: 12,
    justifyContent: 'center', alignItems: 'center',
  },
  categoryIcon: { fontSize: 22 },
  categoryLabel: { fontSize: 11, color: COLORS.textMuted, fontWeight: '500', textAlign: 'center' },
  autoDetectDot: {
    width: 6, height: 6, borderRadius: 3,
    backgroundColor: COLORS.accentGreen,
    position: 'absolute', top: 6, right: 6,
  },
  datePicker: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.card, borderRadius: 12, padding: 16,
    marginBottom: 20, borderWidth: 1, borderColor: COLORS.border,
  },
  dateText: { fontSize: 15, color: COLORS.text, fontWeight: '500' },
  recurringToggleRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: COLORS.card, borderRadius: 14, padding: 16,
    borderWidth: 1, borderColor: COLORS.border, marginBottom: 16,
  },
  recurringToggleLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  recurringIconBox: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: COLORS.accent + '22',
    justifyContent: 'center', alignItems: 'center',
  },
  recurringToggleTitle: { fontSize: 15, fontWeight: '600', color: COLORS.text },
  recurringToggleSub: { fontSize: 12, color: COLORS.textMuted, marginTop: 2 },
  frequencySection: {
    backgroundColor: COLORS.card, borderRadius: 14, padding: 16,
    borderWidth: 1, borderColor: COLORS.border, marginBottom: 16,
  },
  freqRow: { flexDirection: 'row', gap: 10 },
  freqBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 12, borderRadius: 12,
    borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.cardAlt,
  },
  freqBtnActive: { backgroundColor: COLORS.accentGreen, borderColor: COLORS.accentGreen },
  freqLabel: { fontSize: 13, color: COLORS.textMuted, fontWeight: '600' },
  btn: {
    flexDirection: 'row', justifyContent: 'center', alignItems: 'center',
    backgroundColor: COLORS.accent, borderRadius: 12, padding: 16,
    marginTop: 8, marginBottom: 40,
  },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
})