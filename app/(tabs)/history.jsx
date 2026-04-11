import { useState, useCallback, useEffect } from 'react'
import {
  View, Text, StyleSheet, SectionList, TouchableOpacity,
  RefreshControl, TextInput, ScrollView, Platform
} from 'react-native'
import DateTimePicker from '@react-native-community/datetimepicker'
import { useFocusEffect } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../../src/lib/supabase'
import { COLORS, CATEGORIES } from '../../src/constants/theme'
import { HistorySkeleton } from '../../src/components/SkeletonLoader'
import { getCurrencySymbol, loadCurrency, formatAmount } from '../../src/lib/currency'
import BottomSheet from '../../src/components/BottomSheet'
import CustomAlert from '../../src/components/CustomAlert'
import useAlert from '../../src/hooks/useAlert'
import * as FileSystem from 'expo-file-system/legacy'
import * as Sharing from 'expo-sharing'
import { saveCache, loadCache, clearCache } from '../../src/lib/cache'
import { getUser } from '../../src/lib/auth'
import NetInfo from '@react-native-community/netinfo'
import { addToQueue } from '../../src/lib/offlineQueue'

export default function History() {
  const [expenses, setExpenses] = useState(null)
  const [refreshing, setRefreshing] = useState(false)
  const [editingExpense, setEditingExpense] = useState(null)
  const [editAmount, setEditAmount] = useState('')
  const [editCategory, setEditCategory] = useState('')
  const [editNote, setEditNote] = useState('')
  const [editDate, setEditDate] = useState('')
  const [showEditDatePicker, setShowEditDatePicker] = useState(false)
  const [saving, setSaving] = useState(false)
  const [currencySymbol, setCurrencySymbol] = useState('₹')
  const [currencyCode, setCurrencyCode] = useState('INR')
  const [search, setSearch] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('All')
  const [selectedMonth, setSelectedMonth] = useState('All')
  const [showFilters, setShowFilters] = useState(false)
  const [isOnline, setIsOnline] = useState(true)
  const { alertConfig, showAlert, hideAlert } = useAlert()

  const CACHE_KEY = 'savr_cache_history'

  useEffect(() => {
    const unsub = NetInfo.addEventListener(state => {
      const online = state.isConnected && state.isInternetReachable !== false
      setIsOnline(!!online)
    })
    return () => unsub()
  }, [])

  function sortExpenses(data) {
    return [...data].sort((a, b) => {
      if (b.date !== a.date) return b.date.localeCompare(a.date)
      return new Date(b.created_at || 0) - new Date(a.created_at || 0)
    })
  }

  async function fetchExpenses(forceRefresh = false) {
    const symbol = await getCurrencySymbol()
    const code = await loadCurrency()
    setCurrencySymbol(symbol)
    setCurrencyCode(code)

    if (!forceRefresh) {
      const cached = await loadCache(CACHE_KEY)
      if (cached) {
        setExpenses(sortExpenses(cached))
        syncFromSupabase()
        return
      }
    }

    await syncFromSupabase()
  }

  async function syncFromSupabase() {
    try {
      const user = await getUser()
      const { data, error } = await supabase
        .from('expenses')
        .select('*')
        .eq('user_id', user.id)
        .order('date', { ascending: false })
        .order('created_at', { ascending: false })
      if (!error && data) {
        const sorted = sortExpenses(data)
        setExpenses(sorted)
        await saveCache(CACHE_KEY, sorted)
      }
    } catch {
      // Silently fail — cache already shown
    } finally {
      setRefreshing(false)
    }
  }

  useFocusEffect(useCallback(() => { fetchExpenses() }, []))

  function getMonths() {
    if (!expenses) return []
    const months = [...new Set(expenses.map(e => e.date.slice(0, 7)))]
    return months.sort((a, b) => b.localeCompare(a))
  }

  function formatDate(dateStr) {
    const today = new Date()
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)
    const yesterdayStr = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`
    if (dateStr === todayStr) return 'Today'
    if (dateStr === yesterdayStr) return 'Yesterday'
    return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
  }

  const filtered = (expenses || []).filter(e => {
    const matchSearch = search === '' ||
      e.note?.toLowerCase().includes(search.toLowerCase()) ||
      e.category.toLowerCase().includes(search.toLowerCase()) ||
      String(parseFloat(e.amount).toFixed(2)).includes(search)
    const matchCategory = selectedCategory === 'All' || e.category === selectedCategory
    const matchMonth = selectedMonth === 'All' || e.date.startsWith(selectedMonth)
    return matchSearch && matchCategory && matchMonth
  })

  function groupByDate(data) {
    const groups = {}
    data.forEach(e => {
      if (!groups[e.date]) groups[e.date] = []
      groups[e.date].push(e)
    })
    return Object.keys(groups)
      .sort((a, b) => b.localeCompare(a))
      .map(date => ({
        title: date,
        data: groups[date],
        total: groups[date].reduce((sum, e) => sum + parseFloat(e.amount), 0)
      }))
  }

  const sections = groupByDate(filtered)
  const activeFilters = (selectedCategory !== 'All' ? 1 : 0) + (selectedMonth !== 'All' ? 1 : 0)

  function clearFilters() {
    setSelectedCategory('All')
    setSelectedMonth('All')
    setSearch('')
  }

  async function handleDelete(id) {
    if (id?.toString().startsWith('offline_')) {
      showAlert('Delete Expense', 'Are you sure you want to delete this expense?', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete', style: 'destructive',
          onPress: async () => {
            const updated = (expenses || []).filter(e => e.id !== id)
            setExpenses(updated)
            await saveCache(CACHE_KEY, updated)
          }
        }
      ])
      return
    }

    showAlert('Delete Expense', 'Are you sure you want to delete this expense?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          const updated = (expenses || []).filter(e => e.id !== id)
          setExpenses(updated)
          await saveCache(CACHE_KEY, updated)

          const now = new Date()
          const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
          await clearCache(`savr_cache_dashboard_${currentMonth}`)
          await clearCache(`savr_cache_budgets_${currentMonth}`)
          await clearCache(`savr_cache_reports_${currentMonth}`)

          if (!isOnline) {
            await addToQueue({ type: 'delete_expense', id })
          } else {
            await supabase.from('expenses').delete().eq('id', id)
          }
        }
      }
    ])
  }

  function openEdit(expense) {
    if (expense.id?.toString().startsWith('offline_')) {
      return showAlert('Pending Sync', 'This expense is waiting to sync. Edit it once you are back online.')
    }
    setEditingExpense(expense)
    setEditAmount(String(expense.amount))
    setEditCategory(expense.category)
    setEditNote(expense.note || '')
    setEditDate(expense.date)
    setShowEditDatePicker(false)
  }

  async function handleSaveEdit() {
    if (!editAmount || isNaN(parseFloat(editAmount))) {
      return showAlert('Invalid', 'Please enter a valid amount')
    }
    setSaving(true)

    const updatedExpense = {
      ...editingExpense,
      amount: parseFloat(editAmount),
      category: editCategory,
      note: editNote.trim(),
      date: editDate,
    }

    const updated = (expenses || []).map(e =>
      e.id === editingExpense.id ? updatedExpense : e
    )
    const sorted = sortExpenses(updated)
    setExpenses(sorted)
    await saveCache(CACHE_KEY, sorted)

    const now = new Date()
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    await clearCache(`savr_cache_dashboard_${currentMonth}`)
    await clearCache(`savr_cache_budgets_${currentMonth}`)
    await clearCache(`savr_cache_reports_${currentMonth}`)

    setEditingExpense(null)

    if (!isOnline) {
      await addToQueue({
        type: 'edit_expense',
        id: editingExpense.id,
        amount: parseFloat(editAmount),
        category: editCategory,
        note: editNote.trim(),
        date: editDate,
      })
    } else {
      const { error } = await supabase
        .from('expenses')
        .update({
          amount: parseFloat(editAmount),
          category: editCategory,
          note: editNote.trim(),
          date: editDate,
        })
        .eq('id', editingExpense.id)
      if (error) showAlert('Error', error.message)
    }

    setSaving(false)
  }

  async function handleExport() {
    try {
      if (!expenses || expenses.length === 0) {
        return showAlert('No data', 'No expenses to export')
      }
      const headers = 'Date,Category,Amount,Note\n'
      const rows = expenses.map(e =>
        `${e.date},${e.category},${e.amount},"${e.note || ''}"`
      ).join('\n')
      const csvContent = headers + rows
      const fileUri = FileSystem.cacheDirectory + 'expenses.csv'
      await FileSystem.writeAsStringAsync(fileUri, csvContent, { encoding: 'utf8' })
      const isAvailable = await Sharing.isAvailableAsync()
      if (isAvailable) {
        await Sharing.shareAsync(fileUri, { mimeType: 'text/csv', dialogTitle: 'Export Expenses' })
      } else {
        showAlert('Not Available', 'Sharing is not available on this device')
      }
    } catch (error) {
      showAlert('Export Failed', error.message)
    }
  }

  function getCategoryInfo(label) {
    return CATEGORIES.find(c => c.label === label) || { icon: '📦', color: '#888' }
  }

  function renderSectionHeader({ section }) {
    return (
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionHeaderDate}>{formatDate(section.title)}</Text>
        <Text style={styles.sectionHeaderTotal}>
          {formatAmount(section.total, currencySymbol, currencyCode)}
        </Text>
      </View>
    )
  }

  function renderItem({ item }) {
    const cat = getCategoryInfo(item.category)
    return (
      <TouchableOpacity style={styles.card} onPress={() => openEdit(item)}>
        <View style={[styles.iconBox, { backgroundColor: cat.color + '22' }]}>
          <Text style={styles.icon}>{cat.icon}</Text>
        </View>
        <View style={styles.info}>
          <Text style={styles.category}>{item.category}</Text>
          <Text style={styles.note}>{item.note || formatDate(item.date)}</Text>
        </View>
        <View style={styles.right}>
          <Text style={styles.amount}>
            {formatAmount(item.amount, currencySymbol, currencyCode)}
          </Text>
        </View>
        <TouchableOpacity style={styles.deleteBtn} onPress={() => handleDelete(item.id)}>
          <Ionicons name="trash-outline" size={16} color={COLORS.accentRed} />
        </TouchableOpacity>
      </TouchableOpacity>
    )
  }

  if (expenses === null) return <HistorySkeleton />

  return (
    <View style={styles.container}>
      <View style={styles.headingRow}>
        <Text style={styles.heading}>History</Text>
        <TouchableOpacity style={styles.exportBtn} onPress={handleExport}>
          <Ionicons name="share-outline" size={16} color={COLORS.accent} style={{ marginRight: 6 }} />
          <Text style={styles.exportText}>Export</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.searchRow}>
        <View style={styles.searchBox}>
          <Ionicons name="search-outline" size={16} color={COLORS.textMuted} style={{ marginRight: 8 }} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search expenses..."
            placeholderTextColor={COLORS.textMuted}
            value={search}
            onChangeText={setSearch}
          />
          {search !== '' && (
            <TouchableOpacity onPress={() => setSearch('')}>
              <Ionicons name="close-circle" size={16} color={COLORS.textMuted} />
            </TouchableOpacity>
          )}
        </View>
        <TouchableOpacity
          style={[styles.filterBtn, activeFilters > 0 && styles.filterBtnActive]}
          onPress={() => setShowFilters(true)}
        >
          <Ionicons name="options-outline" size={18} color={activeFilters > 0 ? '#fff' : COLORS.text} />
          {activeFilters > 0 && <Text style={styles.filterBadge}>{activeFilters}</Text>}
        </TouchableOpacity>
      </View>

      {activeFilters > 0 && (
        <View style={styles.chipRow}>
          {selectedCategory !== 'All' && (
            <TouchableOpacity style={styles.chip} onPress={() => setSelectedCategory('All')}>
              <Text style={styles.chipText}>{selectedCategory} ✕</Text>
            </TouchableOpacity>
          )}
          {selectedMonth !== 'All' && (
            <TouchableOpacity style={styles.chip} onPress={() => setSelectedMonth('All')}>
              <Text style={styles.chipText}>{selectedMonth} ✕</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={clearFilters}>
            <Text style={styles.clearText}>Clear all</Text>
          </TouchableOpacity>
        </View>
      )}

      {(search !== '' || activeFilters > 0) && (
        <Text style={styles.resultsText}>{filtered.length} result{filtered.length !== 1 ? 's' : ''}</Text>
      )}

      {filtered.length === 0 ? (
        <View style={styles.centered}>
          <Ionicons name="file-tray-outline" size={56} color={COLORS.border} />
          <Text style={styles.emptyText}>No results found</Text>
          <TouchableOpacity onPress={clearFilters}>
            <Text style={{ color: COLORS.accent, marginTop: 8 }}>Clear filters</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={item => item.id}
          renderItem={renderItem}
          renderSectionHeader={renderSectionHeader}
          contentContainerStyle={{ paddingBottom: 40 }}
          stickySectionHeadersEnabled={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); fetchExpenses(true) }}
              tintColor={COLORS.accent}
            />
          }
        />
      )}

      {/* Filter Bottom Sheet */}
      <BottomSheet visible={showFilters} onClose={() => setShowFilters(false)}>
        <View style={styles.sheetHeader}>
          <Text style={styles.sheetTitle}>Filter</Text>
          <TouchableOpacity onPress={() => setShowFilters(false)}>
            <Ionicons name="close" size={22} color={COLORS.textMuted} />
          </TouchableOpacity>
        </View>
        <ScrollView>
          <Text style={styles.filterLabel}>Category</Text>
          <View style={styles.filterGrid}>
            {['All', ...CATEGORIES.map(c => c.label)].map(cat => (
              <TouchableOpacity
                key={cat}
                style={[styles.filterChip, selectedCategory === cat && styles.filterChipActive]}
                onPress={() => setSelectedCategory(cat)}
              >
                {cat !== 'All' && (
                  <Text style={{ fontSize: 14 }}>{CATEGORIES.find(c => c.label === cat)?.icon}</Text>
                )}
                <Text style={[styles.filterChipText, selectedCategory === cat && { color: '#fff' }]}>{cat}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={styles.filterLabel}>Month</Text>
          <View style={styles.filterGrid}>
            {['All', ...getMonths()].map(m => (
              <TouchableOpacity
                key={m}
                style={[styles.filterChip, selectedMonth === m && styles.filterChipActive]}
                onPress={() => setSelectedMonth(m)}
              >
                <Text style={[styles.filterChipText, selectedMonth === m && { color: '#fff' }]}>
                  {m === 'All' ? 'All' : new Date(m + '-01').toLocaleString('default', { month: 'short', year: 'numeric' })}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <TouchableOpacity style={styles.applyBtn} onPress={() => setShowFilters(false)}>
            <Text style={styles.applyBtnText}>Apply Filters</Text>
          </TouchableOpacity>
          {activeFilters > 0 && (
            <TouchableOpacity style={styles.clearBtn} onPress={() => { clearFilters(); setShowFilters(false) }}>
              <Text style={styles.clearBtnText}>Clear All Filters</Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      </BottomSheet>

      {/* Edit Bottom Sheet */}
      <BottomSheet visible={editingExpense !== null} onClose={() => setEditingExpense(null)} maxHeight="92%">
        <View style={styles.sheetHeader}>
          <Text style={styles.sheetTitle}>Edit Expense</Text>
          <TouchableOpacity onPress={() => setEditingExpense(null)}>
            <Ionicons name="close" size={22} color={COLORS.textMuted} />
          </TouchableOpacity>
        </View>
        <ScrollView keyboardShouldPersistTaps="handled">
          <Text style={styles.filterLabel}>Amount ({currencySymbol})</Text>
          <TextInput
            style={styles.input}
            value={editAmount}
            onChangeText={setEditAmount}
            keyboardType="numeric"
            placeholderTextColor={COLORS.textMuted}
          />
          <Text style={styles.filterLabel}>Category</Text>
          <View style={styles.categoryGrid}>
            {CATEGORIES.map(cat => (
              <TouchableOpacity
                key={cat.label}
                style={[
                  styles.categoryBtn,
                  editCategory === cat.label && {
                    backgroundColor: cat.color + '22',
                    borderColor: cat.color,
                    borderWidth: 2,
                  }
                ]}
                onPress={() => setEditCategory(cat.label)}
              >
                <View style={[
                  styles.categoryIconBox,
                  { backgroundColor: editCategory === cat.label ? cat.color : COLORS.cardAlt }
                ]}>
                  <Text style={styles.categoryIcon}>{cat.icon}</Text>
                </View>
                <Text style={[
                  styles.categoryLabel,
                  editCategory === cat.label && { color: COLORS.text, fontWeight: '700' }
                ]}>
                  {cat.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={styles.filterLabel}>Date</Text>
          <TouchableOpacity
            style={styles.datePicker}
            onPress={() => setShowEditDatePicker(true)}
          >
            <Ionicons name="calendar-outline" size={18} color={COLORS.textMuted} style={{ marginRight: 10 }} />
            <Text style={styles.datePickerText}>
              {editDate ? new Date(editDate + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }) : ''}
            </Text>
          </TouchableOpacity>
          {showEditDatePicker && (
            <DateTimePicker
              value={new Date(editDate + 'T00:00:00')}
              mode="date"
              display={Platform.OS === 'ios' ? 'spinner' : 'default'}
              onChange={(event, selectedDate) => {
                setShowEditDatePicker(Platform.OS === 'ios')
                if (selectedDate) {
                  const formatted = `${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, '0')}-${String(selectedDate.getDate()).padStart(2, '0')}`
                  setEditDate(formatted)
                }
              }}
            />
          )}
          <Text style={styles.filterLabel}>Note</Text>
          <TextInput
            style={[styles.input, { height: 80, textAlignVertical: 'top' }]}
            value={editNote}
            onChangeText={setEditNote}
            multiline
            placeholderTextColor={COLORS.textMuted}
          />
          <View style={styles.modalBtns}>
            <TouchableOpacity style={styles.cancelBtn} onPress={() => setEditingExpense(null)}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.saveBtn} onPress={handleSaveEdit} disabled={saving}>
              <Text style={styles.saveBtnText}>{saving ? 'Saving...' : 'Save'}</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </BottomSheet>

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

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg, paddingTop: 60, paddingHorizontal: 20 },
  headingRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  heading: { fontSize: 28, fontWeight: '800', color: COLORS.text, letterSpacing: -0.8 },
  exportBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.card, borderRadius: 10, paddingVertical: 8, paddingHorizontal: 14, borderWidth: 1, borderColor: COLORS.border },
  exportText: { color: COLORS.accent, fontWeight: '600', fontSize: 13 },
  searchRow: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  searchBox: {
    flex: 1, flexDirection: 'row', alignItems: 'center',
    backgroundColor: COLORS.card, borderRadius: 12, paddingHorizontal: 14,
    borderWidth: 1, borderColor: COLORS.border,
  },
  searchInput: { flex: 1, color: COLORS.text, fontSize: 14, paddingVertical: 12 },
  filterBtn: { width: 46, height: 46, borderRadius: 12, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border },
  filterBtnActive: { backgroundColor: COLORS.accent, borderColor: COLORS.accent },
  filterBadge: { position: 'absolute', top: 6, right: 6, fontSize: 9, color: '#fff', fontWeight: '700' },
  chipRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' },
  chip: { backgroundColor: COLORS.accent + '33', borderRadius: 20, paddingVertical: 4, paddingHorizontal: 12 },
  chipText: { color: COLORS.accent, fontSize: 12, fontWeight: '600' },
  clearText: { color: COLORS.accentRed, fontSize: 12, fontWeight: '600' },
  resultsText: { fontSize: 12, color: COLORS.textMuted, marginBottom: 10 },
  sectionHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 10, paddingHorizontal: 4, marginTop: 8,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
    marginBottom: 8,
  },
  sectionHeaderDate: { fontSize: 13, fontWeight: '700', color: COLORS.textMuted, letterSpacing: 0.5 },
  sectionHeaderTotal: { fontSize: 13, fontWeight: '800', color: COLORS.text },
  card: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: COLORS.card, borderRadius: 14,
    padding: 14, marginBottom: 8,
    borderWidth: 1, borderColor: COLORS.border,
  },
  iconBox: { width: 44, height: 44, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  icon: { fontSize: 20 },
  info: { flex: 1 },
  category: { fontSize: 15, fontWeight: '600', color: COLORS.text, letterSpacing: -0.2 },
  note: { fontSize: 12, color: COLORS.textMuted, marginTop: 2 },
  right: { alignItems: 'flex-end', marginRight: 10 },
  amount: { fontSize: 15, fontWeight: '800', color: COLORS.accentGreen, letterSpacing: -0.5 },
  deleteBtn: { padding: 6 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyText: { fontSize: 18, color: COLORS.textMuted, marginTop: 12, fontWeight: '600' },
  sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  sheetTitle: { fontSize: 20, fontWeight: '700', color: COLORS.text },
  filterLabel: { fontSize: 13, color: COLORS.textMuted, marginBottom: 10, marginLeft: 2, fontWeight: '600' },
  filterGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20 },
  filterChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingVertical: 8, paddingHorizontal: 14, borderRadius: 20,
    borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.cardAlt,
  },
  filterChipActive: { backgroundColor: COLORS.accent, borderColor: COLORS.accent },
  filterChipText: { fontSize: 13, color: COLORS.textMuted, fontWeight: '500' },
  applyBtn: { backgroundColor: COLORS.accent, borderRadius: 12, padding: 16, alignItems: 'center', marginBottom: 12 },
  applyBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  clearBtn: { borderRadius: 12, padding: 14, alignItems: 'center', borderWidth: 1, borderColor: COLORS.border, marginBottom: 20 },
  clearBtnText: { color: COLORS.accentRed, fontWeight: '600', fontSize: 15 },
  input: {
    backgroundColor: COLORS.cardAlt, borderRadius: 12, padding: 14,
    color: COLORS.text, fontSize: 15, borderWidth: 1,
    borderColor: COLORS.border, marginBottom: 16,
  },
  datePicker: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: COLORS.cardAlt, borderRadius: 12, padding: 14,
    borderWidth: 1, borderColor: COLORS.border, marginBottom: 16,
  },
  datePickerText: { fontSize: 15, color: COLORS.text, fontWeight: '500' },
  categoryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 16 },
  categoryBtn: {
    width: '22%', alignItems: 'center',
    paddingVertical: 12, borderRadius: 14,
    borderWidth: 1, borderColor: COLORS.border,
    backgroundColor: COLORS.cardAlt, gap: 8,
  },
  categoryIconBox: {
    width: 40, height: 40, borderRadius: 12,
    justifyContent: 'center', alignItems: 'center',
  },
  categoryIcon: { fontSize: 20 },
  categoryLabel: { fontSize: 11, color: COLORS.textMuted, fontWeight: '500', textAlign: 'center' },
  modalBtns: { flexDirection: 'row', gap: 12, marginTop: 8, marginBottom: 20 },
  cancelBtn: { flex: 1, borderRadius: 12, padding: 14, alignItems: 'center', borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.cardAlt },
  cancelText: { color: COLORS.textMuted, fontWeight: '600', fontSize: 15 },
  saveBtn: { flex: 1, backgroundColor: COLORS.accent, borderRadius: 12, padding: 14, alignItems: 'center' },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
})