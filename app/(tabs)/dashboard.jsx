import { useState, useCallback, useRef, useEffect } from 'react'
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl, ActivityIndicator, TextInput, Modal, KeyboardAvoidingView, Platform } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { useFocusEffect, useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { COLORS, CATEGORIES } from '../../src/constants/theme'
import { DashboardSkeleton } from '../../src/components/SkeletonLoader'
import { getCurrencySymbol, loadCurrency, formatAmount } from '../../src/lib/currency'
import { saveCache, loadCache } from '../../src/lib/cache'
import { getUser } from '../../src/lib/auth'
import { BannerAd, BannerAdSize } from 'react-native-google-mobile-ads'
import { BANNER_AD_UNIT_ID } from '../../src/lib/ads'
import { checkWeeklySummary, requestNotificationPermission } from '../../src/lib/notifications'
import { saveGoal, loadGoal, clearGoal } from '../../src/lib/spendingGoal'
import { getExpenses, getMonthlyTotal } from '../../src/services/sqliteService'

function CountUp({ value, style, symbol, currencyCode }) {
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
      if (step >= steps) { current = end; clearInterval(timer) }
      setDisplay(current)
    }, duration / steps)
    prev.current = end
    return () => clearInterval(timer)
  }, [value])
  return (
    <Text style={style} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.5}>
      {formatAmount(display, symbol, currencyCode)}
    </Text>
  )
}

