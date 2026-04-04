import { useState, useCallback } from 'react'
import {
  View, Text, StyleSheet, ScrollView,
  RefreshControl, Dimensions
} from 'react-native'
import { useFocusEffect } from 'expo-router'
import { supabase } from '../../src/lib/supabase'
import { COLORS, CATEGORIES } from '../../src/constants/theme'
import { getCurrencySymbol } from '../../src/lib/currency'
import { Ionicons } from '@expo/vector-icons'

const SCREEN_WIDTH = Dimensions.get('window').width - 40

export default function Reports() {
  const [expenses, setExpenses] = useState([])
  const [lastMonthExpenses, setLastMonthExpenses] = useState([])
  const [refreshing, setRefreshing] = useState(false)
  const [currencySymbol, setCurrencySymbol] = useState('₹')

  const now = new Date()
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const monthName = now.toLocaleString('default', { month: 'long', year: 'numeric' })

  async function fetchData() {
    const { data: { user } } = await supabase.auth.getUser()
    const symbol = await getCurrencySymbol()
    setCurrencySymbol(symbol)

    const { data } = await supabase
      .from('expenses')
      .select('*')
      .eq('user_id', user.id)
      .order('date', { ascending: true })

    if (data) {
      const filtered = data.filter(e => e.date.startsWith(currentMonth))
      setExpenses(filtered)

      const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      const lastMonthKey = `${lastMonthDate.getFullYear()}-${String(lastMonthDate.getMonth() + 1).padStart(2, '0')}`
      const lastFiltered = data.filter(e => e.date.startsWith(lastMonthKey))
      setLastMonthExpenses(lastFiltered)
    }
    setRefreshing(false)
  }

  useFocusEffect(useCallback(() => { fetchData() }, []))

  const total = expenses.reduce((sum, e) => sum + parseFloat(e.amount), 0)

  const categoryTotals = CATEGORIES.map(cat => {
    const catTotal = expenses
      .filter(e => e.category === cat.label)
      .reduce((sum, e) => sum + parseFloat(e.amount), 0)
    return { ...cat, total: catTotal, percentage: total > 0 ? (catTotal / total) * 100 : 0 }
  }).filter(c => c.total > 0).sort((a, b) => b.total - a.total)

  const dailyMap = {}
  expenses.forEach(e => {
    const day = parseInt(e.date.split('-')[2])
    dailyMap[day] = (dailyMap[day] || 0) + parseFloat(e.amount)
  })

  const last7 = []
  for (let i = 6; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    const dayNum = d.getDate()
    const label = d.toLocaleString('default', { weekday: 'short' })
    const amount = dailyMap[dayNum] || 0
    last7.push({ day: dayNum, label, amount })
  }
  const max7 = Math.max(...last7.map(d => d.amount), 1)

  const lastTotal = lastMonthExpenses.reduce((sum, e) => sum + parseFloat(e.amount), 0)
  const daysElapsed = now.getDate()
  const dailyAvg = total / Math.max(daysElapsed, 1)

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingBottom: 60 }}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchData() }} tintColor={COLORS.accent} />
      }
    >
      <Text style={styles.heading}>Reports</Text>
      <Text style={styles.subheading}>{monthName}</Text>

      {expenses.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="pie-chart-outline" size={56} color={COLORS.border} />
          <Text style={styles.emptyText}>No data this month</Text>
          <Text style={styles.emptySub}>Add expenses to see reports</Text>
        </View>
      ) : (
        <>
          {/* Total card */}
          <View style={styles.totalCard}>
            <Text style={styles.totalLabel}>Total Spent</Text>
            <Text style={styles.totalAmount}>{currencySymbol}{total.toFixed(2)}</Text>
            <Text style={styles.totalSub}>{expenses.length} transactions</Text>
          </View>

          {/* Month comparison card */}
          {lastTotal > 0 && (() => {
            const diff = total - lastTotal
            const pct = ((Math.abs(diff) / lastTotal) * 100).toFixed(0)
            const isMore = diff > 0
            return (
              <View style={[styles.compareCard, { borderColor: isMore ? COLORS.accentRed + '44' : COLORS.accentGreen + '44' }]}>
                <Text style={styles.compareIcon}>{isMore ? '📈' : '📉'}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.compareTitle}>vs Last Month</Text>
                  <Text style={styles.compareText}>
                    You spent{' '}
                    <Text style={{ color: isMore ? COLORS.accentRed : COLORS.accentGreen, fontWeight: '700' }}>
                      {isMore ? `${currencySymbol}${diff.toFixed(0)} more` : `${currencySymbol}${Math.abs(diff).toFixed(0)} less`}
                    </Text>
                    {' '}({pct}% {isMore ? 'increase' : 'decrease'})
                  </Text>
                  <Text style={styles.compareSubtext}>
                    Last month: {currencySymbol}{lastTotal.toFixed(0)} · Daily avg: {currencySymbol}{dailyAvg.toFixed(0)}/day
                  </Text>
                </View>
              </View>
            )
          })()}

          {/* Bar chart */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Last 7 Days</Text>
            <View style={styles.barChart}>
              {last7.map((d, i) => (
                <View key={i} style={styles.barCol}>
                  <Text style={styles.barAmount}>
                    {d.amount > 0 ? `${currencySymbol}${d.amount >= 1000 ? (d.amount / 1000).toFixed(1) + 'k' : d.amount.toFixed(0)}` : ''}
                  </Text>
                  <View style={styles.barBg}>
                    <View style={[
                      styles.barFill,
                      { height: `${(d.amount / max7) * 100}%`, backgroundColor: d.amount > 0 ? COLORS.accent : COLORS.border }
                    ]} />
                  </View>
                  <Text style={styles.barLabel}>{d.label}</Text>
                </View>
              ))}
            </View>
          </View>

          {/* Category breakdown */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Category Breakdown</Text>
            {categoryTotals.map(cat => (
              <View key={cat.label} style={styles.catRow}>
                <View style={[styles.catIcon, { backgroundColor: cat.color + '22' }]}>
                  <Text style={{ fontSize: 18 }}>{cat.icon}</Text>
                </View>
                <View style={styles.catInfo}>
                  <View style={styles.catTopRow}>
                    <Text style={styles.catName}>{cat.label}</Text>
                    <View style={styles.catRight}>
                      <Text style={styles.catAmount}>{currencySymbol}{cat.total.toFixed(2)}</Text>
                      <Text style={styles.catPercent}>{cat.percentage.toFixed(1)}%</Text>
                    </View>
                  </View>
                  <View style={styles.progressBg}>
                    <View style={[styles.progressFill, { width: `${cat.percentage}%`, backgroundColor: cat.color }]} />
                  </View>
                </View>
              </View>
            ))}
          </View>

          {/* Biggest expense */}
          {expenses.length > 0 && (() => {
            const biggest = [...expenses].sort((a, b) => b.amount - a.amount)[0]
            const cat = CATEGORIES.find(c => c.label === biggest.category) || { icon: '📦', color: '#888' }
            return (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Biggest Expense</Text>
                <View style={styles.bigCard}>
                  <Text style={{ fontSize: 32 }}>{cat.icon}</Text>
                  <View style={{ marginLeft: 16, flex: 1 }}>
                    <Text style={styles.bigCategory}>{biggest.category}</Text>
                    <Text style={styles.bigNote}>{biggest.note || biggest.date}</Text>
                  </View>
                  <Text style={styles.bigAmount}>{currencySymbol}{parseFloat(biggest.amount).toFixed(2)}</Text>
                </View>
              </View>
            )
          })()}
        </>
      )}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg, paddingTop: 60, paddingHorizontal: 20 },
  heading: { fontSize: 26, fontWeight: '700', color: COLORS.text, marginBottom: 4 },
  subheading: { fontSize: 14, color: COLORS.textMuted, marginBottom: 24 },
  totalCard: {
    backgroundColor: COLORS.accent, borderRadius: 20,
    padding: 24, marginBottom: 16, alignItems: 'center',
  },
  totalLabel: { fontSize: 13, color: 'rgba(255,255,255,0.7)', marginBottom: 8 },
  totalAmount: { fontSize: 38, fontWeight: '800', color: '#fff' },
  totalSub: { fontSize: 13, color: 'rgba(255,255,255,0.6)', marginTop: 6 },
  compareCard: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: COLORS.card, borderRadius: 16, padding: 16,
    marginBottom: 24, borderWidth: 1,
  },
  compareIcon: { fontSize: 32 },
  compareTitle: { fontSize: 13, color: COLORS.textMuted, marginBottom: 4 },
  compareText: { fontSize: 15, color: COLORS.text, lineHeight: 22 },
  compareSubtext: { fontSize: 12, color: COLORS.textMuted, marginTop: 4 },
  section: { marginBottom: 28 },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: COLORS.textMuted, marginBottom: 16, letterSpacing: 1, textTransform: 'uppercase' },
  barChart: {
    flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between',
    height: 160, backgroundColor: COLORS.card, borderRadius: 16, padding: 16,
    borderWidth: 1, borderColor: COLORS.border,
  },
  barCol: { flex: 1, alignItems: 'center', height: '100%', justifyContent: 'flex-end' },
  barAmount: { fontSize: 9, color: COLORS.textMuted, marginBottom: 4, textAlign: 'center' },
  barBg: { width: 20, height: '75%', backgroundColor: COLORS.border, borderRadius: 6, overflow: 'hidden', justifyContent: 'flex-end' },
  barFill: { width: '100%', borderRadius: 6 },
  barLabel: { fontSize: 11, color: COLORS.textMuted, marginTop: 6 },
  catRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  catIcon: { width: 44, height: 44, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  catInfo: { flex: 1 },
  catTopRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  catName: { fontSize: 14, color: COLORS.text, fontWeight: '500' },
  catRight: { alignItems: 'flex-end' },
  catAmount: { fontSize: 14, color: COLORS.text, fontWeight: '700' },
  catPercent: { fontSize: 11, color: COLORS.textMuted },
  progressBg: { height: 4, backgroundColor: COLORS.border, borderRadius: 2 },
  progressFill: { height: 4, borderRadius: 2 },
  bigCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: COLORS.card, borderRadius: 16,
    padding: 20, borderWidth: 1, borderColor: COLORS.border,
  },
  bigCategory: { fontSize: 16, fontWeight: '700', color: COLORS.text },
  bigNote: { fontSize: 13, color: COLORS.textMuted, marginTop: 4 },
  bigAmount: { fontSize: 20, fontWeight: '800', color: COLORS.accentGreen },
  empty: { alignItems: 'center', marginTop: 80 },
  emptyText: { fontSize: 18, color: COLORS.textMuted, marginTop: 12, fontWeight: '600' },
  emptySub: { fontSize: 14, color: COLORS.textMuted, marginTop: 6 },
})