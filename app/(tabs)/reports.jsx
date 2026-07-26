import { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import {
  View, Text, StyleSheet, ScrollView,
  RefreshControl, TouchableOpacity, Animated, ActivityIndicator
} from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useFocusEffect } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { CATEGORIES, SCREEN } from '../../src/constants/theme'
import { useTheme } from '../../src/lib/themeContext'
import { getCurrencySymbol, loadCurrency, formatAmount, roundMoney } from '../../src/lib/currency'
import { ReportsSkeleton } from '../../src/components/SkeletonLoader'
import { saveCache, loadCache } from '../../src/lib/cache'
import { getUser, getCachedUser } from '../../src/lib/auth'
import { getExpenses, getMonthlyIncomeTotal } from '../../src/services/sqliteService'
import { buildReportInsights } from '../../src/lib/reportInsights'

function getMonthInfo(offset) {
  const d = new Date()
  d.setDate(1)
  d.setMonth(d.getMonth() + offset)
  const month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  const name = d.toLocaleString('default', { month: 'long', year: 'numeric' })
  const totalDays = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
  return { month, name, totalDays }
}

function AnimatedBar({ percentage, color, delay = 0 }) {
  const anim = useRef(new Animated.Value(0)).current
  useEffect(() => {
    Animated.timing(anim, {
      toValue: percentage,
      duration: 800,
      delay,
      useNativeDriver: false,
    }).start()
  }, [percentage, delay, anim])
  return (
    <Animated.View style={{
      height: anim.interpolate({ inputRange: [0, 100], outputRange: ['0%', '100%'] }),
      width: '100%', borderRadius: 6,
      backgroundColor: color,
    }} />
  )
}

