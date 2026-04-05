import { useState, useCallback, useRef, useEffect } from 'react'
import {
  View, Text, StyleSheet, ScrollView,
  RefreshControl, TouchableOpacity, Animated
} from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { useFocusEffect } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../../src/lib/supabase'
import { COLORS, CATEGORIES } from '../../src/constants/theme'
import { getCurrencySymbol } from '../../src/lib/currency'
import { ReportsSkeleton } from '../../src/components/SkeletonLoader'

function AnimatedBar({ percentage, color, delay = 0 }) {
  const anim = useRef(new Animated.Value(0)).current
  useEffect(() => {
    Animated.timing(anim, {
      toValue: percentage,
      duration: 800,
      delay,
      useNativeDriver: false,
    }).start()
  }, [percentage])
  return (
    <Animated.View style={{
      height: anim.interpolate({ inputRange: [0, 100], outputRange: ['0%', '100%'] }),
      width: '100%', borderRadius: 6,
      backgroundColor: color,
    }} />
  )
}

export default function Reports() {
  const [expenses, setExpenses] = useState([])
  const [lastMonthExpenses, setLastMonthExpenses] = useState([])
  const [allExpenses, setAllExpenses] = useState([])
  const [refreshing, setRefreshing] = useState(false)
  const [currencySymbol, setCurrencySymbol] = useState('₹')
  const [loading, setLoading] = useState(true)
  const [expandedCategory, setExpandedCategory] = useState(null)

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
      setAllExpenses(data)
      const filtered = data.filter(e => e.date.startsWith(currentMonth))
      setExpenses(filtered)
      const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      const lastMonthKey = `${lastMonthDate.getFullYear()}-${String(lastMonthDate.getMonth() + 1).padStart(2, '0')}`
      setLastMonthExpenses(data.filter(e => e.date.startsWith(lastMonthKey)))
    }
    setLoading(false)
    setRefreshing(false)
  }

  useFocusEffect(useCallback(() => { fetchData() }, []))

  const total = expenses.reduce((sum, e) => sum + parseFloat(e.amount), 0)
  const lastTotal = lastMonthExpenses.reduce((sum, e) => sum + parseFloat(e.amount), 0)
  const daysElapsed = now.getDate()
  const dailyAvg = total / Math.max(daysElapsed, 1)
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
  const forecast = dailyAvg * daysInMonth

  // Category totals
  const categoryTotals = CATEGORIES.map(cat => {
    const catExpenses = expenses.filter(e => e.category === cat.label)
    const catTotal = catExpenses.reduce((sum, e) => sum + parseFloat(e.amount), 0)
    return { ...cat, total: catTotal, percentage: total > 0 ? (catTotal / total) * 100 : 0, expenses: catExpenses }
  }).filter(c => c.total > 0).sort((a, b) => b.total - a.total)

  // 7-day chart
  const dailyMap = {}
  expenses.forEach(e => {
    dailyMap[e.date] = (dailyMap[e.date] || 0) + parseFloat(e.amount)
  })

  const last7 = []
  for (let i = 6; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    const label = d.toLocaleString('default', { weekday: 'short' })
    last7.push({ date: dateStr, label, amount: dailyMap[dateStr] || 0 })
  }
  const max7 = Math.max(...last7.map(d => d.amount), 1)

  // Last 6 months trend
  const last6Months = []
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const label = d.toLocaleString('default', { month: 'short' })
    const monthTotal = allExpenses
      .filter(e => e.date.startsWith(key))
      .reduce((sum, e) => sum + parseFloat(e.amount), 0)
    last6Months.push({ key, label, amount: monthTotal })
  }
  const max6 = Math.max(...last6Months.map(m => m.amount), 1)

  // Heatmap
  const daysInCurrentMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
  const heatmapDays = []
  for (let d = 1; d <= daysInCurrentMonth; d++) {
    const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    const amount = dailyMap[dateStr] || 0
    heatmapDays.push({ day: d, amount, dateStr })
  }
  const maxHeatmap = Math.max(...heatmapDays.map(d => d.amount), 1)

  // Weekend vs weekday
  const weekendExpenses = expenses.filter(e => {
    const day = new Date(e.date).getDay()
    return day === 0 || day === 6
  })
  const weekdayExpenses = expenses.filter(e => {
    const day = new Date(e.date).getDay()
    return day !== 0 && day !== 6
  })
  const weekendTotal = weekendExpenses.reduce((sum, e) => sum + parseFloat(e.amount), 0)
  const weekdayTotal = weekdayExpenses.reduce((sum, e) => sum + parseFloat(e.amount), 0)

  // Top note/merchant
  const noteCounts = {}
  expenses.forEach(e => {
    if (e.note && e.note.trim()) {
      const key = e.note.trim().toLowerCase()
      noteCounts[key] = (noteCounts[key] || 0) + 1
    }
  })
  const topNote = Object.entries(noteCounts).sort((a, b) => b[1] - a[1])[0]

  // Biggest day
  const dayTotals = {}
  expenses.forEach(e => {
    dayTotals[e.date] = (dayTotals[e.date] || 0) + parseFloat(e.amount)
  })
  const biggestDay = Object.entries(dayTotals).sort((a, b) => b[1] - a[1])[0]

  // Spending streak
  let streak = 0
  for (let i = 0; i < 30; i++) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    if (dailyMap[dateStr]) streak++
    else break
  }

  if (loading) return <ReportsSkeleton />

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
          <LinearGradient
            colors={['#7C75FF', '#6C63FF', '#5A50FF']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.totalCard}
          >
            <Text style={styles.totalLabel}>Total Spent</Text>
            <Text style={styles.totalAmount}>{currencySymbol}{total.toFixed(2)}</Text>
            <Text style={styles.totalSub}>{expenses.length} transactions</Text>
          </LinearGradient>

          {/* 4 Mini stat cards */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
            <View style={styles.miniCard}>
              <Text style={styles.miniLabel}>DAILY AVG</Text>
              <Text style={styles.miniValue}>{currencySymbol}{dailyAvg.toFixed(0)}</Text>
            </View>
            <View style={styles.miniCard}>
              <Text style={styles.miniLabel}>FORECAST</Text>
              <Text style={[styles.miniValue, { color: forecast > lastTotal && lastTotal > 0 ? COLORS.accentRed : COLORS.accentGreen }]}>
                {currencySymbol}{forecast.toFixed(0)}
              </Text>
            </View>
            <View style={styles.miniCard}>
              <Text style={styles.miniLabel}>BIGGEST DAY</Text>
              <Text style={styles.miniValue}>
                {biggestDay ? `${currencySymbol}${parseFloat(biggestDay[1]).toFixed(0)}` : 'N/A'}
              </Text>
            </View>
            <View style={[styles.miniCard, { marginRight: 0 }]}>
              <Text style={styles.miniLabel}>TOP CATEGORY</Text>
              <Text style={styles.miniValue}>
                {categoryTotals[0] ? `${categoryTotals[0].icon} ${categoryTotals[0].label}` : 'N/A'}
              </Text>
            </View>
          </ScrollView>

          {/* Spending streak */}
          {streak > 0 && (
            <View style={styles.streakCard}>
              <Text style={styles.streakEmoji}>🔥</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.streakTitle}>{streak} Day Streak!</Text>
                <Text style={styles.streakSub}>You've logged expenses {streak} day{streak > 1 ? 's' : ''} in a row</Text>
              </View>
            </View>
          )}

          {/* Spending forecast */}
          <View style={styles.forecastCard}>
            <View style={styles.forecastHeader}>
              <Ionicons name="trending-up-outline" size={20} color={COLORS.accent} />
              <Text style={styles.forecastTitle}>Spending Forecast</Text>
            </View>
            <Text style={styles.forecastAmount}>{currencySymbol}{forecast.toFixed(2)}</Text>
            <Text style={styles.forecastSub}>
              At {currencySymbol}{dailyAvg.toFixed(0)}/day, you'll spend this much by end of {now.toLocaleString('default', { month: 'long' })}
            </Text>
            <View style={styles.forecastBar}>
              <View style={[styles.forecastFill, {
                width: `${Math.min((total / Math.max(forecast, 1)) * 100, 100)}%`,
                backgroundColor: total > forecast * 0.8 ? COLORS.accentRed : COLORS.accent
              }]} />
            </View>
            <Text style={styles.forecastPct}>
              {((total / Math.max(forecast, 1)) * 100).toFixed(0)}% of forecast used
            </Text>
          </View>

          {/* Month comparison */}
          {lastTotal > 0 && (() => {
            const diff = total - lastTotal
            const pct = ((Math.abs(diff) / lastTotal) * 100).toFixed(0)
            const isMore = diff > 0
            return (
              <View style={[styles.compareCard, { borderColor: isMore ? COLORS.accentRed + '44' : COLORS.accentGreen + '44' }]}>
                <Text style={styles.compareIcon}>{isMore ? '📈' : '📉'}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.compareTitle}>VS LAST MONTH</Text>
                  <Text style={styles.compareText}>
                    You spent{' '}
                    <Text style={{ color: isMore ? COLORS.accentRed : COLORS.accentGreen, fontWeight: '700' }}>
                      {isMore ? `${currencySymbol}${diff.toFixed(0)} more` : `${currencySymbol}${Math.abs(diff).toFixed(0)} less`}
                    </Text>
                    {' '}({pct}% {isMore ? 'increase' : 'decrease'})
                  </Text>
                  <Text style={styles.compareSubtext}>
                    Last month: {currencySymbol}{lastTotal.toFixed(0)} · This month: {currencySymbol}{total.toFixed(0)}
                  </Text>
                </View>
              </View>
            )
          })()}

          {/* Last 6 months trend */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>6 Month Trend</Text>
            <View style={styles.barChart}>
              {last6Months.map((m, i) => (
                <View key={i} style={styles.barCol}>
                  <Text style={styles.barAmount}>
                    {m.amount > 0 ? `${m.amount >= 1000 ? (m.amount / 1000).toFixed(1) + 'k' : m.amount.toFixed(0)}` : ''}
                  </Text>
                  <View style={styles.barBg}>
                    <AnimatedBar
                      percentage={(m.amount / max6) * 100}
                      color={m.key === currentMonth ? COLORS.accent : COLORS.accent + '55'}
                      delay={i * 100}
                    />
                  </View>
                  <Text style={[styles.barLabel, m.key === currentMonth && { color: COLORS.accent, fontWeight: '700' }]}>
                    {m.label}
                  </Text>
                </View>
              ))}
            </View>
          </View>

          {/* Animated 7-day bar chart */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Last 7 Days</Text>
            <View style={styles.barChart}>
              {last7.map((d, i) => (
                <View key={i} style={styles.barCol}>
                  <Text style={styles.barAmount}>
                    {d.amount > 0 ? `${d.amount >= 1000 ? (d.amount / 1000).toFixed(1) + 'k' : d.amount.toFixed(0)}` : ''}
                  </Text>
                  <View style={styles.barBg}>
                    <AnimatedBar
                      percentage={(d.amount / max7) * 100}
                      color={d.amount > 0 ? COLORS.accentGreen : COLORS.border}
                      delay={i * 80}
                    />
                  </View>
                  <Text style={styles.barLabel}>{d.label}</Text>
                </View>
              ))}
            </View>
          </View>

          {/* Spending heatmap */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Spending Heatmap</Text>
            <View style={styles.heatmapCard}>
              <View style={styles.heatmap}>
                {heatmapDays.map((d, i) => {
                  const intensity = d.amount > 0 ? Math.max(0.15, d.amount / maxHeatmap) : 0
                  const isToday = d.day === now.getDate()
                  return (
                    <View
                      key={i}
                      style={[
                        styles.heatmapCell,
                        { backgroundColor: d.amount > 0 ? `rgba(108, 99, 255, ${intensity})` : COLORS.cardAlt },
                        isToday && { borderWidth: 1, borderColor: COLORS.accent }
                      ]}
                    >
                      <Text style={[styles.heatmapDay, d.amount > 0 && intensity > 0.5 && { color: '#fff' }]}>
                        {d.day}
                      </Text>
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

          {/* Weekend vs Weekday */}
          {(weekendTotal > 0 || weekdayTotal > 0) && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Weekend vs Weekday</Text>
              <View style={styles.splitCard}>
                <View style={styles.splitItem}>
                  <View style={[styles.splitIconBox, { backgroundColor: COLORS.accent + '22' }]}>
  <Ionicons name="briefcase-outline" size={20} color={COLORS.accent} />
</View>
                  <Text style={styles.splitLabel}>Weekdays</Text>
                  <Text style={styles.splitAmount}>{currencySymbol}{weekdayTotal.toFixed(0)}</Text>
                  <Text style={styles.splitPct}>
                    {total > 0 ? ((weekdayTotal / total) * 100).toFixed(0) : 0}%
                  </Text>
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
                  <Text style={styles.splitAmount}>{currencySymbol}{weekendTotal.toFixed(0)}</Text>
                  <Text style={styles.splitPct}>
                    {total > 0 ? ((weekendTotal / total) * 100).toFixed(0) : 0}%
                  </Text>
                  <View style={styles.splitBarBg}>
                    <View style={[styles.splitBarFill, { width: `${total > 0 ? (weekendTotal / total) * 100 : 0}%`, backgroundColor: COLORS.accentYellow }]} />
                  </View>
                </View>
              </View>
            </View>
          )}

          {/* Category breakdown — tappable */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Category Breakdown</Text>
            {categoryTotals.map(cat => (
              <View key={cat.label}>
                <TouchableOpacity
                  style={styles.catRow}
                  onPress={() => setExpandedCategory(expandedCategory === cat.label ? null : cat.label)}
                  activeOpacity={0.7}
                >
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
                  <Ionicons
                    name={expandedCategory === cat.label ? 'chevron-up' : 'chevron-down'}
                    size={16} color={COLORS.textMuted}
                    style={{ marginLeft: 8 }}
                  />
                </TouchableOpacity>

                {/* Expanded expenses */}
                {expandedCategory === cat.label && (
                  <View style={styles.expandedList}>
                    {cat.expenses.sort((a, b) => b.amount - a.amount).map(exp => (
                      <View key={exp.id} style={styles.expandedItem}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.expandedNote}>{exp.note || exp.category}</Text>
                          <Text style={styles.expandedDate}>{exp.date}</Text>
                        </View>
                        <Text style={styles.expandedAmount}>{currencySymbol}{parseFloat(exp.amount).toFixed(2)}</Text>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            ))}
          </View>

          {/* Top merchant */}
          {topNote && topNote[1] > 1 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Top Merchant</Text>
              <View style={styles.merchantCard}>
                <Text style={styles.merchantEmoji}>🏪</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.merchantName}>{topNote[0].charAt(0).toUpperCase() + topNote[0].slice(1)}</Text>
                  <Text style={styles.merchantSub}>Appears {topNote[1]} times this month</Text>
                </View>
                <Text style={styles.merchantCount}>{topNote[1]}x</Text>
              </View>
            </View>
          )}

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
                    <Text style={styles.bigDate}>{biggest.date}</Text>
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
  heading: { fontSize: 28, fontWeight: '800', color: COLORS.text, letterSpacing: -0.8, marginBottom: 4 },
  subheading: { fontSize: 14, color: COLORS.textMuted, marginBottom: 24 },
  totalCard: { borderRadius: 24, padding: 28, marginBottom: 16, alignItems: 'center' },
  totalLabel: { fontSize: 11, color: 'rgba(255,255,255,0.7)', marginBottom: 8, letterSpacing: 1.5, textTransform: 'uppercase' },
  totalAmount: { fontSize: 42, fontWeight: '900', color: '#fff', letterSpacing: -2 },
  totalSub: { fontSize: 13, color: 'rgba(255,255,255,0.6)', marginTop: 6, letterSpacing: 0.3 },
  miniCard: {
    backgroundColor: COLORS.card, borderRadius: 14,
    padding: 14, marginRight: 10, minWidth: 110,
    borderWidth: 1, borderColor: COLORS.border,
  },
  miniLabel: { fontSize: 9, fontWeight: '700', color: COLORS.textMuted, letterSpacing: 1, marginBottom: 8 },
  miniValue: { fontSize: 16, fontWeight: '800', color: COLORS.text, letterSpacing: -0.5 },
  streakCard: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: COLORS.card, borderRadius: 16, padding: 16,
    marginBottom: 16, borderWidth: 1, borderColor: '#FF8C4244',
  },
  streakEmoji: { fontSize: 32 },
  streakTitle: { fontSize: 16, fontWeight: '700', color: COLORS.text },
  streakSub: { fontSize: 13, color: COLORS.textMuted, marginTop: 2 },
  forecastCard: {
    backgroundColor: COLORS.card, borderRadius: 16, padding: 16,
    marginBottom: 16, borderWidth: 1, borderColor: COLORS.border,
  },
  forecastHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  forecastTitle: { fontSize: 13, fontWeight: '700', color: COLORS.textMuted, letterSpacing: 0.5 },
  forecastAmount: { fontSize: 28, fontWeight: '800', color: COLORS.text, letterSpacing: -1, marginBottom: 6 },
  forecastSub: { fontSize: 12, color: COLORS.textMuted, marginBottom: 12, lineHeight: 18 },
  forecastBar: { height: 6, backgroundColor: COLORS.border, borderRadius: 3, marginBottom: 6 },
  forecastFill: { height: 6, borderRadius: 3 },
  forecastPct: { fontSize: 11, color: COLORS.textMuted },
  compareCard: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: COLORS.card, borderRadius: 16, padding: 16,
    marginBottom: 24, borderWidth: 1,
  },
  compareIcon: { fontSize: 32 },
  compareTitle: { fontSize: 11, color: COLORS.textMuted, marginBottom: 4, letterSpacing: 1 },
  compareText: { fontSize: 15, color: COLORS.text, lineHeight: 22 },
  compareSubtext: { fontSize: 12, color: COLORS.textMuted, marginTop: 4 },
  section: { marginBottom: 28 },
  sectionTitle: { fontSize: 11, fontWeight: '800', color: COLORS.textMuted, marginBottom: 16, letterSpacing: 1.5, textTransform: 'uppercase' },
  barChart: {
    flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between',
    height: 160, backgroundColor: COLORS.card, borderRadius: 16, padding: 16,
    borderWidth: 1, borderColor: COLORS.border,
  },
  barCol: { flex: 1, alignItems: 'center', height: '100%', justifyContent: 'flex-end' },
  barAmount: { fontSize: 9, color: COLORS.textMuted, marginBottom: 4, textAlign: 'center' },
  barBg: { width: 20, height: '75%', backgroundColor: COLORS.border, borderRadius: 6, overflow: 'hidden', justifyContent: 'flex-end' },
  barLabel: { fontSize: 11, color: COLORS.textMuted, marginTop: 6 },
  heatmapCard: {
    backgroundColor: COLORS.card, borderRadius: 16, padding: 16,
    borderWidth: 1, borderColor: COLORS.border,
  },
  heatmap: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  heatmapCell: {
    width: 32, height: 32, borderRadius: 6,
    justifyContent: 'center', alignItems: 'center',
  },
  heatmapDay: { fontSize: 10, color: COLORS.textMuted, fontWeight: '600' },
  heatmapLegend: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 12, justifyContent: 'flex-end' },
  heatmapLegendText: { fontSize: 10, color: COLORS.textMuted },
  heatmapLegendBox: { width: 12, height: 12, borderRadius: 3 },
  splitCard: {
    flexDirection: 'row', backgroundColor: COLORS.card,
    borderRadius: 16, padding: 16,
    borderWidth: 1, borderColor: COLORS.border,
  },
  splitItem: { flex: 1, alignItems: 'center', gap: 6 },
  splitLabel: { fontSize: 12, color: COLORS.textMuted, fontWeight: '600' },
  splitAmount: { fontSize: 18, fontWeight: '800', color: COLORS.text, letterSpacing: -0.5 },
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
  expandedList: {
    backgroundColor: COLORS.cardAlt, borderRadius: 12,
    padding: 12, marginBottom: 12, marginLeft: 56,
    borderWidth: 1, borderColor: COLORS.border,
  },
  expandedItem: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  expandedNote: { fontSize: 13, color: COLORS.text, fontWeight: '500' },
  expandedDate: { fontSize: 11, color: COLORS.textMuted, marginTop: 2 },
  expandedAmount: { fontSize: 13, fontWeight: '700', color: COLORS.accentGreen },
  merchantCard: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: COLORS.card, borderRadius: 16, padding: 16,
    borderWidth: 1, borderColor: COLORS.border,
  },
  merchantEmoji: { fontSize: 32 },
  merchantName: { fontSize: 16, fontWeight: '700', color: COLORS.text, textTransform: 'capitalize' },
  merchantSub: { fontSize: 12, color: COLORS.textMuted, marginTop: 2 },
  merchantCount: { fontSize: 20, fontWeight: '800', color: COLORS.accent },
  bigCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: COLORS.card, borderRadius: 16,
    padding: 20, borderWidth: 1, borderColor: COLORS.border,
  },
  bigCategory: { fontSize: 16, fontWeight: '700', color: COLORS.text, letterSpacing: -0.3 },
  bigNote: { fontSize: 13, color: COLORS.textMuted, marginTop: 2 },
  bigDate: { fontSize: 11, color: COLORS.textMuted, marginTop: 2 },
  bigAmount: { fontSize: 20, fontWeight: '800', color: COLORS.accentGreen, letterSpacing: -0.5 },
  empty: { alignItems: 'center', marginTop: 80 },
  emptyText: { fontSize: 18, color: COLORS.textMuted, marginTop: 12, fontWeight: '600' },
  emptySub: { fontSize: 14, color: COLORS.textMuted, marginTop: 6 },
  splitIconBox: {
  width: 40, height: 40, borderRadius: 12,
  justifyContent: 'center', alignItems: 'center',
},
})