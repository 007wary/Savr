import { useState, useCallback, useRef, useMemo } from 'react'
import {
  View, Text, StyleSheet,
  TouchableOpacity, RefreshControl, TextInput
} from 'react-native'
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useFocusEffect, useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { CATEGORIES, SCREEN } from '../src/constants/theme'
import { useTheme } from '../src/lib/themeContext'
import { getCurrencySymbol, loadCurrency, formatAmount, roundMoney } from '../src/lib/currency'
import { getUser, getCachedUser } from '../src/lib/auth'
import CustomAlert from '../src/components/CustomAlert'
import useAlert from '../src/hooks/useAlert'
import {
  getRecurring, getInactiveRecurring, deleteRecurring, permanentDeleteRecurring,
  getRecurringIncome, getInactiveRecurringIncome, deleteRecurringIncome, permanentDeleteRecurringIncome,
  updateRecurringExpense, updateRecurringIncome,
} from '../src/services/sqliteService'
import { loadCache, saveCache } from '../src/lib/cache'

const FREQUENCIES = ['daily', 'weekly', 'monthly']

const INCOME_CATEGORIES = [
  { label: 'Salary', icon: 'briefcase-outline', color: '#4CAF50' },
  { label: 'Freelance', icon: 'laptop-outline', color: '#2196F3' },
  { label: 'Business', icon: 'storefront-outline', color: '#FF9800' },
  { label: 'Investment', icon: 'trending-up-outline', color: '#9C27B0' },
  { label: 'Rental', icon: 'home-outline', color: '#00BCD4' },
  { label: 'Gift', icon: 'gift-outline', color: '#E91E63' },
  { label: 'Other', icon: 'ellipsis-horizontal-outline', color: '#607D8B' },
]

function FrequencyBadge({ frequency }) {
  const { COLORS } = useTheme()
  const colors = { daily: COLORS.accentGreen, weekly: COLORS.accentYellow, monthly: COLORS.accent }
  const color = colors[frequency] || COLORS.accent
  return (
    <View style={{ borderRadius: 6, paddingVertical: 2, paddingHorizontal: 8, borderWidth: 1, backgroundColor: color + '22', borderColor: color + '44' }}>
      <Text style={{ fontSize: 10, fontWeight: '700', color }}>{frequency?.charAt(0).toUpperCase() + frequency?.slice(1)}</Text>
    </View>
  )
}

