import { useState, useCallback, useEffect } from 'react'
import {
  View, Text, StyleSheet, ScrollView,
  TouchableOpacity, TextInput, RefreshControl
} from 'react-native'
import { useFocusEffect } from 'expo-router'
import { supabase } from '../../src/lib/supabase'
import { COLORS, CATEGORIES } from '../../src/constants/theme'
import { getCurrencySymbol, loadCurrency, formatAmount } from '../../src/lib/currency'
import { BudgetsSkeleton } from '../../src/components/SkeletonLoader'
import { Ionicons } from '@expo/vector-icons'
import { saveCache, loadCache } from '../../src/lib/cache'
import { getUser } from '../../src/lib/auth'
import NetInfo from '@react-native-community/netinfo'
import { addToQueue } from '../../src/lib/offlineQueue'
import CustomAlert from '../../src/components/CustomAlert'
import useAlert from '../../src/hooks/useAlert'

export default function Budgets() {
  const [budgets, setBudgets] = useState([])
  const [expenses, setExpenses] = useState([])
  const [editing, setEditing] = useState(null)
  const [inputValue, setInputValue] = useState('')
  const [refreshing, setRefreshing] = useState(false)
  const [currencySymbol, setCurrencySymbol] = useState('₹')
  const [currencyCode, setCurrencyCode] = useState('INR')
  const [loading, setLoading] = useState(true)
  const [savingBudget, setSavingBudget] = useState(false)
  const [isOnline, setIsOnline] = useState(true)
  const { alertConfig, showAlert, hideAlert } = useAlert()

  const now = new Date()
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const monthName = now.toLocaleString('default', { month: 'long', year: 'numeric' })
  const CACHE_KEY = `savr_cache_budgets_${currentMonth}`

  useEffect(() => {
    const unsub = NetInfo.addEventListener(state => {
      const online = state.isConnected && state.isInternetReachable !== false
      setIsOnline(!!online)
    })
    return () => unsub()
  }, [])

  async function fetchData(forceRefresh = false) {
    const symbol = await getCurrencySymbol()
    const code = await loadCurrency()
    setCurrencySymbol(symbol)
    setCurrencyCode(code)

    if (!forceRefresh) {
      const cached = await loadCache(CACHE_KEY)
      if (cached) {
        setBudgets(cached.budgets)
        setExpenses(cached.expenses)
        setLoading(false)
        syncFromSupabase()
        return
      }
    }

    await syncFromSupabase()
  }

  async function syncFromSupabase() {
    try {
      const user = await getUser()
      const [{ data: budgetData }, { data: expenseData }] = await Promise.all([
        supabase.from('budgets').select('*').eq('user_id', user.id).eq('month', currentMonth),
        supabase.from('expenses').select('*').eq('user_id', user.id)
      ])

      if (budgetData) setBudgets(budgetData)
      if (expenseData) {
        const filtered = expenseData.filter(e => e.date.startsWith(currentMonth))
        setExpenses(filtered)
        await saveCache(CACHE_KEY, {
          budgets: budgetData || [],
          expenses: filtered,
        })
      }
    } catch {
      // Silently fail — cache already shown
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useFocusEffect(useCallback(() => { fetchData() }, []))

  async function saveBudget(category) {
    if (!inputValue || isNaN(parseFloat(inputValue))) {
      return showAlert('Invalid', 'Please enter a valid amount')
    }

    setSavingBudget(true)
    const limit = parseFloat(inputValue)
    const existing = budgets.find(b => b.category === category)

    let updatedBudgets
    if (existing) {
      updatedBudgets = budgets.map(b =>
        b.category === category ? { ...b, limit_amount: limit } : b
      )
    } else {
      updatedBudgets = [...budgets, {
        id: `offline_${Date.now()}`,
        category,
        limit_amount: limit,
        month: currentMonth,
        user_id: 'offline',
      }]
    }
    setBudgets(updatedBudgets)
    await saveCache(CACHE_KEY, { budgets: updatedBudgets, expenses })

    setEditing(null)
    setInputValue('')
    setSavingBudget(false)

    if (!isOnline) {
      await addToQueue({
        type: 'save_budget',
        category,
        limit_amount: limit,
        month: currentMonth,
        existing_id: existing?.id,
      })
    } else {
      const user = await getUser()
      if (existing) {
        await supabase.from('budgets')
          .update({ limit_amount: limit })
          .eq('id', existing.id)
      } else {
        await supabase.from('budgets').insert({
          user_id: user.id,
          category,
          limit_amount: limit,
          month: currentMonth,
        })
      }
      fetchData(true)
    }
  }

  async function deleteBudget(category) {
    const existing = budgets.find(b => b.category === category)
    if (!existing) return

    if (existing.id?.toString().startsWith('offline_')) {
      const updatedBudgets = budgets.filter(b => b.category !== category)
      setBudgets(updatedBudgets)
      await saveCache(CACHE_KEY, { budgets: updatedBudgets, expenses })
      setEditing(null)
      setInputValue('')
      return
    }

    const updatedBudgets = budgets.filter(b => b.category !== category)
    setBudgets(updatedBudgets)
    await saveCache(CACHE_KEY, { budgets: updatedBudgets, expenses })

    setEditing(null)
    setInputValue('')

    if (!isOnline) {
      await addToQueue({ type: 'delete_budget', id: existing.id })
    } else {
      await supabase.from('budgets').delete().eq('id', existing.id)
      fetchData(true)
    }
  }

  function getSpent(category) {
    return expenses.filter(e => e.category === category).reduce((sum, e) => sum + parseFloat(e.amount), 0)
  }

  function getBudgetLimit(category) {
    const b = budgets.find(b => b.category === category)
    return b ? parseFloat(b.limit_amount) : null
  }

  if (loading) return <BudgetsSkeleton />

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingBottom: 40 }}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => { setRefreshing(true); fetchData(true) }}
          tintColor={COLORS.accent}
        />
      }
    >
      <Text style={styles.heading}>Budgets</Text>
      <Text style={styles.subheading}>{monthName}</Text>

      {CATEGORIES.map(cat => {
        const spent = getSpent(cat.label)
        const limit = getBudgetLimit(cat.label)
        const percentage = limit ? Math.min((spent / limit) * 100, 100) : 0
        const isOver = limit && spent > limit
        const isEditing = editing === cat.label

        return (
          <View key={cat.label} style={styles.card}>
            <View style={styles.cardHeader}>
              <View style={[styles.iconBox, { backgroundColor: cat.color + '22' }]}>
                <Text style={{ fontSize: 20 }}>{cat.icon}</Text>
              </View>
              <View style={styles.cardInfo}>
                <Text style={styles.catName}>{cat.label}</Text>
                <Text style={styles.spentText}>
                  Spent:{' '}
                  <Text style={{ color: isOver ? COLORS.accentRed : COLORS.accentGreen, fontWeight: '700' }}>
                    {formatAmount(spent, currencySymbol, currencyCode)}
                  </Text>
                  {limit
                    ? <Text style={styles.limitText}> / {formatAmount(limit, currencySymbol, currencyCode)}</Text>
                    : <Text style={styles.limitText}> (no budget set)</Text>
                  }
                </Text>
              </View>
              <TouchableOpacity
                style={[styles.editBtn, isEditing && styles.editBtnActive]}
                onPress={() => {
                  if (isEditing) { setEditing(null) }
                  else { setEditing(cat.label); setInputValue(limit ? String(limit) : '') }
                }}
              >
                {isEditing
                  ? <Ionicons name="close" size={14} color={COLORS.accentRed} />
                  : <Ionicons name="pencil" size={14} color={COLORS.accent} />
                }
                <Text style={[styles.editBtnText, isEditing && { color: COLORS.accentRed }]}>
                  {isEditing ? 'Cancel' : 'Edit'}
                </Text>
              </TouchableOpacity>
            </View>

            {limit && (
              <View style={styles.progressBg}>
                <View style={[styles.progressFill, { width: `${percentage}%`, backgroundColor: isOver ? COLORS.accentRed : cat.color }]} />
              </View>
            )}

            {isOver && (
              <Text style={styles.overText}>
                ⚠️ Over budget by {formatAmount(spent - limit, currencySymbol, currencyCode)}
              </Text>
            )}

            {isEditing && (
              <View style={styles.editRow}>
                <TextInput
                  style={styles.editInput}
                  placeholder={`Set budget (${currencySymbol})`}
                  placeholderTextColor={COLORS.textMuted}
                  value={inputValue}
                  onChangeText={setInputValue}
                  keyboardType="numeric"
                  autoFocus
                />
                <TouchableOpacity
                  style={[styles.saveBtn, savingBudget && { opacity: 0.6 }]}
                  onPress={() => saveBudget(cat.label)}
                  disabled={savingBudget}
                >
                  <Text style={styles.saveBtnText}>{savingBudget ? '...' : 'Save'}</Text>
                </TouchableOpacity>
                {limit && (
                  <TouchableOpacity style={styles.deleteBtn} onPress={() => deleteBudget(cat.label)}>
                    <Text style={styles.deleteBtnText}>Remove</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
          </View>
        )
      })}

      <CustomAlert
        visible={alertConfig.visible}
        title={alertConfig.title}
        message={alertConfig.message}
        buttons={alertConfig.buttons}
        onClose={hideAlert}
      />
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg, paddingTop: 60, paddingHorizontal: 20 },
  heading: { fontSize: 28, fontWeight: '800', color: COLORS.text, letterSpacing: -0.8, marginBottom: 4 },
  subheading: { fontSize: 14, color: COLORS.textMuted, marginBottom: 24 },
  card: {
    backgroundColor: COLORS.card, borderRadius: 16,
    padding: 16, marginBottom: 12,
    borderWidth: 1, borderColor: COLORS.border,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  iconBox: { width: 44, height: 44, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  cardInfo: { flex: 1 },
  catName: { fontSize: 15, fontWeight: '600', color: COLORS.text, letterSpacing: -0.2 },
  spentText: { fontSize: 13, color: COLORS.textMuted, marginTop: 2 },
  limitText: { color: COLORS.textMuted },
  editBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingVertical: 6, paddingHorizontal: 10,
    borderRadius: 8, borderWidth: 1,
    borderColor: COLORS.border, backgroundColor: COLORS.cardAlt,
  },
  editBtnActive: {
    borderColor: COLORS.accentRed + '44',
    backgroundColor: COLORS.accentRed + '11',
  },
  editBtnText: { fontSize: 12, fontWeight: '600', color: COLORS.accent },
  progressBg: { height: 6, backgroundColor: COLORS.border, borderRadius: 3, marginBottom: 6 },
  progressFill: { height: 6, borderRadius: 3 },
  overText: { fontSize: 12, color: COLORS.accentRed, marginTop: 4, fontWeight: '600' },
  editRow: { flexDirection: 'row', alignItems: 'center', marginTop: 12, gap: 8 },
  editInput: {
    flex: 1, backgroundColor: COLORS.cardAlt, borderRadius: 10,
    padding: 10, color: COLORS.text, fontSize: 14,
    borderWidth: 1, borderColor: COLORS.border,
  },
  saveBtn: { backgroundColor: COLORS.accent, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 14 },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  deleteBtn: { backgroundColor: COLORS.cardAlt, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 14, borderWidth: 1, borderColor: COLORS.border },
  deleteBtnText: { color: COLORS.accentRed, fontWeight: '600', fontSize: 13 },
})