export default function Reports() {
  const { COLORS } = useTheme()
  const insets = useSafeAreaInsets()
  const [expenses, setExpenses] = useState([])
  const [lastMonthExpenses, setLastMonthExpenses] = useState([])
  const [allExpenses, setAllExpenses] = useState([])
  const [refreshing, setRefreshing] = useState(false)
  const [currencySymbol, setCurrencySymbol] = useState('$')
  const [currencyCode, setCurrencyCode] = useState('USD')
  const [loading, setLoading] = useState(true)
  const [expandedCategory, setExpandedCategory] = useState(null)
  const [monthlyIncome, setMonthlyIncome] = useState(0)
  const [last6MonthsIncome, setLast6MonthsIncome] = useState([])
  const [monthOffset, setMonthOffset] = useState(0)
  const [monthLoading, setMonthLoading] = useState(false)
  const userRef = useRef(null)
  const syncTokenRef = useRef(0)

  // getNow() called fresh each time to avoid stale date if app open past midnight
  const getNow = () => new Date()

  const loadFromSQLite = useCallback(async () => {
    const token = ++syncTokenRef.current
    try {
      const user = getCachedUser() || userRef.current || await getUser()
      if (!user) { setLoading(false); setRefreshing(false); setMonthLoading(false); return }
      if (!userRef.current) userRef.current = user
      const { month: selectedMonth } = getMonthInfo(monthOffset)
      const allData = await getExpenses(user.id)
      const selectedDate = new Date(selectedMonth + '-01')
      const selectedYear = selectedDate.getFullYear()
      const selectedMonthNum = selectedDate.getMonth() + 1
      const lastMonthDate = new Date(selectedYear, selectedMonthNum - 2, 1)
      const lastMonthKey = `${lastMonthDate.getFullYear()}-${String(lastMonthDate.getMonth() + 1).padStart(2, '0')}`
      const sixMonthsAgo = new Date(selectedYear, selectedMonthNum - 7, 1)
      const endOfSelectedMonth = new Date(selectedYear, selectedMonthNum, 1)
      const currentData = allData.filter(e => e.date.startsWith(selectedMonth))
      const lastMonthData = allData.filter(e => e.date.startsWith(lastMonthKey))
      const sixMonthData = allData.filter(e => {
        // Parse as local midnight (like the sibling boundary dates) so an expense
        // dated the 1st isn't pushed outside the window in timezones behind UTC.
        const d = new Date(e.date + 'T00:00:00')
        return d >= sixMonthsAgo && d < endOfSelectedMonth
      })

      const incomeTotal = await getMonthlyIncomeTotal(user.id, selectedMonth)

      const incomeKeys = Array.from({ length: 6 }, (_, i) => {
        const d = new Date(selectedYear, selectedMonthNum - 1 - (5 - i), 1)
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      })
      const incomeTotals = await Promise.all(incomeKeys.map(key => getMonthlyIncomeTotal(user.id, key)))
      const incomeByMonth = incomeKeys.map((key, i) => ({ key, amount: incomeTotals[i] }))

      const CACHE_KEY = `savr_cache_reports_${selectedMonth}`
      await saveCache(CACHE_KEY, {
        expenses: currentData, lastMonthExpenses: lastMonthData,
        allExpenses: sixMonthData, monthlyIncome: incomeTotal,
        last6MonthsIncome: incomeByMonth,
      })

      // Guard against a slower, superseded fetch (e.g. rapid prev/next taps)
      // overwriting the screen with a different month's data than what's
      // currently selected.
      if (token !== syncTokenRef.current) return
      setExpenses(currentData)
      setLastMonthExpenses(lastMonthData)
      setAllExpenses(sixMonthData)
      setMonthlyIncome(incomeTotal)
      setLast6MonthsIncome(incomeByMonth)
    } catch {}
    finally {
      if (token === syncTokenRef.current) {
        setLoading(false)
        setRefreshing(false)
        setMonthLoading(false)
      }
    }
  }, [monthOffset])

  const fetchData = useCallback(async (forceRefresh = false) => {
    const token = ++syncTokenRef.current
    const { month: selectedMonth } = getMonthInfo(monthOffset)
    const CACHE_KEY = `savr_cache_reports_${selectedMonth}`
    const symbol = await getCurrencySymbol()
    const code = await loadCurrency()
    if (token !== syncTokenRef.current) return
    setCurrencySymbol(symbol)
    setCurrencyCode(code)
    setMonthLoading(true)
    if (!forceRefresh) {
      const cached = await loadCache(CACHE_KEY)
      if (token !== syncTokenRef.current) return
      if (cached) {
        setExpenses(cached.expenses || [])
        setLastMonthExpenses(cached.lastMonthExpenses || [])
        setAllExpenses(cached.allExpenses || [])
        setMonthlyIncome(cached.monthlyIncome || 0)
        setLast6MonthsIncome(cached.last6MonthsIncome || [])
        setLoading(false)
        setMonthLoading(false)
        setTimeout(() => loadFromSQLite(), 100)
        return
      }
    }
    await loadFromSQLite()
  }, [monthOffset, loadFromSQLite])

  useFocusEffect(useCallback(() => {
    fetchData()
  }, [fetchData]))

  const now = getNow()
  const { month: currentMonth, name: monthName, totalDays: daysInSelectedMonth } = getMonthInfo(monthOffset)
  const isCurrentMonth = monthOffset === 0

  const total = useMemo(() =>
    roundMoney(expenses.reduce((sum, e) => sum + parseFloat(e.amount), 0)),
  [expenses])

  const lastTotal = useMemo(() =>
    roundMoney(lastMonthExpenses.reduce((sum, e) => sum + parseFloat(e.amount), 0)),
  [lastMonthExpenses])

  const daysElapsed = isCurrentMonth ? now.getDate() : daysInSelectedMonth
  const dailyAvg = total / Math.max(daysElapsed, 1)
  const forecast = dailyAvg * daysInSelectedMonth

  const categoryTotals = useMemo(() => CATEGORIES.map(cat => {
    const catExpenses = expenses.filter(e => e.category === cat.label)
    const catTotal = roundMoney(catExpenses.reduce((sum, e) => sum + parseFloat(e.amount), 0))
    return { ...cat, total: catTotal, percentage: total > 0 ? (catTotal / total) * 100 : 0, expenses: catExpenses }
  }).filter(c => c.total > 0).sort((a, b) => b.total - a.total), [expenses, total])

  const dailyMap = useMemo(() => {
    const map = {}
    allExpenses.forEach(e => { map[e.date] = (map[e.date] || 0) + parseFloat(e.amount) })
    return map
  }, [allExpenses])

  // Anchor on the last day of the viewed month (or today, if viewing the current month)
  // so paging to a past month shows that month's trailing 7 days instead of today's.
  const anchorDate = useMemo(() => {
    if (isCurrentMonth) return getNow()
    return new Date(currentMonth + `-${String(daysInSelectedMonth).padStart(2, '0')}` + 'T00:00:00')
  }, [isCurrentMonth, currentMonth, daysInSelectedMonth])

  const last7 = useMemo(() => {
    const result = []
    for (let i = 6; i >= 0; i--) {
      const d = new Date(anchorDate)
      d.setDate(d.getDate() - i)
      const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      result.push({ date: dateStr, label: d.toLocaleString('default', { weekday: 'short' }), amount: dailyMap[dateStr] || 0 })
    }
    return result
  }, [dailyMap, anchorDate])

  const max7 = useMemo(() => Math.max(...last7.map(d => d.amount), 1), [last7])

  const last6Months = useMemo(() => {
    const result = []
    const selectedDate = new Date(currentMonth + '-01')
    for (let i = 5; i >= 0; i--) {
      const d = new Date(selectedDate.getFullYear(), selectedDate.getMonth() - i, 1)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      const monthTotal = roundMoney(allExpenses.filter(e => e.date.startsWith(key)).reduce((sum, e) => sum + parseFloat(e.amount), 0))
      const incomeForMonth = last6MonthsIncome.find(m => m.key === key)?.amount || 0
      result.push({ key, label: d.toLocaleString('default', { month: 'short' }), amount: monthTotal, income: incomeForMonth })
    }
    return result
  }, [allExpenses, last6MonthsIncome, currentMonth])

  const max6 = useMemo(() => Math.max(...last6Months.map(m => Math.max(m.amount, m.income)), 1), [last6Months])

  const heatmapDays = useMemo(() => {
    const result = []
    for (let d = 1; d <= daysInSelectedMonth; d++) {
      const dateStr = `${currentMonth}-${String(d).padStart(2, '0')}`
      result.push({ day: d, amount: dailyMap[dateStr] || 0, dateStr })
    }
    return result
  }, [dailyMap, currentMonth, daysInSelectedMonth])

  const maxHeatmap = useMemo(() => Math.max(...heatmapDays.map(d => d.amount), 1), [heatmapDays])

  const { weekendTotal, weekdayTotal } = useMemo(() => {
    const weekendExp = expenses.filter(e => { const day = new Date(e.date + 'T00:00:00').getDay(); return day === 0 || day === 6 })
    const weekdayExp = expenses.filter(e => { const day = new Date(e.date + 'T00:00:00').getDay(); return day !== 0 && day !== 6 })
    return {
      weekendTotal: roundMoney(weekendExp.reduce((sum, e) => sum + parseFloat(e.amount), 0)),
      weekdayTotal: roundMoney(weekdayExp.reduce((sum, e) => sum + parseFloat(e.amount), 0)),
    }
  }, [expenses])

  const topNote = useMemo(() => {
    const noteCounts = {}
    expenses.forEach(e => {
      if (e.note && e.note.trim()) {
        const key = e.note.trim().toLowerCase()
        noteCounts[key] = (noteCounts[key] || 0) + 1
      }
    })
    const entries = Object.entries(noteCounts).sort((a, b) => b[1] - a[1])
    return entries[0] || null
  }, [expenses])

  const biggestDay = useMemo(() => {
    const dayTotals = {}
    expenses.forEach(e => { dayTotals[e.date] = (dayTotals[e.date] || 0) + parseFloat(e.amount) })
    return Object.entries(dayTotals).sort((a, b) => b[1] - a[1])[0] || null
  }, [expenses])

  const biggestExpense = useMemo(() =>
    expenses.length > 0 ? [...expenses].sort((a, b) => parseFloat(b.amount) - parseFloat(a.amount))[0] : null,
  [expenses])

  // Plain-language interpretation of the numbers already computed above.
  const reportInsights = useMemo(() => buildReportInsights({
    total, expenses, categoryTotals, last6Months,
    formatAmount, currencySymbol, currencyCode,
  }), [total, expenses, categoryTotals, last6Months, currencySymbol, currencyCode])

  const styles = useMemo(() => StyleSheet.create({
  outerContainer: { flex: 1, backgroundColor: COLORS.bg },
  stickyHeader: { paddingTop: insets.top + 8, paddingHorizontal: SCREEN.paddingHorizontal, paddingBottom: 8, backgroundColor: COLORS.bg },
  scrollView: { flex: 1, paddingHorizontal: SCREEN.paddingHorizontal },
  heading: { fontSize: 28, fontWeight: '800', color: COLORS.text, letterSpacing: -0.8, marginBottom: 4 },
  subheading: { fontSize: 14, color: COLORS.textMuted, marginBottom: 16 },
  totalCard: { borderRadius: 24, padding: 28, marginBottom: 16, alignItems: 'center' },
  totalLabel: { fontSize: 11, color: 'rgba(255,255,255,0.7)', marginBottom: 8, letterSpacing: 1.5, textTransform: 'uppercase' },
  totalAmount: { fontSize: 42, fontWeight: '900', color: '#fff', letterSpacing: -2, width: '100%', textAlign: 'center' },
  totalSub: { fontSize: 13, color: 'rgba(255,255,255,0.6)', marginTop: 6, letterSpacing: 0.3 },
  miniCard: { backgroundColor: COLORS.card, borderRadius: 14, padding: 14, marginRight: 10, minWidth: 130, borderWidth: 1, borderColor: COLORS.border },
  miniLabel: { fontSize: 9, fontWeight: '700', color: COLORS.textMuted, letterSpacing: 1, marginBottom: 8 },
  miniValue: { fontSize: 15, fontWeight: '800', color: COLORS.text, letterSpacing: -0.5 },
  forecastCard: { backgroundColor: COLORS.card, borderRadius: 16, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: COLORS.border },
  forecastHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  forecastTitle: { fontSize: 13, fontWeight: '700', color: COLORS.textMuted, letterSpacing: 0.5 },
  forecastAmount: { fontSize: 28, fontWeight: '800', color: COLORS.text, letterSpacing: -1, marginBottom: 6 },
  forecastSub: { fontSize: 12, color: COLORS.textMuted, marginBottom: 12, lineHeight: 18 },
  forecastBar: { height: 6, backgroundColor: COLORS.border, borderRadius: 3, marginBottom: 6 },
  forecastFill: { height: 6, borderRadius: 3 },
  forecastPct: { fontSize: 11, color: COLORS.textMuted },
  compareCard: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: COLORS.card, borderRadius: 16, padding: 16, marginBottom: 24, borderWidth: 1 },
  compareIconBox: { width: 44, height: 44, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  compareTitle: { fontSize: 11, color: COLORS.textMuted, marginBottom: 4, letterSpacing: 1 },
  compareText: { fontSize: 15, color: COLORS.text, lineHeight: 22 },
  compareSubtext: { fontSize: 12, color: COLORS.textMuted, marginTop: 4 },
  insightsCard: { backgroundColor: COLORS.card, borderRadius: 16, padding: 16, marginBottom: 24, borderWidth: 1, borderColor: COLORS.border },
  insightsTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 },
  insightsTitle: { fontSize: 11, fontWeight: '800', color: COLORS.textMuted, letterSpacing: 1.5, textTransform: 'uppercase' },
  insightRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 10 },
  insightText: { flex: 1, fontSize: 13, color: COLORS.text, lineHeight: 19 },
  section: { marginBottom: 28 },
  sectionTitle: { fontSize: 11, fontWeight: '800', color: COLORS.textMuted, marginBottom: 16, letterSpacing: 1.5, textTransform: 'uppercase' },
  barChart: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', height: 160, backgroundColor: COLORS.card, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: COLORS.border },
  barCol: { flex: 1, alignItems: 'center', height: '100%', justifyContent: 'flex-end' },
  barAmount: { fontSize: 9, color: COLORS.textMuted, marginBottom: 4, textAlign: 'center' },
  barBg: { width: 20, height: '75%', backgroundColor: COLORS.border, borderRadius: 6, overflow: 'hidden', justifyContent: 'flex-end' },
  barLabel: { fontSize: 11, color: COLORS.textMuted, marginTop: 6 },
  heatmapCard: { backgroundColor: COLORS.card, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: COLORS.border },
  heatmap: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  heatmapCell: { width: 32, height: 32, borderRadius: 6, justifyContent: 'center', alignItems: 'center' },
  heatmapDay: { fontSize: 10, color: COLORS.textMuted, fontWeight: '600' },
  heatmapLegend: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 12, justifyContent: 'flex-end' },
  heatmapLegendText: { fontSize: 10, color: COLORS.textMuted },
  heatmapLegendBox: { width: 12, height: 12, borderRadius: 3 },
  splitCard: { flexDirection: 'row', backgroundColor: COLORS.card, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: COLORS.border },
  splitItem: { flex: 1, alignItems: 'center', gap: 6 },
  splitIconBox: { width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  splitLabel: { fontSize: 12, color: COLORS.textMuted, fontWeight: '600' },
  splitAmount: { fontSize: 16, fontWeight: '800', color: COLORS.text, letterSpacing: -0.5, width: '100%', textAlign: 'center' },
  splitPct: { fontSize: 12, color: COLORS.textMuted },
  splitBarBg: { width: '100%', height: 4, backgroundColor: COLORS.border, borderRadius: 2 },
  splitBarFill: { height: 4, borderRadius: 2 },
  splitDivider: { width: 1, backgroundColor: COLORS.border, marginHorizontal: 8 },
  catRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  catIcon: { width: 44, height: 44, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  catInfo: { flex: 1 },
  catTopRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  catName: { fontSize: 14, color: COLORS.text, fontWeight: '500' },
  catRight: { alignItems: 'flex-end' },
  catAmount: { fontSize: 14, color: COLORS.text, fontWeight: '700' },
  catPercent: { fontSize: 11, color: COLORS.textMuted },
  progressBg: { height: 4, backgroundColor: COLORS.border, borderRadius: 2 },
  progressFill: { height: 4, borderRadius: 2 },
  expandedList: { backgroundColor: COLORS.cardAlt, borderRadius: 12, padding: 12, marginBottom: 12, marginLeft: 56, borderWidth: 1, borderColor: COLORS.border },
  expandedItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  expandedNote: { fontSize: 13, color: COLORS.text, fontWeight: '500' },
  expandedDate: { fontSize: 11, color: COLORS.textMuted, marginTop: 2 },
  expandedAmount: { fontSize: 13, fontWeight: '700', color: COLORS.accentGreen },
  merchantCard: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: COLORS.card, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: COLORS.border },
  merchantIconBox: { width: 44, height: 44, borderRadius: 12, backgroundColor: COLORS.accent + '22', justifyContent: 'center', alignItems: 'center' },
  merchantName: { fontSize: 16, fontWeight: '700', color: COLORS.text, textTransform: 'capitalize' },
  merchantSub: { fontSize: 12, color: COLORS.textMuted, marginTop: 2 },
  merchantCount: { fontSize: 20, fontWeight: '800', color: COLORS.accent },
  bigCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.card, borderRadius: 16, padding: 20, borderWidth: 1, borderColor: COLORS.border },
  bigIconBox: { width: 56, height: 56, borderRadius: 16, justifyContent: 'center', alignItems: 'center' },
  bigCategory: { fontSize: 16, fontWeight: '700', color: COLORS.text, letterSpacing: -0.3 },
  bigNote: { fontSize: 13, color: COLORS.textMuted, marginTop: 2 },
  bigDate: { fontSize: 11, color: COLORS.textMuted, marginTop: 2 },
  bigAmount: { fontSize: 20, fontWeight: '800', color: COLORS.accentGreen, letterSpacing: -0.5 },
  monthNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: COLORS.card, borderRadius: 12, padding: 8, marginBottom: 16, borderWidth: 1, borderColor: COLORS.border },
  monthNavBtn: { padding: 4 },
  monthNavBtnDisabled: { opacity: 0.3 },
  monthNavCenter: { alignItems: 'center' },
  monthNavText: { fontSize: 13, fontWeight: '700', color: COLORS.text, letterSpacing: -0.3 },
  monthNavBack: { fontSize: 11, color: COLORS.accent, marginTop: 2 },
  empty: { alignItems: 'center', marginTop: 80 },
  emptyText: { fontSize: 18, color: COLORS.textMuted, marginTop: 12, fontWeight: '600' },
  emptySub: { fontSize: 14, color: COLORS.textMuted, marginTop: 6 },
  incomeExpenseCard: { backgroundColor: COLORS.card, borderRadius: 16, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: COLORS.border },
  incomeExpenseTitle: { fontSize: 13, fontWeight: '700', color: COLORS.textMuted, marginBottom: 16, letterSpacing: 0.3 },
  incomeExpenseRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  incomeExpenseItem: { flex: 1, alignItems: 'center', gap: 6 },
  incomeExpenseIcon: { width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  incomeExpenseLabel: { fontSize: 11, color: COLORS.textMuted, fontWeight: '600', letterSpacing: 0.5, textTransform: 'uppercase' },
  incomeExpenseAmount: { fontSize: 13, fontWeight: '800', letterSpacing: -0.3, textAlign: 'center' },
  incomeExpenseDivider: { width: 1, height: 60, backgroundColor: COLORS.border, marginHorizontal: 4 },
  incomeExpenseBarBg: { height: 6, backgroundColor: COLORS.border, borderRadius: 3, marginBottom: 6 },
  incomeExpenseBarFill: { height: 6, borderRadius: 3 },
  incomeExpenseBarLabel: { fontSize: 11, color: COLORS.textMuted, textAlign: 'right' },
  }), [COLORS, insets.top])

  if (loading) return <ReportsSkeleton />

  return (
    <View style={styles.outerContainer}>
      <View style={styles.stickyHeader}>
        <Text style={styles.heading}>Reports</Text>
      </View>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={{ paddingBottom: 60 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchData(true) }} tintColor={COLORS.accent} />
        }
      >

      <View style={styles.monthNav}>
        <TouchableOpacity style={styles.monthNavBtn} onPress={() => setMonthOffset(o => o - 1)}>
          <Ionicons name="chevron-back" size={18} color={COLORS.text} />
        </TouchableOpacity>
        <View style={styles.monthNavCenter}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={styles.monthNavText}>{monthName}</Text>
            {monthLoading && <ActivityIndicator size="small" color={COLORS.accent} />}
          </View>
          {!isCurrentMonth && (
            <TouchableOpacity onPress={() => setMonthOffset(0)}>
              <Text style={styles.monthNavBack}>Back to today</Text>
            </TouchableOpacity>
          )}
        </View>
        <TouchableOpacity
          style={[styles.monthNavBtn, isCurrentMonth && styles.monthNavBtnDisabled]}
          onPress={() => { if (!isCurrentMonth) setMonthOffset(o => o + 1) }}
          disabled={isCurrentMonth}
        >
          <Ionicons name="chevron-forward" size={18} color={isCurrentMonth ? COLORS.border : COLORS.text} />
        </TouchableOpacity>
      </View>

      {expenses.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="pie-chart-outline" size={56} color={COLORS.border} />
          <Text style={styles.emptyText}>No data this month</Text>
          <Text style={styles.emptySub}>Add expenses to see reports</Text>
        </View>
      ) : (
        <>
          <LinearGradient colors={['#7C75FF', '#6C63FF', '#5A50FF']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.totalCard}>
            <Text style={styles.totalLabel}>Total Spent</Text>
            <Text style={styles.totalAmount} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
              {formatAmount(total, currencySymbol, currencyCode)}
            </Text>
            <Text style={styles.totalSub}>{expenses.length} transactions</Text>
          </LinearGradient>

          {(monthlyIncome > 0 || total > 0) && (
            <View style={styles.incomeExpenseCard}>
              <Text style={styles.incomeExpenseTitle}>Income vs Expenses — {monthName}</Text>
              <View style={styles.incomeExpenseRow}>
                <View style={styles.incomeExpenseItem}>
                  <View style={[styles.incomeExpenseIcon, { backgroundColor: '#4CAF5022' }]}>
                    <Ionicons name="arrow-down-circle-outline" size={20} color="#4CAF50" />
                  </View>
                  <Text style={styles.incomeExpenseLabel}>Income</Text>
                  <Text style={[styles.incomeExpenseAmount, { color: '#4CAF50' }]}>
                    {formatAmount(monthlyIncome, currencySymbol, currencyCode)}
                  </Text>
                </View>
                <View style={styles.incomeExpenseDivider} />
                <View style={styles.incomeExpenseItem}>
                  <View style={[styles.incomeExpenseIcon, { backgroundColor: COLORS.accentRed + '22' }]}>
                    <Ionicons name="arrow-up-circle-outline" size={20} color={COLORS.accentRed} />
                  </View>
                  <Text style={styles.incomeExpenseLabel}>Expenses</Text>
                  <Text style={[styles.incomeExpenseAmount, { color: COLORS.accentRed }]}>
                    {formatAmount(total, currencySymbol, currencyCode)}
                  </Text>
                </View>
                <View style={styles.incomeExpenseDivider} />
                <View style={styles.incomeExpenseItem}>
                  <View style={[styles.incomeExpenseIcon, { backgroundColor: monthlyIncome >= total ? '#4CAF5022' : COLORS.accentRed + '22' }]}>
                    <Ionicons
                      name={monthlyIncome >= total ? 'trending-up-outline' : 'trending-down-outline'}
                      size={20}
                      color={monthlyIncome >= total ? '#4CAF50' : COLORS.accentRed}
                    />
                  </View>
                  <Text style={styles.incomeExpenseLabel}>Net</Text>
                  <Text style={[styles.incomeExpenseAmount, { color: monthlyIncome >= total ? '#4CAF50' : COLORS.accentRed }]}>
                    {monthlyIncome >= total ? '+' : '-'}{formatAmount(Math.abs(monthlyIncome - total), currencySymbol, currencyCode)}
                  </Text>
                </View>
              </View>
              {monthlyIncome > 0 && (
                <>
                  <View style={styles.incomeExpenseBarBg}>
                    <View style={[styles.incomeExpenseBarFill, {
                      width: `${Math.min((total / Math.max(monthlyIncome, 1)) * 100, 100)}%`,
                      backgroundColor: total > monthlyIncome ? COLORS.accentRed : '#4CAF50'
                    }]} />
                  </View>
                  <Text style={styles.incomeExpenseBarLabel}>
                    {((total / Math.max(monthlyIncome, 1)) * 100).toFixed(0)}% of income spent
                  </Text>
                </>
              )}
            </View>
          )}

          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
            <View style={styles.miniCard}>
              <Text style={styles.miniLabel}>DAILY AVG</Text>
              <Text style={styles.miniValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
                {formatAmount(dailyAvg, currencySymbol, currencyCode)}
              </Text>
            </View>
            <View style={styles.miniCard}>
              <Text style={styles.miniLabel}>FORECAST</Text>
              <Text style={[styles.miniValue, { color: forecast > lastTotal && lastTotal > 0 ? COLORS.accentRed : COLORS.accentGreen }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
                {formatAmount(forecast, currencySymbol, currencyCode)}
              </Text>
            </View>
            <View style={styles.miniCard}>
              <Text style={styles.miniLabel}>BIGGEST DAY</Text>
              <Text style={styles.miniValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
                {biggestDay ? formatAmount(parseFloat(biggestDay[1]), currencySymbol, currencyCode) : 'N/A'}
              </Text>
            </View>
            <View style={[styles.miniCard, { marginRight: 0 }]}>
              <Text style={styles.miniLabel}>TOP CATEGORY</Text>
              <Text style={styles.miniValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
                {categoryTotals[0] ? categoryTotals[0].label : 'N/A'}
              </Text>
            </View>
          </ScrollView>

          <View style={styles.forecastCard}>
            <View style={styles.forecastHeader}>
              <Ionicons name="trending-up-outline" size={20} color={COLORS.accent} />
              <Text style={styles.forecastTitle}>Spending Forecast</Text>
            </View>
            <Text style={styles.forecastAmount} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
              {formatAmount(forecast, currencySymbol, currencyCode)}
            </Text>
            <Text style={styles.forecastSub}>
              At {formatAmount(dailyAvg, currencySymbol, currencyCode)}/day, you&apos;ll spend this much by end of {now.toLocaleString('default', { month: 'long' })}
            </Text>
            <View style={styles.forecastBar}>
              <View style={[styles.forecastFill, { width: `${Math.min((total / Math.max(forecast, 1)) * 100, 100)}%`, backgroundColor: total > forecast * 0.8 ? COLORS.accentRed : COLORS.accent }]} />
            </View>
            <Text style={styles.forecastPct}>{((total / Math.max(forecast, 1)) * 100).toFixed(0)}% of forecast used</Text>
          </View>

          {lastTotal > 0 && (() => {
            const diff = total - lastTotal
            const pct = ((Math.abs(diff) / lastTotal) * 100).toFixed(0)
            const isMore = diff > 0
            return (
              <View style={[styles.compareCard, { borderColor: isMore ? COLORS.accentRed + '44' : COLORS.accentGreen + '44' }]}>
                <View style={[styles.compareIconBox, { backgroundColor: isMore ? COLORS.accentRed + '22' : COLORS.accentGreen + '22' }]}>
                  <Ionicons
                    name={isMore ? 'trending-up-outline' : 'trending-down-outline'}
                    size={22}
                    color={isMore ? COLORS.accentRed : COLORS.accentGreen}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.compareTitle}>VS LAST MONTH</Text>
                  <Text style={styles.compareText}>
                    You spent{' '}
                    <Text style={{ color: isMore ? COLORS.accentRed : COLORS.accentGreen, fontWeight: '700' }}>
                      {isMore ? `${formatAmount(diff, currencySymbol, currencyCode)} more` : `${formatAmount(Math.abs(diff), currencySymbol, currencyCode)} less`}
                    </Text>
                    {' '}({pct}% {isMore ? 'increase' : 'decrease'})
                  </Text>
                  <Text style={styles.compareSubtext}>Last month: {formatAmount(lastTotal, currencySymbol, currencyCode)} · This month: {formatAmount(total, currencySymbol, currencyCode)}</Text>
                </View>
              </View>
            )
          })()}

          {reportInsights.length > 0 && (
            <View style={styles.insightsCard}>
              <View style={styles.insightsTitleRow}>
                <Ionicons name="bulb-outline" size={16} color={COLORS.accentYellow} />
                <Text style={styles.insightsTitle}>What the numbers say</Text>
              </View>
              {reportInsights.map((ins) => (
                <View key={ins.key} style={styles.insightRow}>
                  <Ionicons name={ins.icon} size={15} color={COLORS.accent} style={{ marginTop: 1 }} />
                  <Text style={styles.insightText}>{ins.text}</Text>
                </View>
              ))}
            </View>
          )}

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>6 Month Trend</Text>
            <View style={styles.barChart}>
              {last6Months.map((m, i) => (
                <View key={i} style={styles.barCol}>
                  <Text style={styles.barAmount}>{m.amount > 0 ? `${m.amount >= 1000 ? (m.amount / 1000).toFixed(1) + 'k' : m.amount.toFixed(0)}` : ''}</Text>
                  <View style={{ flexDirection: 'row', gap: 2, height: '75%', alignItems: 'flex-end' }}>
                    {m.income > 0 && (
                      <View style={[styles.barBg, { width: 10 }]}>
                        <AnimatedBar percentage={(m.income / max6) * 100} color="#4CAF50" delay={i * 100} />
                      </View>
                    )}
                    <View style={[styles.barBg, { width: m.income > 0 ? 10 : 20 }]}>
                      <AnimatedBar percentage={(m.amount / max6) * 100} color={m.key === currentMonth ? COLORS.accent : COLORS.accent + '55'} delay={i * 100} />
                    </View>
                  </View>
                  <Text style={[styles.barLabel, m.key === currentMonth && { color: COLORS.accent, fontWeight: '700' }]}>{m.label}</Text>
                </View>
              ))}
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Last 7 Days</Text>
            <View style={styles.barChart}>
              {last7.map((d, i) => (
                <View key={i} style={styles.barCol}>
                  <Text style={styles.barAmount}>{d.amount > 0 ? `${d.amount >= 1000 ? (d.amount / 1000).toFixed(1) + 'k' : d.amount.toFixed(0)}` : ''}</Text>
                  <View style={styles.barBg}>
                    <AnimatedBar percentage={(d.amount / max7) * 100} color={d.amount > 0 ? COLORS.accentGreen : COLORS.border} delay={i * 80} />
                  </View>
                  <Text style={styles.barLabel}>{d.label}</Text>
                </View>
              ))}
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Spending Heatmap</Text>
            <View style={styles.heatmapCard}>
              <View style={styles.heatmap}>
                {heatmapDays.map((d, i) => {
                  const intensity = d.amount > 0 ? Math.max(0.15, d.amount / maxHeatmap) : 0
                  const isToday = isCurrentMonth && d.day === now.getDate()
                  return (
                    <View key={i} style={[styles.heatmapCell, { backgroundColor: d.amount > 0 ? `rgba(108, 99, 255, ${intensity})` : COLORS.cardAlt }, isToday && { borderWidth: 1, borderColor: COLORS.accent }]}>
                      <Text style={[styles.heatmapDay, d.amount > 0 && intensity > 0.5 && { color: '#fff' }]}>{d.day}</Text>
                    </View>
                  )
                })}
              </View>
              <View style={styles.heatmapLegend}>
                <Text style={styles.heatmapLegendText}>Less</Text>
                {[0.1, 0.3, 0.5, 0.7, 1].map((o, i) => (
                  <View key={i} style={[styles.heatmapLegendBox, { backgroundColor: `rgba(108, 99, 255, ${o})` }]} />
                ))}
                <Text style={styles.heatmapLegendText}>More</Text>
              </View>
            </View>
          </View>

          {(weekendTotal > 0 || weekdayTotal > 0) && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Weekend vs Weekday</Text>
              <View style={styles.splitCard}>
                <View style={styles.splitItem}>
                  <View style={[styles.splitIconBox, { backgroundColor: COLORS.accent + '22' }]}>
                    <Ionicons name="briefcase-outline" size={20} color={COLORS.accent} />
                  </View>
                  <Text style={styles.splitLabel}>Weekdays</Text>
                  <Text style={styles.splitAmount} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>{formatAmount(weekdayTotal, currencySymbol, currencyCode)}</Text>
                  <Text style={styles.splitPct}>{total > 0 ? ((weekdayTotal / total) * 100).toFixed(0) : 0}%</Text>
                  <View style={styles.splitBarBg}>
                    <View style={[styles.splitBarFill, { width: `${total > 0 ? (weekdayTotal / total) * 100 : 0}%`, backgroundColor: COLORS.accent }]} />
                  </View>
                </View>
                <View style={styles.splitDivider} />
                <View style={styles.splitItem}>
                  <View style={[styles.splitIconBox, { backgroundColor: COLORS.accentYellow + '22' }]}>
                    <Ionicons name="sunny-outline" size={20} color={COLORS.accentYellow} />
                  </View>
                  <Text style={styles.splitLabel}>Weekends</Text>
                  <Text style={styles.splitAmount} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>{formatAmount(weekendTotal, currencySymbol, currencyCode)}</Text>
                  <Text style={styles.splitPct}>{total > 0 ? ((weekendTotal / total) * 100).toFixed(0) : 0}%</Text>
                  <View style={styles.splitBarBg}>
                    <View style={[styles.splitBarFill, { width: `${total > 0 ? (weekendTotal / total) * 100 : 0}%`, backgroundColor: COLORS.accentYellow }]} />
                  </View>
                </View>
              </View>
            </View>
          )}

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Category Breakdown</Text>
            {categoryTotals.map(cat => (
              <View key={cat.label}>
                <TouchableOpacity style={styles.catRow} onPress={() => setExpandedCategory(expandedCategory === cat.label ? null : cat.label)} activeOpacity={0.7}>
                  <View style={[styles.catIcon, { backgroundColor: cat.color + '22' }]}>
                    <Ionicons name={cat.icon} size={18} color={cat.color} />
                  </View>
                  <View style={styles.catInfo}>
                    <View style={styles.catTopRow}>
                      <Text style={styles.catName}>{cat.label}</Text>
                      <View style={styles.catRight}>
                        <Text style={styles.catAmount}>{formatAmount(cat.total, currencySymbol, currencyCode)}</Text>
                        <Text style={styles.catPercent}>{cat.percentage.toFixed(1)}%</Text>
                      </View>
                    </View>
                    <View style={styles.progressBg}>
                      <View style={[styles.progressFill, { width: `${cat.percentage}%`, backgroundColor: cat.color }]} />
                    </View>
                  </View>
                  <Ionicons name={expandedCategory === cat.label ? 'chevron-up' : 'chevron-down'} size={16} color={COLORS.textMuted} style={{ marginLeft: 8 }} />
                </TouchableOpacity>

                {expandedCategory === cat.label && (
                  <View style={styles.expandedList}>
                    {[...cat.expenses].sort((a, b) => parseFloat(b.amount) - parseFloat(a.amount)).map(exp => (
                      <View key={exp.id} style={styles.expandedItem}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.expandedNote}>{exp.note || exp.category}</Text>
                          <Text style={styles.expandedDate}>{exp.date}</Text>
                        </View>
                        <Text style={styles.expandedAmount}>{formatAmount(exp.amount, currencySymbol, currencyCode)}</Text>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            ))}
          </View>

          {topNote && topNote[1] > 1 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Top Merchant</Text>
              <View style={styles.merchantCard}>
                <View style={styles.merchantIconBox}>
                  <Ionicons name="storefront-outline" size={22} color={COLORS.accent} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.merchantName}>{topNote[0].charAt(0).toUpperCase() + topNote[0].slice(1)}</Text>
                  <Text style={styles.merchantSub}>Appears {topNote[1]} times this month</Text>
                </View>
                <Text style={styles.merchantCount}>{topNote[1]}x</Text>
              </View>
            </View>
          )}

          {biggestExpense && (() => {
            const cat = CATEGORIES.find(c => c.label === biggestExpense.category) || { icon: 'grid-outline', color: '#888' }
            return (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Biggest Expense</Text>
                <View style={styles.bigCard}>
                  <View style={[styles.bigIconBox, { backgroundColor: cat.color + '22' }]}>
                    <Ionicons name={cat.icon} size={26} color={cat.color} />
                  </View>
                  <View style={{ marginLeft: 16, flex: 1 }}>
                    <Text style={styles.bigCategory}>{biggestExpense.category}</Text>
                    <Text style={styles.bigNote}>{biggestExpense.note || biggestExpense.date}</Text>
                    <Text style={styles.bigDate}>{biggestExpense.date}</Text>
                  </View>
                  <Text style={styles.bigAmount} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
                    {formatAmount(biggestExpense.amount, currencySymbol, currencyCode)}
                  </Text>
                </View>
              </View>
            )
          })()}
        </>
      )}
    </ScrollView>
    </View>
  )
}