export default function RecurringScreen() {
  const { COLORS } = useTheme()
  const insets = useSafeAreaInsets()
  const [activeTab, setActiveTab] = useState('expense')
  const [activeItems, setActiveItems] = useState([])
  const [inactiveItems, setInactiveItems] = useState([])
  const [activeIncomeItems, setActiveIncomeItems] = useState([])
  const [inactiveIncomeItems, setInactiveIncomeItems] = useState([])
  const [refreshing, setRefreshing] = useState(false)
  const [loading, setLoading] = useState(true)
  const [currencySymbol, setCurrencySymbol] = useState('$')
  const [currencyCode, setCurrencyCode] = useState('USD')
  const [editingId, setEditingId] = useState(null)
  const [editAmount, setEditAmount] = useState('')
  const [editNote, setEditNote] = useState('')
  const [editFrequency, setEditFrequency] = useState('monthly')
  const { alertConfig, showAlert, hideAlert } = useAlert()
  const router = useRouter()
  const userRef = useRef(null)

  async function fetchData() {
    try {
      const symbol = await getCurrencySymbol()
      const code = await loadCurrency()
      setCurrencySymbol(symbol)
      setCurrencyCode(code)
      const user = getCachedUser() || await getUser()
      if (!user) { setLoading(false); setRefreshing(false); return }
      userRef.current = user
      const [active, inactive, activeIncome, inactiveIncome] = await Promise.all([
        getRecurring(user.id),
        getInactiveRecurring(user.id),
        getRecurringIncome(user.id),
        getInactiveRecurringIncome(user.id),
      ])
      setActiveItems(active)
      setInactiveItems(inactive)
      setActiveIncomeItems(activeIncome)
      setInactiveIncomeItems(inactiveIncome)
    } catch {}
    finally { setLoading(false); setRefreshing(false) }
  }

  const initialLoadDone = useRef(false)

  useFocusEffect(useCallback(() => {
    if (!initialLoadDone.current) {
      initialLoadDone.current = true
      setLoading(true)
    }
    fetchData()
  }, []))

  function getCategoryInfo(label, isIncome = false) {
    if (isIncome) return INCOME_CATEGORIES.find(c => c.label === label) || { icon: 'cash-outline', color: '#4CAF50' }
    return CATEGORIES.find(c => c.label === label) || { icon: 'grid-outline', color: '#888' }
  }

  function formatDate(dateStr) {
    if (!dateStr) return 'N/A'
    return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
  }

  async function handleDelete(item) {
    showAlert('Deactivate Recurring', `Stop "${item.note || item.category}" from auto-logging?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Deactivate', style: 'destructive',
        onPress: async () => {
          try {
            await deleteRecurring(item.id)
            setActiveItems(prev => prev.filter(i => i.id !== item.id))
            setInactiveItems(prev => [{ ...item, is_active: 0 }, ...prev])
            await refreshDashboardCache()
          } catch {}
        }
      }
    ])
  }

  async function handleDeleteIncome(item) {
    showAlert('Deactivate Recurring Income', `Stop "${item.note || item.category}" from auto-logging?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Deactivate', style: 'destructive',
        onPress: async () => {
          try {
            await deleteRecurringIncome(item.id)
            setActiveIncomeItems(prev => prev.filter(i => i.id !== item.id))
            setInactiveIncomeItems(prev => [{ ...item, is_active: 0 }, ...prev])
          } catch {}
        }
      }
    ])
  }

  async function handlePermanentDelete(item) {
    showAlert('Delete Permanently', `Permanently delete "${item.note || item.category}"? This cannot be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          try {
            await permanentDeleteRecurring(item.id)
            setInactiveItems(prev => prev.filter(i => i.id !== item.id))
          } catch {}
        }
      }
    ])
  }

  async function handlePermanentDeleteIncome(item) {
    showAlert('Delete Permanently', `Permanently delete "${item.note || item.category}"? This cannot be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          try {
            await permanentDeleteRecurringIncome(item.id)
            setInactiveIncomeItems(prev => prev.filter(i => i.id !== item.id))
          } catch {}
        }
      }
    ])
  }

  async function refreshDashboardCache() {
    try {
      const now = new Date()
      const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
      const dashCacheKey = `savr_cache_dashboard_${currentMonth}`
      const dashCached = await loadCache(dashCacheKey)
      if (dashCached) {
        const user = getCachedUser() || await getUser()
        if (!user) return
        const fresh = await getRecurring(user.id)
        const recTotal = roundMoney(fresh.reduce((sum, r) => sum + parseFloat(r.amount), 0))
        await saveCache(dashCacheKey, { ...dashCached, recurringTotal: recTotal, recurringCount: fresh.length })
      }
    } catch {}
  }

  function openEdit(item) {
    setEditingId(item.id)
    setEditAmount(String(item.amount))
    setEditNote(item.note || '')
    setEditFrequency(item.frequency)
  }

  async function handleSaveEdit(item, isIncome = false) {
    if (!editAmount || isNaN(parseFloat(editAmount)) || parseFloat(editAmount) <= 0) {
      return showAlert('Invalid', 'Please enter a valid amount')
    }
    try {
      const fields = { amount: parseFloat(editAmount), note: editNote.trim(), frequency: editFrequency }
      if (isIncome) {
        await updateRecurringIncome(item.id, fields)
      } else {
        await updateRecurringExpense(item.id, fields)
      }
      const updatedItem = { ...item, amount: parseFloat(editAmount), note: editNote.trim(), frequency: editFrequency }
      if (isIncome) {
        setActiveIncomeItems(prev => prev.map(i => i.id === item.id ? updatedItem : i))
      } else {
        setActiveItems(prev => prev.map(i => i.id === item.id ? updatedItem : i))
        await refreshDashboardCache()
      }
      setEditingId(null)
    } catch {
      showAlert('Error', 'Could not save changes.')
    }
  }

  function renderItem(item, isIncome = false) {
    const cat = getCategoryInfo(item.category, isIncome)
    const isEditing = editingId === item.id
    return (
      <View key={item.id} style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={[styles.iconBox, { backgroundColor: cat.color + '22' }]}>
            <Ionicons name={cat.icon} size={20} color={cat.color} />
          </View>
          <View style={styles.cardInfo}>
            <Text style={styles.cardTitle}>{item.note || item.category}</Text>
            <Text style={styles.cardSub}>Next due: {formatDate(item.next_due)}</Text>
          </View>
          <View style={styles.cardRight}>
            <Text style={[styles.cardAmount, isIncome && { color: '#4CAF50' }]}>
              {isIncome ? '+' : ''}{formatAmount(item.amount, currencySymbol, currencyCode)}
            </Text>
            <FrequencyBadge frequency={item.frequency} />
          </View>
        </View>

        {!isEditing && (
          <View style={styles.cardActions}>
            <TouchableOpacity style={styles.editBtn} onPress={() => openEdit(item)}>
              <Ionicons name="pencil-outline" size={14} color={COLORS.accent} />
              <Text style={styles.editBtnText}>Edit</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.deleteBtn} onPress={() => isIncome ? handleDeleteIncome(item) : handleDelete(item)}>
              <Ionicons name="pause-circle-outline" size={14} color={COLORS.accentRed} />
              <Text style={styles.deleteBtnText}>Deactivate</Text>
            </TouchableOpacity>
          </View>
        )}

        {isEditing && (
          <View style={styles.editSection}>
            <Text style={styles.editLabel}>Amount ({currencySymbol})</Text>
            <TextInput
              style={styles.editInput}
              value={editAmount}
              onChangeText={setEditAmount}
              keyboardType="numeric"
              placeholderTextColor={COLORS.textMuted}
              autoFocus
            />
            <Text style={styles.editLabel}>Note</Text>
            <TextInput
              style={styles.editInput}
              value={editNote}
              onChangeText={setEditNote}
              placeholderTextColor={COLORS.textMuted}
              placeholder={isIncome ? 'e.g. Monthly salary, Rent income' : 'e.g. Netflix, EMI, Rent'}
            />
            <Text style={styles.editLabel}>Frequency</Text>
            <View style={styles.freqRow}>
              {FREQUENCIES.map(f => (
                <TouchableOpacity
                  key={f}
                  style={[styles.freqBtn, editFrequency === f && styles.freqBtnActive]}
                  onPress={() => setEditFrequency(f)}
                >
                  <Text style={[styles.freqBtnText, editFrequency === f && { color: '#fff' }]}>
                    {f.charAt(0).toUpperCase() + f.slice(1)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={styles.editActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setEditingId(null)}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={() => handleSaveEdit(item, isIncome)}>
                <Text style={styles.saveBtnText}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>
    )
  }

  function renderInactiveItem(item, isIncome = false) {
    const cat = getCategoryInfo(item.category, isIncome)
    return (
      <View key={item.id} style={[styles.card, styles.inactiveCard]}>
        <View style={styles.cardHeader}>
          <View style={[styles.iconBox, { backgroundColor: cat.color + '11' }]}>
            <Ionicons name={cat.icon} size={20} color={cat.color + '88'} />
          </View>
          <View style={styles.cardInfo}>
            <Text style={[styles.cardTitle, { color: COLORS.textMuted }]}>{item.note || item.category}</Text>
            <Text style={styles.cardSub}>Stopped {formatDate(item.updated_at?.split('T')[0])}</Text>
          </View>
          <View style={styles.cardRight}>
            <Text style={[styles.cardAmount, { color: COLORS.textMuted }]}>{formatAmount(item.amount, currencySymbol, currencyCode)}</Text>
            <View style={styles.inactiveBadge}>
              <Text style={styles.inactiveBadgeText}>Inactive</Text>
            </View>
          </View>
        </View>
        <View style={styles.cardActions}>
          <TouchableOpacity style={styles.deleteBtn} onPress={() => isIncome ? handlePermanentDeleteIncome(item) : handlePermanentDelete(item)}>
            <Ionicons name="trash-outline" size={14} color={COLORS.accentRed} />
            <Text style={styles.deleteBtnText}>Delete Permanently</Text>
          </TouchableOpacity>
        </View>
      </View>
    )
  }

  const currentActive = activeTab === 'expense' ? activeItems : activeIncomeItems
  const currentInactive = activeTab === 'expense' ? inactiveItems : inactiveIncomeItems
  const isIncome = activeTab === 'income'

  const styles = useMemo(() => StyleSheet.create({
    container: { backgroundColor: COLORS.bg, paddingTop: insets.top + 8, paddingHorizontal: SCREEN.paddingHorizontal },
    header: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 24 },
    backBtn: { padding: 4 },
    heading: { fontSize: 24, fontWeight: '800', color: COLORS.text, letterSpacing: -0.8 },
    sectionLabel: { fontSize: 11, fontWeight: '700', color: COLORS.textMuted, letterSpacing: 1.2, marginBottom: 12, marginLeft: 4 },
    emptyCard: { alignItems: 'center', paddingVertical: 40, backgroundColor: COLORS.card, borderRadius: 16, borderWidth: 1, borderColor: COLORS.border, marginBottom: 12 },
    emptyText: { fontSize: 16, color: COLORS.textMuted, fontWeight: '600', marginTop: 12 },
    emptySub: { fontSize: 13, color: COLORS.textMuted, marginTop: 4 },
    card: { backgroundColor: COLORS.card, borderRadius: 16, padding: 16, marginBottom: 10, borderWidth: 1, borderColor: COLORS.border },
    inactiveCard: { opacity: 0.6 },
    cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    iconBox: { width: 44, height: 44, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
    cardInfo: { flex: 1 },
    cardTitle: { fontSize: 15, fontWeight: '600', color: COLORS.text },
    cardSub: { fontSize: 12, color: COLORS.textMuted, marginTop: 2 },
    cardRight: { alignItems: 'flex-end', gap: 4 },
    cardAmount: { fontSize: 15, fontWeight: '800', color: COLORS.accentGreen },
    freqBadge: { borderRadius: 6, paddingVertical: 2, paddingHorizontal: 8, borderWidth: 1 },
    freqBadgeText: { fontSize: 10, fontWeight: '700' },
    inactiveBadge: { backgroundColor: COLORS.border, borderRadius: 6, paddingVertical: 2, paddingHorizontal: 8 },
    inactiveBadgeText: { fontSize: 10, color: COLORS.textMuted, fontWeight: '600' },
    cardActions: { flexDirection: 'row', gap: 10, marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: COLORS.border },
    editBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: COLORS.accent + '22', borderRadius: 8, paddingVertical: 6, paddingHorizontal: 12, borderWidth: 1, borderColor: COLORS.accent + '44' },
    editBtnText: { fontSize: 12, color: COLORS.accent, fontWeight: '600' },
    deleteBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: COLORS.accentRed + '11', borderRadius: 8, paddingVertical: 6, paddingHorizontal: 12, borderWidth: 1, borderColor: COLORS.accentRed + '33' },
    deleteBtnText: { fontSize: 12, color: COLORS.accentRed, fontWeight: '600' },
    editSection: { marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: COLORS.border },
    editLabel: { fontSize: 12, color: COLORS.textMuted, marginBottom: 6, marginTop: 8 },
    editInput: { backgroundColor: COLORS.cardAlt, borderRadius: 10, padding: 12, color: COLORS.text, fontSize: 14, borderWidth: 1, borderColor: COLORS.border, marginBottom: 4 },
    freqRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
    freqBtn: { flex: 1, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center', backgroundColor: COLORS.cardAlt },
    freqBtnActive: { backgroundColor: COLORS.accent, borderColor: COLORS.accent },
    freqBtnText: { fontSize: 13, color: COLORS.textMuted, fontWeight: '600' },
    editActions: { flexDirection: 'row', gap: 10 },
    cancelBtn: { flex: 1, borderRadius: 10, padding: 12, alignItems: 'center', borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.cardAlt },
    cancelBtnText: { color: COLORS.textMuted, fontWeight: '600' },
    saveBtn: { flex: 1, backgroundColor: COLORS.accent, borderRadius: 10, padding: 12, alignItems: 'center' },
    saveBtnText: { color: '#fff', fontWeight: '700' },
    bottomTabRow: { flexDirection: 'row', backgroundColor: COLORS.card, borderTopWidth: 1, borderTopColor: COLORS.border, height: 80, paddingBottom: 24 },
    bottomTabBtn: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 3, paddingTop: 6 },
    bottomTabText: { fontSize: 11, color: COLORS.textMuted, fontWeight: '600' },
  }), [COLORS, insets.top])

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: COLORS.bg, paddingTop: insets.top + 8, paddingHorizontal: SCREEN.paddingHorizontal }}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={24} color={COLORS.text} />
          </TouchableOpacity>
          <Text style={styles.heading}>Recurring</Text>
        </View>
      </View>
    )
  }

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.bg }}>
      <View style={[styles.container, { flex: 1 }]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={24} color={COLORS.text} />
          </TouchableOpacity>
          <Text style={styles.heading}>Recurring</Text>
        </View>

        <KeyboardAwareScrollView
          contentContainerStyle={{ paddingBottom: 80 }}
          enableOnAndroid
          extraScrollHeight={100}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchData() }} tintColor={COLORS.accent} />
          }
        >
          <Text style={styles.sectionLabel}>ACTIVE ({currentActive.length})</Text>

          {currentActive.length === 0 && (
            <View style={styles.emptyCard}>
              <Ionicons name="repeat-outline" size={40} color={COLORS.border} />
              <Text style={styles.emptyText}>No active recurring {isIncome ? 'income' : 'expenses'}</Text>
              <Text style={styles.emptySub}>Add one from the + button on dashboard</Text>
            </View>
          )}

          {currentActive.map(item => renderItem(item, isIncome))}

          {currentInactive.length > 0 && (
            <>
              <Text style={[styles.sectionLabel, { marginTop: 24 }]}>INACTIVE ({currentInactive.length})</Text>
              {currentInactive.map(item => renderInactiveItem(item, isIncome))}
            </>
          )}
        </KeyboardAwareScrollView>
      </View>

      {/* Bottom tab switcher */}
      <View style={styles.bottomTabRow}>
        {[
          { key: 'expense', label: 'Expenses', icon: 'arrow-up-circle-outline', color: COLORS.accent },
          { key: 'income', label: 'Income', icon: 'arrow-down-circle-outline', color: '#4CAF50' },
        ].map(tab => (
          <TouchableOpacity
            key={tab.key}
            style={[styles.bottomTabBtn, activeTab === tab.key && { borderTopColor: tab.color, borderTopWidth: 2 }]}
            onPress={() => { setActiveTab(tab.key); setEditingId(null) }}
          >
            <Ionicons name={tab.icon} size={22} color={activeTab === tab.key ? tab.color : COLORS.textMuted} />
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
    </View>
  )
}