export default function Dashboard() {
  const [expenses, setExpenses] = useState([])
  const [userName, setUserName] = useState('')
  const [refreshing, setRefreshing] = useState(false)
  const [loading, setLoading] = useState(true)
  const [monthLoading, setMonthLoading] = useState(false)
  const [monthOffset, setMonthOffset] = useState(0)
  const [lastMonthTotal, setLastMonthTotal] = useState(0)
  const [daysInMonth, setDaysInMonth] = useState(1)
  const [currencySymbol, setCurrencySymbol] = useState('₹')
  const [currencyCode, setCurrencyCode] = useState('INR')
  const [spendingGoal, setSpendingGoal] = useState(null)
  const [showGoalModal, setShowGoalModal] = useState(false)
  const [goalInput, setGoalInput] = useState('')
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

  function sortExpenses(data) {
    return [...data].sort((a, b) => {
      if (b.date !== a.date) return b.date.localeCompare(a.date)
      return new Date(b.created_at || 0) - new Date(a.created_at || 0)
    })
  }

  useEffect(() => {
    async function loadGoalData() {
      const user = await getUser()
      if (user) {
        const goal = await loadGoal(user.id)
        setSpendingGoal(goal)
      }
    }
    loadGoalData()
  }, [])

  async function fetchData(forceRefresh = false) {
    const cacheKey = `savr_cache_dashboard_${currentMonth}`
    setMonthLoading(true)

    if (!forceRefresh) {
      const cached = await loadCache(cacheKey)
      if (cached) {
        setExpenses(sortExpenses(cached.expenses))
        setUserName(cached.userName)
        setLastMonthTotal(cached.lastMonthTotal)
        setDaysInMonth(cached.daysInMonth)
        setCurrencySymbol(cached.currencySymbol)
        setCurrencyCode(cached.currencyCode || 'INR')
        setLoading(false)
        setMonthLoading(false)
        syncFromSQLite(cacheKey)
        return
      }
    }

    await syncFromSQLite(cacheKey)
  }

  async function syncFromSQLite(cacheKey) {
    try {
      const user = await getUser()
      const meta = user.user_metadata?.display_name || user.user_metadata?.full_name
      const emailName = user.email.split('@')[0]
      const firstName = meta ? meta.split(' ')[0] : emailName

      const symbol = await getCurrencySymbol()
      const code = await loadCurrency()

      const lastMonthInfo = getMonthInfo(monthOffset - 1)

      const [currentExpenses, lastTotal] = await Promise.all([
        getExpenses(user.id, { month: currentMonth }),
        getMonthlyTotal(user.id, lastMonthInfo.month),
      ])

      const filtered = sortExpenses(currentExpenses)
      const now = new Date()
      const daysElapsed = monthOffset === 0
        ? now.getDate()
        : new Date(currentMonth + '-01').getDate()

      setExpenses(filtered)
      setUserName(firstName)
      setLastMonthTotal(lastTotal)
      setDaysInMonth(daysElapsed)
      setCurrencySymbol(symbol)
      setCurrencyCode(code)

      await saveCache(cacheKey, {
        expenses: filtered,
        userName: firstName,
        lastMonthTotal: lastTotal,
        daysInMonth: daysElapsed,
        currencySymbol: symbol,
        currencyCode: code,
      })

      const notifAsked = await loadCache('savr_notif_asked')
      if (!notifAsked) {
        await saveCache('savr_notif_asked', true)
        setTimeout(async () => { await requestNotificationPermission() }, 2000)
      }

      if (monthOffset === 0) checkWeeklySummary(filtered)
    } catch (e) {
      console.error('Dashboard sync error:', e)
    } finally {
      setLoading(false)
      setRefreshing(false)
      setMonthLoading(false)
    }
  }

  useFocusEffect(useCallback(() => { fetchData() }, [currentMonth]))

  async function handleSaveGoal() {
    const amount = parseFloat(goalInput)
    if (!goalInput || isNaN(amount) || amount <= 0) return
    const user = await getUser()
    await saveGoal(user.id, amount)
    setSpendingGoal(amount)
    setShowGoalModal(false)
    setGoalInput('')
  }

  async function handleClearGoal() {
    const user = await getUser()
    await clearGoal(user.id)
    setSpendingGoal(null)
    setShowGoalModal(false)
    setGoalInput('')
  }

  const total = expenses.reduce((sum, e) => sum + parseFloat(e.amount), 0)
  const now = new Date()
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  const todayExpenses = expenses.filter(e => e.date === todayStr)
  const todayTotal = todayExpenses.reduce((sum, e) => sum + parseFloat(e.amount), 0)

  const byCategory = CATEGORIES.map(cat => {
    const catExpenses = expenses.filter(e => e.category === cat.label)
    const catTotal = catExpenses.reduce((sum, e) => sum + parseFloat(e.amount), 0)
    return { ...cat, total: catTotal }
  }).filter(c => c.total > 0).sort((a, b) => b.total - a.total)

  const recent = sortExpenses(expenses).slice(0, 5)

  const goalPercentage = spendingGoal ? Math.min((total / spendingGoal) * 100, 100) : 0
  const goalExceeded = spendingGoal && total > spendingGoal
  const goalRemaining = spendingGoal ? Math.max(spendingGoal - total, 0) : 0
  const goalColor = goalPercentage >= 100 ? COLORS.accentRed : goalPercentage >= 80 ? COLORS.accentYellow : COLORS.accentGreen

  function getCategoryInfo(label) {
    return CATEGORIES.find(c => c.label === label) || { icon: '📦', color: '#888' }
  }

  function getGreeting() {
    const hour = new Date().getHours()
    if (hour < 12) return 'Good morning'
    if (hour < 17) return 'Good afternoon'
    if (hour < 21) return 'Good evening'
    return 'Good night'
  }

  function formatDate(dateStr) {
    const today = new Date()
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)
    const yesterdayStr = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`
    if (dateStr === todayStr) return 'Today'
    if (dateStr === yesterdayStr) return 'Yesterday'
    return new Date(dateStr + 'T00:00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
  }

  if (loading) return <DashboardSkeleton />

  return (
    <View style={{ flex: 1 }}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={{ paddingBottom: 100 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchData(true) }} tintColor={COLORS.accent} />
        }
      >
        <View style={styles.header}>
          <Text style={styles.greeting}>{getGreeting()}, {userName} 👋</Text>
        </View>

        <View style={styles.monthNav}>
          <TouchableOpacity style={styles.monthNavBtn} onPress={() => setMonthOffset(o => o - 1)}>
            <Ionicons name="chevron-back" size={20} color={COLORS.text} />
          </TouchableOpacity>
          <View style={styles.monthNavCenter}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
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
            <Ionicons name="chevron-forward" size={20} color={isCurrentMonth ? COLORS.border : COLORS.text} />
          </TouchableOpacity>
        </View>

        <LinearGradient colors={['#7C75FF', '#6C63FF', '#5A50FF']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.totalCard}>
          <View style={styles.totalRow}>
            <View style={styles.totalLeft}>
              <Text style={styles.totalLabel}>TOTAL SPENT</Text>
              <CountUp value={total} style={styles.totalAmount} symbol={currencySymbol} currencyCode={currencyCode} />
              <Text style={styles.totalSub}>{expenses.length} transactions</Text>
            </View>
            <View style={styles.totalDivider} />
            <View style={styles.totalRight}>
              <Text style={styles.totalLabel}>TODAY</Text>
              <CountUp value={todayTotal} style={styles.totalAmount} symbol={currencySymbol} currencyCode={currencyCode} />
              <Text style={styles.totalSub}>{todayExpenses.length} today</Text>
            </View>
          </View>
        </LinearGradient>

        {isCurrentMonth && (
          <TouchableOpacity
            style={[styles.goalCard, goalExceeded && styles.goalCardExceeded]}
            onPress={() => { setGoalInput(spendingGoal ? String(spendingGoal) : ''); setShowGoalModal(true) }}
            activeOpacity={0.8}
          >
            {spendingGoal ? (
              <>
                <View style={styles.goalHeader}>
                  <View style={styles.goalHeaderLeft}>
                    <Text style={styles.goalEmoji}>{goalExceeded ? '🚨' : goalPercentage >= 80 ? '⚠️' : '🎯'}</Text>
                    <View>
                      <Text style={styles.goalTitle}>Monthly Goal</Text>
                      <Text style={styles.goalSub}>
                        {goalExceeded
                          ? `Exceeded by ${formatAmount(total - spendingGoal, currencySymbol, currencyCode)}`
                          : `${formatAmount(goalRemaining, currencySymbol, currencyCode)} remaining`}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.goalPctBadge}>
                    <Text style={[styles.goalPctText, { color: goalColor }]}>{goalPercentage.toFixed(0)}%</Text>
                  </View>
                </View>
                <View style={styles.goalBarBg}>
                  <View style={[styles.goalBarFill, { width: `${goalPercentage}%`, backgroundColor: goalColor }]} />
                </View>
                <View style={styles.goalFooter}>
                  <Text style={styles.goalFooterText}>{formatAmount(total, currencySymbol, currencyCode)} of {formatAmount(spendingGoal, currencySymbol, currencyCode)}</Text>
                  <Text style={styles.goalEditText}>Tap to edit</Text>
                </View>
              </>
            ) : (
              <View style={styles.goalEmpty}>
                <View style={styles.goalEmptyIcon}>
                  <Ionicons name="flag-outline" size={22} color={COLORS.accent} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.goalEmptyTitle}>Set a Spending Goal</Text>
                  <Text style={styles.goalEmptySub}>Track progress towards your monthly target</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={COLORS.textMuted} />
              </View>
            )}
          </TouchableOpacity>
        )}

        <View style={styles.bannerContainer}>
          <BannerAd unitId={BANNER_AD_UNIT_ID} size={BannerAdSize.BANNER} requestOptions={{ requestNonPersonalizedAdsOnly: false }} />
        </View>

        {expenses.length > 0 && (
          <View style={styles.statsRow}>
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>Daily Avg</Text>
              <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
                {formatAmount(total / Math.max(daysInMonth, 1), currencySymbol, currencyCode)}
              </Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>vs Last Month</Text>
              <Text style={[styles.statValue, { color: total > lastMonthTotal ? COLORS.accentRed : COLORS.accentGreen }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
                {lastMonthTotal === 0 ? 'N/A' : `${total > lastMonthTotal ? '▲' : '▼'} ${formatAmount(Math.abs(total - lastMonthTotal), currencySymbol, currencyCode)}`}
              </Text>
            </View>
          </View>
        )}

        {expenses.length >= 3 && (() => {
          const insights = []
          const topCat = byCategory[0]
          if (topCat) insights.push(`🏆 ${topCat.icon} ${topCat.label} is your biggest spend at ${((topCat.total / total) * 100).toFixed(0)}% of total`)
          if (total > lastMonthTotal && lastMonthTotal > 0) insights.push(`📈 You're spending ${((total - lastMonthTotal) / lastMonthTotal * 100).toFixed(0)}% more than last month`)
          if (total < lastMonthTotal && lastMonthTotal > 0) insights.push(`📉 Great job! You're spending ${((lastMonthTotal - total) / lastMonthTotal * 100).toFixed(0)}% less than last month`)
          const dailyAvg = total / Math.max(daysInMonth, 1)
          if (dailyAvg > 500) insights.push(`💡 You're averaging ${formatAmount(dailyAvg, currencySymbol, currencyCode)}/day this month`)
          if (byCategory.length >= 3) insights.push(`📊 You've spent across ${byCategory.length} categories this month`)
          if (spendingGoal && !goalExceeded && goalPercentage >= 80) insights.push(`🎯 You've used ${goalPercentage.toFixed(0)}% of your monthly goal — slow down!`)
          if (spendingGoal && goalExceeded) insights.push(`🚨 You've exceeded your monthly goal of ${formatAmount(spendingGoal, currencySymbol, currencyCode)}!`)
          if (insights.length === 0) return null
          return (
            <View style={styles.insightsCard}>
              <Text style={styles.insightsTitle}>💡 Insights</Text>
              {insights.map((insight, i) => <Text key={i} style={styles.insightText}>{insight}</Text>)}
            </View>
          )
        })()}

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
                    <Text style={styles.catAmount}>{formatAmount(cat.total, currencySymbol, currencyCode)}</Text>
                  </View>
                  <View style={styles.progressBg}>
                    <View style={[styles.progressFill, { width: `${Math.min((cat.total / total) * 100, 100)}%`, backgroundColor: cat.color }]} />
                  </View>
                </View>
              </View>
            ))}
          </View>
        )}

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
                  <Text style={styles.txAmount} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
                    {formatAmount(item.amount, currencySymbol, currencyCode)}
                  </Text>
                </View>
              )
            })}
          </View>
        )}

        {expenses.length === 0 && (
          <View style={styles.empty}>
            <Ionicons name="stats-chart-outline" size={56} color={COLORS.border} />
            <Text style={styles.emptyText}>No expenses in {monthName}</Text>
            <Text style={styles.emptySub}>{isCurrentMonth ? 'Tap + to start tracking' : 'Nothing recorded this month'}</Text>
          </View>
        )}
      </ScrollView>

      {isCurrentMonth && (
        <TouchableOpacity style={styles.fab} onPress={() => router.push('/(tabs)/add')} activeOpacity={0.85}>
          <Ionicons name="add" size={28} color="#fff" />
        </TouchableOpacity>
      )}

      <Modal visible={showGoalModal} transparent animationType="fade" onRequestClose={() => setShowGoalModal(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>🎯 Monthly Spending Goal</Text>
              <TouchableOpacity onPress={() => setShowGoalModal(false)}>
                <Ionicons name="close" size={22} color={COLORS.textMuted} />
              </TouchableOpacity>
            </View>
            <Text style={styles.modalSubtitle}>Set a target for how much you want to spend this month</Text>
            <Text style={styles.modalLabel}>Goal Amount ({currencySymbol})</Text>
            <TextInput
              style={styles.modalInput}
              placeholder={`e.g. ${currencySymbol}20000`}
              placeholderTextColor={COLORS.textMuted}
              value={goalInput}
              onChangeText={setGoalInput}
              keyboardType="numeric"
              autoFocus
            />
            <TouchableOpacity style={styles.modalSaveBtn} onPress={handleSaveGoal}>
              <Text style={styles.modalSaveBtnText}>Save Goal</Text>
            </TouchableOpacity>
            {spendingGoal && (
              <TouchableOpacity style={styles.modalClearBtn} onPress={handleClearGoal}>
                <Text style={styles.modalClearBtnText}>Remove Goal</Text>
              </TouchableOpacity>
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg, paddingTop: 60, paddingHorizontal: 20 },
  header: { marginBottom: 16 },
  greeting: { fontSize: 26, fontWeight: '800', color: COLORS.text, letterSpacing: -0.8 },
  monthNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: COLORS.card, borderRadius: 14, padding: 12, marginBottom: 20, borderWidth: 1, borderColor: COLORS.border },
  monthNavBtn: { padding: 4 },
  monthNavBtnDisabled: { opacity: 0.3 },
  monthNavCenter: { alignItems: 'center' },
  monthNavText: { fontSize: 16, fontWeight: '700', color: COLORS.text, letterSpacing: -0.3 },
  monthNavBack: { fontSize: 12, color: COLORS.accent, marginTop: 4 },
  totalCard: { borderRadius: 24, padding: 24, marginBottom: 16 },
  totalRow: { flexDirection: 'row', alignItems: 'center', width: '100%' },
  totalLeft: { flex: 1, alignItems: 'center', paddingHorizontal: 8 },
  totalRight: { flex: 1, alignItems: 'center', paddingHorizontal: 8 },
  totalDivider: { width: 1, height: 70, backgroundColor: 'rgba(255,255,255,0.3)' },
  totalLabel: { fontSize: 10, color: 'rgba(255,255,255,0.7)', marginBottom: 6, letterSpacing: 1.5, textTransform: 'uppercase' },
  totalAmount: { fontSize: 22, fontWeight: '900', color: '#fff', letterSpacing: -0.5, width: '100%', textAlign: 'center' },
  totalSub: { fontSize: 12, color: 'rgba(255,255,255,0.6)', marginTop: 6, letterSpacing: 0.3 },
  goalCard: { backgroundColor: COLORS.card, borderRadius: 16, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: COLORS.border },
  goalCardExceeded: { borderColor: COLORS.accentRed + '66' },
  goalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  goalHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  goalEmoji: { fontSize: 24 },
  goalTitle: { fontSize: 15, fontWeight: '700', color: COLORS.text },
  goalSub: { fontSize: 12, color: COLORS.textMuted, marginTop: 2 },
  goalPctBadge: { backgroundColor: COLORS.cardAlt, borderRadius: 10, paddingVertical: 4, paddingHorizontal: 10, borderWidth: 1, borderColor: COLORS.border },
  goalPctText: { fontSize: 16, fontWeight: '900' },
  goalBarBg: { height: 8, backgroundColor: COLORS.border, borderRadius: 4, marginBottom: 8 },
  goalBarFill: { height: 8, borderRadius: 4 },
  goalFooter: { flexDirection: 'row', justifyContent: 'space-between' },
  goalFooterText: { fontSize: 12, color: COLORS.textMuted },
  goalEditText: { fontSize: 12, color: COLORS.accent, fontWeight: '600' },
  goalEmpty: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  goalEmptyIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: COLORS.accent + '22', justifyContent: 'center', alignItems: 'center' },
  goalEmptyTitle: { fontSize: 15, fontWeight: '600', color: COLORS.text },
  goalEmptySub: { fontSize: 12, color: COLORS.textMuted, marginTop: 2 },
  bannerContainer: { alignItems: 'center', marginBottom: 16, borderRadius: 12, overflow: 'hidden', backgroundColor: COLORS.card, minHeight: 50 },
  statsRow: { flexDirection: 'row', backgroundColor: COLORS.card, borderRadius: 16, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: COLORS.border },
  statCard: { flex: 1, alignItems: 'center' },
  statLabel: { fontSize: 11, color: COLORS.textMuted, marginBottom: 6, letterSpacing: 1, textTransform: 'uppercase' },
  statValue: { fontSize: 16, fontWeight: '800', color: COLORS.text, letterSpacing: -0.5, width: '100%', textAlign: 'center' },
  statDivider: { width: 1, backgroundColor: COLORS.border, marginHorizontal: 8 },
  insightsCard: { backgroundColor: COLORS.card, borderRadius: 16, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: COLORS.border },
  insightsTitle: { fontSize: 15, fontWeight: '700', color: COLORS.text, marginBottom: 12 },
  insightText: { fontSize: 13, color: COLORS.textMuted, marginBottom: 8, lineHeight: 20 },
  section: { marginBottom: 24 },
  sectionTitle: { fontSize: 11, fontWeight: '800', color: COLORS.textMuted, marginBottom: 14, letterSpacing: 1.5, textTransform: 'uppercase' },
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
  txCategory: { fontSize: 15, fontWeight: '600', color: COLORS.text, letterSpacing: -0.2 },
  txNote: { fontSize: 12, color: COLORS.textMuted, marginTop: 2 },
  txAmount: { fontSize: 14, fontWeight: '800', color: COLORS.accentGreen, letterSpacing: -0.5, maxWidth: 100, textAlign: 'right' },
  empty: { alignItems: 'center', marginTop: 60 },
  emptyText: { fontSize: 18, color: COLORS.textMuted, marginTop: 12, fontWeight: '600' },
  emptySub: { fontSize: 14, color: COLORS.textMuted, marginTop: 6 },
  fab: { position: 'absolute', bottom: 24, right: 24, width: 58, height: 58, borderRadius: 29, backgroundColor: COLORS.accent, justifyContent: 'center', alignItems: 'center', shadowColor: COLORS.accent, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 8, elevation: 8 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: COLORS.card, borderRadius: 24, padding: 24, margin: 16, borderWidth: 1, borderColor: COLORS.border },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  modalTitle: { fontSize: 18, fontWeight: '800', color: COLORS.text },
  modalSubtitle: { fontSize: 13, color: COLORS.textMuted, marginBottom: 20, lineHeight: 20 },
  modalLabel: { fontSize: 13, color: COLORS.textMuted, marginBottom: 8 },
  modalInput: { backgroundColor: COLORS.cardAlt, borderRadius: 12, padding: 14, color: COLORS.text, fontSize: 16, borderWidth: 1, borderColor: COLORS.border, marginBottom: 16 },
  modalSaveBtn: { backgroundColor: COLORS.accent, borderRadius: 12, padding: 16, alignItems: 'center', marginBottom: 10 },
  modalSaveBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  modalClearBtn: { backgroundColor: COLORS.cardAlt, borderRadius: 12, padding: 14, alignItems: 'center', borderWidth: 1, borderColor: COLORS.border },
  modalClearBtnText: { color: COLORS.accentRed, fontWeight: '600', fontSize: 14 },
})