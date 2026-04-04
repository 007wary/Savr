import { useState, useCallback, useRef, useEffect } from 'react'
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl } from 'react-native'
import { useFocusEffect, useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../../src/lib/supabase'
import { COLORS, CATEGORIES } from '../../src/constants/theme'
import { DashboardSkeleton } from '../../src/components/SkeletonLoader'
import { getCurrencySymbol } from '../../src/lib/currency'

function CountUp({ value, style, symbol }) {
  const [display, setDisplay] = useState(0)
  const prev = useRef(0)

  useEffect(() => {
    const start = prev.current
    const end = value
    const duration = 1000
    const steps = 40
    const increment = (end - start) / steps
    let current = start
    let step = 0

    const timer = setInterval(() => {
      step++
      current += increment
      if (step >= steps) {
        current = end
        clearInterval(timer)
      }
      setDisplay(current)
    }, duration / steps)

    prev.current = end
    return () => clearInterval(timer)
  }, [value])

  return <Text style={style}>{symbol}{display.toFixed(2)}</Text>
}

export default function Dashboard() {
  const [expenses, setExpenses] = useState([])
  const [userName, setUserName] = useState('')
  const [refreshing, setRefreshing] = useState(false)
  const [loading, setLoading] = useState(true)
  const [monthOffset, setMonthOffset] = useState(0)
  const [lastMonthTotal, setLastMonthTotal] = useState(0)
  const [daysInMonth, setDaysInMonth] = useState(1)
  const [currencySymbol, setCurrencySymbol] = useState('₹')
  const router = useRouter()

  function getMonthInfo(offset) {
    const d = new Date()
    d.setDate(1)
    d.setMonth(d.getMonth() + offset)
    const month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const name = d.toLocaleString('default', { month: 'long', year: 'numeric' })
    return { month, name }
  }

  const { month: currentMonth, name: monthName } = getMonthInfo(monthOffset)
  const isCurrentMonth = monthOffset === 0

  async function fetchData() {
    const { data: { user } } = await supabase.auth.getUser()
    const meta = user.user_metadata?.display_name
const emailName = user.email.split('@')[0]
const firstName = meta ? meta.split(' ')[0] : emailName
setUserName(firstName)

    const symbol = await getCurrencySymbol()
    setCurrencySymbol(symbol)

    const { data } = await supabase
      .from('expenses')
      .select('*')
      .eq('user_id', user.id)
      .order('date', { ascending: false })

    if (data) {
      const filtered = data.filter(e => e.date.startsWith(currentMonth))
      setExpenses(filtered)

      const lastMonth = getMonthInfo(monthOffset - 1).month
      const lastFiltered = data.filter(e => e.date.startsWith(lastMonth))
      const lastTotal = lastFiltered.reduce((sum, e) => sum + parseFloat(e.amount), 0)
      setLastMonthTotal(lastTotal)

      const now = new Date()
      const daysElapsed = monthOffset === 0 ? now.getDate() : new Date(currentMonth + '-01').getDate()
      setDaysInMonth(daysElapsed)
    }
    setLoading(false)
    setRefreshing(false)
  }

  useFocusEffect(useCallback(() => { fetchData() }, [currentMonth]))

  const total = expenses.reduce((sum, e) => sum + parseFloat(e.amount), 0)

  const byCategory = CATEGORIES.map(cat => {
    const catExpenses = expenses.filter(e => e.category === cat.label)
    const catTotal = catExpenses.reduce((sum, e) => sum + parseFloat(e.amount), 0)
    return { ...cat, total: catTotal }
  }).filter(c => c.total > 0).sort((a, b) => b.total - a.total)

  const recent = expenses.slice(0, 5)

  function getCategoryInfo(label) {
    return CATEGORIES.find(c => c.label === label) || { icon: '📦', color: '#888' }
  }
  function formatDate(dateStr) {
  const today = new Date()
  const date = new Date(dateStr)
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)
  const yesterdayStr = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`

  if (dateStr === todayStr) return 'Today'
  if (dateStr === yesterdayStr) return 'Yesterday'
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}

  if (loading) return <DashboardSkeleton />

  function getGreeting() {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  if (hour < 21) return 'Good evening'
  return 'Good night'
}
  return (
    <View style={{ flex: 1 }}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={{ paddingBottom: 100 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchData() }} tintColor={COLORS.accent} />
        }
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.greeting}>{getGreeting()}, {userName} 👋</Text>
        </View>

        {/* Month Navigator */}
        <View style={styles.monthNav}>
          <TouchableOpacity
            style={styles.monthNavBtn}
            onPress={() => { setLoading(true); setMonthOffset(o => o - 1) }}
          >
            <Ionicons name="chevron-back" size={20} color={COLORS.text} />
          </TouchableOpacity>
          <View style={styles.monthNavCenter}>
            <Text style={styles.monthNavText}>{monthName}</Text>
            {!isCurrentMonth && (
              <TouchableOpacity onPress={() => { setLoading(true); setMonthOffset(0) }}>
                <Text style={styles.monthNavBack}>Back to today</Text>
              </TouchableOpacity>
            )}
          </View>
          <TouchableOpacity
            style={[styles.monthNavBtn, isCurrentMonth && styles.monthNavBtnDisabled]}
            onPress={() => { if (!isCurrentMonth) { setLoading(true); setMonthOffset(o => o + 1) } }}
            disabled={isCurrentMonth}
          >
            <Ionicons name="chevron-forward" size={20} color={isCurrentMonth ? COLORS.border : COLORS.text} />
          </TouchableOpacity>
        </View>

        {/* Total Card */}
        <View style={styles.totalCard}>
          <Text style={styles.totalLabel}>Total Spent</Text>
          <CountUp value={total} style={styles.totalAmount} symbol={currencySymbol} />
          <Text style={styles.totalSub}>{expenses.length} transactions</Text>
        </View>

        {/* Stats Row */}
        {expenses.length > 0 && (
          <View style={styles.statsRow}>
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>Daily Avg</Text>
              <Text style={styles.statValue}>{currencySymbol}{(total / Math.max(daysInMonth, 1)).toFixed(0)}</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>vs Last Month</Text>
              <Text style={[
                styles.statValue,
                { color: total > lastMonthTotal ? COLORS.accentRed : COLORS.accentGreen }
              ]}>
                {lastMonthTotal === 0 ? 'N/A' :
                  `${total > lastMonthTotal ? '▲' : '▼'} ${currencySymbol}${Math.abs(total - lastMonthTotal).toFixed(0)}`
                }
              </Text>
            </View>
          </View>
        )}

        {/* Spending Insights */}
        {expenses.length >= 3 && (() => {
          const insights = []
          const topCat = byCategory[0]
          if (topCat) {
            const pct = ((topCat.total / total) * 100).toFixed(0)
            insights.push(`🏆 ${topCat.icon} ${topCat.label} is your biggest spend at ${pct}% of total`)
          }
          if (total > lastMonthTotal && lastMonthTotal > 0) {
            const diff = ((total - lastMonthTotal) / lastMonthTotal * 100).toFixed(0)
            insights.push(`📈 You're spending ${diff}% more than last month`)
          }
          if (total < lastMonthTotal && lastMonthTotal > 0) {
            const diff = ((lastMonthTotal - total) / lastMonthTotal * 100).toFixed(0)
            insights.push(`📉 Great job! You're spending ${diff}% less than last month`)
          }
          const dailyAvg = total / Math.max(daysInMonth, 1)
          if (dailyAvg > 500) insights.push(`💡 You're averaging ${currencySymbol}${dailyAvg.toFixed(0)}/day this month`)
          if (byCategory.length >= 3) insights.push(`📊 You've spent across ${byCategory.length} categories this month`)
          if (insights.length === 0) return null
          return (
            <View style={styles.insightsCard}>
              <Text style={styles.insightsTitle}>💡 Insights</Text>
              {insights.map((insight, i) => (
                <Text key={i} style={styles.insightText}>{insight}</Text>
              ))}
            </View>
          )
        })()}

        {/* Category Breakdown */}
        {byCategory.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>By Category</Text>
            {byCategory.map(cat => (
              <View key={cat.label} style={styles.categoryRow}>
                <View style={[styles.catIconBox, { backgroundColor: cat.color + '22' }]}>
                  <Text style={{ fontSize: 18 }}>{cat.icon}</Text>
                </View>
                <View style={styles.catInfo}>
                  <View style={styles.catTopRow}>
                    <Text style={styles.catLabel}>{cat.label}</Text>
                    <Text style={styles.catAmount}>{currencySymbol}{cat.total.toFixed(2)}</Text>
                  </View>
                  <View style={styles.progressBg}>
                    <View style={[
                      styles.progressFill,
                      { width: `${Math.min((cat.total / total) * 100, 100)}%`, backgroundColor: cat.color }
                    ]} />
                  </View>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Recent Transactions */}
        {recent.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Recent Transactions</Text>
            {recent.map(item => {
              const cat = getCategoryInfo(item.category)
              return (
                <View key={item.id} style={styles.txRow}>
                  <View style={[styles.txIcon, { backgroundColor: cat.color + '22' }]}>
                    <Text style={{ fontSize: 18 }}>{cat.icon}</Text>
                  </View>
                  <View style={styles.txInfo}>
                    <Text style={styles.txCategory}>{item.category}</Text>
                    <Text style={styles.txNote}>{item.note || formatDate(item.date)}</Text>
                  </View>
                  <Text style={styles.txAmount}>{currencySymbol}{parseFloat(item.amount).toFixed(2)}</Text>
                </View>
              )
            })}
          </View>
        )}

        {/* Empty state */}
        {expenses.length === 0 && (
          <View style={styles.empty}>
            <Ionicons name="stats-chart-outline" size={56} color={COLORS.border} />
            <Text style={styles.emptyText}>No expenses in {monthName}</Text>
            <Text style={styles.emptySub}>{isCurrentMonth ? 'Tap + to start tracking' : 'Nothing recorded this month'}</Text>
          </View>
        )}
      </ScrollView>

      {isCurrentMonth && (
        <TouchableOpacity
          style={styles.fab}
          onPress={() => router.push('/(tabs)/add')}
          activeOpacity={0.85}
        >
          <Ionicons name="add" size={28} color="#fff" />
        </TouchableOpacity>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg, paddingTop: 60, paddingHorizontal: 20 },
  header: { marginBottom: 16 },
  greeting: { fontSize: 24, fontWeight: '800', color: COLORS.text, letterSpacing: -0.5 },
  monthNav: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: COLORS.card, borderRadius: 14, padding: 12,
    marginBottom: 20, borderWidth: 1, borderColor: COLORS.border,
  },
  monthNavBtn: { padding: 4 },
  monthNavBtnDisabled: { opacity: 0.3 },
  monthNavCenter: { alignItems: 'center' },
  monthNavText: { fontSize: 15, fontWeight: '700', color: COLORS.text },
  monthNavBack: { fontSize: 12, color: COLORS.accent, marginTop: 4 },
  totalCard: {
    backgroundColor: COLORS.accent, borderRadius: 20,
    padding: 24, marginBottom: 16, alignItems: 'center',
  },
  totalLabel: { fontSize: 13, color: 'rgba(255,255,255,0.7)', marginBottom: 8 },
  totalAmount: { fontSize: 44, fontWeight: '900', color: '#fff', letterSpacing: -2 },
  totalSub: { fontSize: 13, color: 'rgba(255,255,255,0.6)', marginTop: 6 },
  statsRow: {
    flexDirection: 'row', backgroundColor: COLORS.card,
    borderRadius: 16, padding: 16, marginBottom: 16,
    borderWidth: 1, borderColor: COLORS.border,
  },
  statCard: { flex: 1, alignItems: 'center' },
  statLabel: { fontSize: 12, color: COLORS.textMuted, marginBottom: 6 },
  statValue: { fontSize: 18, fontWeight: '800', color: COLORS.text },
  statDivider: { width: 1, backgroundColor: COLORS.border, marginHorizontal: 8 },
  insightsCard: {
    backgroundColor: COLORS.card, borderRadius: 16, padding: 16,
    marginBottom: 16, borderWidth: 1, borderColor: COLORS.border,
  },
  insightsTitle: { fontSize: 15, fontWeight: '700', color: COLORS.text, marginBottom: 12 },
  insightText: { fontSize: 13, color: COLORS.textMuted, marginBottom: 8, lineHeight: 20 },
  section: { marginBottom: 24 },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: COLORS.textMuted, marginBottom: 14, letterSpacing: 1, textTransform: 'uppercase' },
  categoryRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
  catIconBox: { width: 42, height: 42, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  catInfo: { flex: 1 },
  catTopRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  catLabel: { fontSize: 14, color: COLORS.text, fontWeight: '500' },
  catAmount: { fontSize: 14, color: COLORS.text, fontWeight: '700' },
  progressBg: { height: 4, backgroundColor: COLORS.border, borderRadius: 2 },
  progressFill: { height: 4, borderRadius: 2 },
  txRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.card, borderRadius: 14, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: COLORS.border },
  txIcon: { width: 42, height: 42, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  txInfo: { flex: 1 },
  txCategory: { fontSize: 14, fontWeight: '600', color: COLORS.text },
  txNote: { fontSize: 12, color: COLORS.textMuted, marginTop: 2 },
  txAmount: { fontSize: 15, fontWeight: '700', color: COLORS.accentGreen },
  empty: { alignItems: 'center', marginTop: 60 },
  emptyText: { fontSize: 18, color: COLORS.textMuted, marginTop: 12, fontWeight: '600' },
  emptySub: { fontSize: 14, color: COLORS.textMuted, marginTop: 6 },
  fab: {
    position: 'absolute', bottom: 24, right: 24,
    width: 58, height: 58, borderRadius: 29,
    backgroundColor: COLORS.accent, justifyContent: 'center', alignItems: 'center',
    shadowColor: COLORS.accent, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4, shadowRadius: 8, elevation: 8,
  },
})