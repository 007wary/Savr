import { useState, useCallback } from 'react'
import {
  View, Text, StyleSheet, ScrollView,
  TouchableOpacity, TextInput, RefreshControl, KeyboardAvoidingView, Platform
} from 'react-native'
import { useFocusEffect } from 'expo-router'
import { COLORS, CATEGORIES } from '../../src/constants/theme'
import { getCurrencySymbol, loadCurrency, formatAmount } from '../../src/lib/currency'
import { BudgetsSkeleton } from '../../src/components/SkeletonLoader'
import { Ionicons } from '@expo/vector-icons'
import { saveCache, loadCache } from '../../src/lib/cache'
import { getUser } from '../../src/lib/auth'
import CustomAlert from '../../src/components/CustomAlert'
import useAlert from '../../src/hooks/useAlert'
import { generateBudgetRecommendations } from '../../src/lib/budgetRecommendations'
import { getExpenses, getBudgets, saveBudget, deleteBudget } from '../../src/services/sqliteService'

export default function Budgets() {
  const [budgets, setBudgets] = useState([])
  const [expenses, setExpenses] = useState([])
  const [allExpenses, setAllExpenses] = useState([])
  const [editing, setEditing] = useState(null)
  const [inputValue, setInputValue] = useState('')
  const [refreshing, setRefreshing] = useState(false)
  const [currencySymbol, setCurrencySymbol] = useState('₹')
  const [currencyCode, setCurrencyCode] = useState('INR')
  const [loading, setLoading] = useState(true)
  const [savingBudget, setSavingBudget] = useState(false)
  const [recommendations, setRecommendations] = useState({})
  const [showRecommendations, setShowRecommendations] = useState(false)
  const { alertConfig, showAlert, hideAlert } = useAlert()

  const now = new Date()
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const monthName = now.toLocaleString('default', { month: 'long', year: 'numeric' })
  const CACHE_KEY = `savr_cache_budgets_${currentMonth}`

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
        if (cached.allExpenses) {
          setAllExpenses(cached.allExpenses)
          setRecommendations(generateBudgetRecommendations(cached.allExpenses, CATEGORIES))
        }
        setLoading(false)
        loadFromSQLite()
        return
      }
    }
    await loadFromSQLite()
  }

  async function loadFromSQLite() {
    try {
      const user = await getUser()
      const [budgetData, allExp] = await Promise.all([
        getBudgets(user.id, currentMonth),
        getExpenses(user.id),
      ])
      const filtered = allExp.filter(e => e.date.startsWith(currentMonth))
      setBudgets(budgetData)
      setExpenses(filtered)
      setAllExpenses(allExp)
      setRecommendations(generateBudgetRecommendations(allExp, CATEGORIES))
      await saveCache(CACHE_KEY, { budgets: budgetData, expenses: filtered, allExpenses: allExp })
    } catch (e) {
      console.error('Budgets load error:', e)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useFocusEffect(useCallback(() => { fetchData() }, []))

  async function handleSaveBudget(category, customLimit = null) {
    const limitValue = customLimit !== null ? String(customLimit) : inputValue
    if (!limitValue || isNaN(parseFloat(limitValue))) {
      return showAlert('Invalid', 'Please enter a valid amount')
    }
    setSavingBudget(true)
    const limit = parseFloat(limitValue)
    const existing = budgets.find(b => b.category === category)
    const updatedBudgets = existing
      ? budgets.map(b => b.category === category ? { ...b, limit_amount: limit } : b)
      : [...budgets, { id: `temp_${Date.now()}`, category, limit_amount: limit, month: currentMonth }]
    setBudgets(updatedBudgets)
    await saveCache(CACHE_KEY, { budgets: updatedBudgets, expenses, allExpenses })
    setEditing(null)
    setInputValue('')
    setSavingBudget(false)
    try {
      const user = await getUser()
      await saveBudget(user.id, { category, limit_amount: limit, month: currentMonth })
    } catch (e) {
      console.error('Save budget error:', e)
    }
  }

  async function handleDeleteBudget(category) {
    const existing = budgets.find(b => b.category === category)
    if (!existing) return
    const updatedBudgets = budgets.filter(b => b.category !== category)
    setBudgets(updatedBudgets)
    await saveCache(CACHE_KEY, { budgets: updatedBudgets, expenses, allExpenses })
    setEditing(null)
    setInputValue('')
    try { await deleteBudget(existing.id) } catch (e) { console.error('Delete budget error:', e) }
  }

  async function applyAllRecommendations() {
    showAlert(
      'Apply All Recommendations?',
      'This will set budgets for all categories based on your last 3 months spending.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Apply All',
          onPress: async () => {
            const user = await getUser()
            for (const [category, rec] of Object.entries(recommendations)) {
              await saveBudget(user.id, { category, limit_amount: rec.recommended, month: currentMonth })
            }
            setShowRecommendations(false)
            fetchData(true)
          }
        }
      ]
    )
  }

  function getSpent(category) {
    return expenses.filter(e => e.category === category).reduce((sum, e) => sum + parseFloat(e.amount), 0)
  }

  function getBudgetLimit(category) {
    const b = budgets.find(b => b.category === category)
    return b ? parseFloat(b.limit_amount) : null
  }

  const hasRecommendations = Object.keys(recommendations).length > 0

  if (loading) return <BudgetsSkeleton />

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={{ paddingBottom: 120 }}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchData(true) }} tintColor={COLORS.accent} />
        }
      >
        <Text style={styles.heading}>Budgets</Text>
        <Text style={styles.subheading}>{monthName}</Text>

        {hasRecommendations && (
          <TouchableOpacity
            style={styles.recommendCard}
            onPress={() => setShowRecommendations(!showRecommendations)}
            activeOpacity={0.8}
          >
            <View style={styles.recommendHeader}>
              <View style={styles.recommendLeft}>
                <View style={styles.recommendIconBox2}>
                  <Ionicons name="sparkles-outline" size={20} color={COLORS.accent} />
                </View>
                <View>
                  <Text style={styles.recommendTitle}>Smart Budget Recommendations</Text>
                  <Text style={styles.recommendSub}>Based on your last 3 months spending</Text>
                </View>
              </View>
              <Ionicons name={showRecommendations ? 'chevron-up' : 'chevron-down'} size={18} color={COLORS.accent} />
            </View>

            {showRecommendations && (
              <View style={styles.recommendList}>
                <View style={styles.recommendDivider} />
                {Object.entries(recommendations).map(([category, rec]) => {
                  const cat = CATEGORIES.find(c => c.label === category)
                  if (!cat) return null
                  return (
                    <View key={category} style={styles.recommendItem}>
                      <View style={styles.recommendItemLeft}>
                        <View style={[styles.recommendIconBox, { backgroundColor: cat.color + '22' }]}>
                          <Ionicons name={cat.icon} size={16} color={cat.color} />
                        </View>
                        <View>
                          <Text style={styles.recommendCatName}>{category}</Text>
                          <Text style={styles.recommendAvg}>3-month avg: {formatAmount(rec.avg, currencySymbol, currencyCode)}</Text>
                        </View>
                      </View>
                      <View style={styles.recommendItemRight}>
                        <Text style={styles.recommendAmount}>{formatAmount(rec.recommended, currencySymbol, currencyCode)}</Text>
                        <TouchableOpacity style={styles.applyBtn} onPress={() => handleSaveBudget(category, rec.recommended)}>
                          <Text style={styles.applyBtnText}>Apply</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  )
                })}
                <TouchableOpacity style={styles.applyAllBtn} onPress={applyAllRecommendations}>
                  <Ionicons name="checkmark-circle" size={16} color="#fff" style={{ marginRight: 6 }} />
                  <Text style={styles.applyAllBtnText}>Apply All Recommendations</Text>
                </TouchableOpacity>
              </View>
            )}
          </TouchableOpacity>
        )}

        {CATEGORIES.map(cat => {
          const spent = getSpent(cat.label)
          const limit = getBudgetLimit(cat.label)
          const percentage = limit ? Math.min((spent / limit) * 100, 100) : 0
          const isOver = limit && spent > limit
          const isWarning = limit && !isOver && percentage >= 80
          const isEditing = editing === cat.label
          const rec = recommendations[cat.label]
          const barColor = isOver ? COLORS.accentRed : isWarning ? COLORS.accentYellow : cat.color

          return (
            <View key={cat.label} style={[styles.card, isOver && styles.cardOver]}>
              <View style={styles.cardHeader}>
                <View style={[styles.iconBox, { backgroundColor: cat.color + '22' }]}>
                  <Ionicons name={cat.icon} size={20} color={cat.color} />
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
                  <View style={[styles.progressFill, { width: `${percentage}%`, backgroundColor: barColor }]} />
                </View>
              )}

              {isWarning && (
                <View style={styles.warningRow}>
                  <Ionicons name="warning-outline" size={12} color={COLORS.accentYellow} />
                  <Text style={styles.warningText}>{(100 - percentage).toFixed(0)}% of budget remaining</Text>
                </View>
              )}

              {isOver && (
                <View style={styles.overBanner}>
                  <Ionicons name="alert-circle" size={14} color={COLORS.accentRed} />
                  <Text style={styles.overText}>
                    Over by {formatAmount(spent - limit, currencySymbol, currencyCode)} · {((spent / limit - 1) * 100).toFixed(0)}% over budget
                  </Text>
                </View>
              )}

              {!limit && rec && !isEditing && (
                <TouchableOpacity style={styles.inlineRecCard} onPress={() => handleSaveBudget(cat.label, rec.recommended)}>
                  <Ionicons name="bulb-outline" size={14} color={COLORS.accentYellow} />
                  <Text style={styles.inlineRecText}>
                    Suggested: {formatAmount(rec.recommended, currencySymbol, currencyCode)} based on {rec.months} month{rec.months > 1 ? 's' : ''} history
                  </Text>
                  <Text style={styles.inlineRecApply}>Tap to apply</Text>
                </TouchableOpacity>
              )}

              {isEditing && (
                <View>
                  {rec && (
                    <TouchableOpacity style={styles.recHint} onPress={() => setInputValue(String(rec.recommended))}>
                      <Ionicons name="bulb-outline" size={13} color={COLORS.accentYellow} />
                      <Text style={styles.recHintText}>Suggested: {formatAmount(rec.recommended, currencySymbol, currencyCode)} — tap to use</Text>
                    </TouchableOpacity>
                  )}
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
                      onPress={() => handleSaveBudget(cat.label)}
                      disabled={savingBudget}
                    >
                      <Text style={styles.saveBtnText}>{savingBudget ? '...' : 'Save'}</Text>
                    </TouchableOpacity>
                    {limit && (
                      <TouchableOpacity style={styles.deleteBtn} onPress={() => handleDeleteBudget(cat.label)}>
                        <Text style={styles.deleteBtnText}>Remove</Text>
                      </TouchableOpacity>
                    )}
                  </View>
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
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg, paddingTop: 60, paddingHorizontal: 20 },
  heading: { fontSize: 28, fontWeight: '800', color: COLORS.text, letterSpacing: -0.8, marginBottom: 4 },
  subheading: { fontSize: 14, color: COLORS.textMuted, marginBottom: 24 },
  recommendCard: { backgroundColor: COLORS.card, borderRadius: 16, padding: 16, marginBottom: 20, borderWidth: 1, borderColor: COLORS.accent + '44' },
  recommendHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  recommendLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  recommendIconBox2: { width: 40, height: 40, borderRadius: 12, backgroundColor: COLORS.accent + '22', justifyContent: 'center', alignItems: 'center' },
  recommendTitle: { fontSize: 14, fontWeight: '700', color: COLORS.text },
  recommendSub: { fontSize: 12, color: COLORS.textMuted, marginTop: 2 },
  recommendDivider: { height: 1, backgroundColor: COLORS.border, marginVertical: 14 },
  recommendList: {},
  recommendItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  recommendItemLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  recommendIconBox: { width: 36, height: 36, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  recommendCatName: { fontSize: 14, fontWeight: '600', color: COLORS.text },
  recommendAvg: { fontSize: 11, color: COLORS.textMuted, marginTop: 2 },
  recommendItemRight: { alignItems: 'flex-end', gap: 6 },
  recommendAmount: { fontSize: 14, fontWeight: '800', color: COLORS.accent },
  applyBtn: { backgroundColor: COLORS.accent + '22', borderRadius: 8, paddingVertical: 4, paddingHorizontal: 10, borderWidth: 1, borderColor: COLORS.accent + '44' },
  applyBtnText: { fontSize: 12, color: COLORS.accent, fontWeight: '700' },
  applyAllBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.accent, borderRadius: 12, padding: 14, marginTop: 8 },
  applyAllBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  card: { backgroundColor: COLORS.card, borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: COLORS.border },
  cardOver: { borderColor: COLORS.accentRed + '44' },
  cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  iconBox: { width: 44, height: 44, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  cardInfo: { flex: 1 },
  catName: { fontSize: 15, fontWeight: '600', color: COLORS.text, letterSpacing: -0.2 },
  spentText: { fontSize: 13, color: COLORS.textMuted, marginTop: 2 },
  limitText: { color: COLORS.textMuted },
  editBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 6, paddingHorizontal: 10, borderRadius: 8, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.cardAlt },
  editBtnActive: { borderColor: COLORS.accentRed + '44', backgroundColor: COLORS.accentRed + '11' },
  editBtnText: { fontSize: 12, fontWeight: '600', color: COLORS.accent },
  progressBg: { height: 6, backgroundColor: COLORS.border, borderRadius: 3, marginBottom: 6, overflow: 'hidden' },
  progressFill: { height: 6, borderRadius: 3 },
  warningRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  warningText: { fontSize: 11, color: COLORS.accentYellow, fontWeight: '600' },
  overBanner: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: COLORS.accentRed + '11', borderRadius: 8, padding: 8, marginTop: 6, borderWidth: 1, borderColor: COLORS.accentRed + '33' },
  overText: { fontSize: 12, color: COLORS.accentRed, fontWeight: '600', flex: 1 },
  inlineRecCard: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: COLORS.accentYellow + '11', borderRadius: 10, padding: 10, marginTop: 8, borderWidth: 1, borderColor: COLORS.accentYellow + '33' },
  inlineRecText: { flex: 1, fontSize: 12, color: COLORS.textMuted },
  inlineRecApply: { fontSize: 11, color: COLORS.accentYellow, fontWeight: '700' },
  recHint: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: COLORS.accentYellow + '11', borderRadius: 8, padding: 8, marginTop: 10, borderWidth: 1, borderColor: COLORS.accentYellow + '33' },
  recHintText: { fontSize: 12, color: COLORS.textMuted, flex: 1 },
  editRow: { flexDirection: 'row', alignItems: 'center', marginTop: 10, gap: 8 },
  editInput: { flex: 1, backgroundColor: COLORS.cardAlt, borderRadius: 10, padding: 10, color: COLORS.text, fontSize: 14, borderWidth: 1, borderColor: COLORS.border },
  saveBtn: { backgroundColor: COLORS.accent, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 14 },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  deleteBtn: { backgroundColor: COLORS.cardAlt, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 14, borderWidth: 1, borderColor: COLORS.border },
  deleteBtnText: { color: COLORS.accentRed, fontWeight: '600', fontSize: 13 },
})