import { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl, TextInput, Modal, KeyboardAvoidingView, Platform, Image } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { useFocusEffect, useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { COLORS, CATEGORIES, SCREEN } from '../../src/constants/theme'
import { DashboardSkeleton } from '../../src/components/SkeletonLoader'
import { getCurrencySymbol, loadCurrency, formatAmount } from '../../src/lib/currency'
import { saveCache, loadCache } from '../../src/lib/cache'
import { getUser, getCachedUser } from '../../src/lib/auth'
import { checkWeeklySummary, checkBudgetAlerts } from '../../src/lib/notifications'
import { saveGoal, loadGoal, clearGoal } from '../../src/lib/spendingGoal'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { getExpenses, getMonthlyTotal, getRecurring, getMonthlyIncomeTotal, getAccountsTotal, getTodayIncomeTotal, getBudgets } from '../../src/services/sqliteService'
import CustomAlert from '../../src/components/CustomAlert'
import useAlert from '../../src/hooks/useAlert'

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

function getMonthInfo(offset) {
  const d = new Date()
  d.setDate(1)
  d.setMonth(d.getMonth() + offset)
  const month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  const name = d.toLocaleString('default', { month: 'long', year: 'numeric' })
  const totalDays = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
  return { month, name, totalDays }
}

function sortExpenses(data) {
  return [...data].sort((a, b) => {
    if (b.date !== a.date) return b.date.localeCompare(a.date)
    return new Date(b.created_at || 0) - new Date(a.created_at || 0)
  })
}

function getCategoryInfo(label) {
  return CATEGORIES.find(c => c.label === label) || { icon: 'grid-outline', color: '#888' }
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

export default function Dashboard() {
  const [expenses, setExpenses] = useState([])
  const [userName, setUserName] = useState('')
  const [refreshing, setRefreshing] = useState(false)
  const [loading, setLoading] = useState(true)
  const [monthLoading, setMonthLoading] = useState(false)
  const [lastMonthTotal, setLastMonthTotal] = useState(0)
  const [daysInMonth, setDaysInMonth] = useState(1)
  const [currencySymbol, setCurrencySymbol] = useState('₹')
  const [currencyCode, setCurrencyCode] = useState('INR')
  const [spendingGoal, setSpendingGoal] = useState(null)
  const [showGoalModal, setShowGoalModal] = useState(false)
  const [goalInput, setGoalInput] = useState('')
  const [recurringTotal, setRecurringTotal] = useState(0)
  const [recurringCount, setRecurringCount] = useState(0)
  const [monthlyIncome, setMonthlyIncome] = useState(0)
  const [accountsTotal, setAccountsTotal] = useState({ total: 0, count: 0 })
  const [todayIncome, setTodayIncome] = useState(0)
  const [avatarUrl, setAvatarUrl] = useState(null)
  const [userInitials, setUserInitials] = useState('??')
  const [goalBanner, setGoalBanner] = useState(null)
  const { alertConfig, showAlert, hideAlert } = useAlert()
  const router = useRouter()
  const userRef = useRef(null)
  const isFocusedRef = useRef(false)
  const backupTimerRef = useRef(null)
  const backupExistsRef = useRef(null)
const syncTokenRef = useRef(0)
const fetchDataRef = useRef(null)

  const { month: currentMonth, name: monthName } = getMonthInfo(0)
const isCurrentMonth = true

  useEffect(() => {
    async function loadAvatarFromStorage() {
      try {
        const saved = await AsyncStorage.getItem('savr_avatar_url')
        if (saved) setAvatarUrl(saved)
      } catch {}
    }
    loadAvatarFromStorage()
  }, [])

  async function fetchData(forceRefresh = false) {
    fetchDataRef.current = fetchData
    const { month: offsetMonth } = getMonthInfo(monthOffset)
const cacheKey = `savr_cache_dashboard_${offsetMonth}`
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
        setRecurringTotal(cached.recurringTotal || 0)
        setRecurringCount(cached.recurringCount || 0)
        setMonthlyIncome(cached.monthlyIncome || 0)
        setAccountsTotal(cached.accountsTotal || { total: 0, count: 0 })
        setTodayIncome(cached.todayIncome || 0)
        if (cached.avatarUrl) setAvatarUrl(cached.avatarUrl)
        if (cached.userInitials) setUserInitials(cached.userInitials)
        setLoading(false)
        setMonthLoading(false)
        setTimeout(() => syncFromSQLite(cacheKey, monthOffset), 100)
        return
      }
    }
    await syncFromSQLite(cacheKey, monthOffset)
  }

  async function syncFromSQLite(cacheKey, offsetSnapshot) {
    const token = ++syncTokenRef.current
    try {
      const user = getCachedUser() || userRef.current || await getUser()
      if (!user) { setLoading(false); setRefreshing(false); setMonthLoading(false); return }
      if (!isFocusedRef.current) { setLoading(false); setRefreshing(false); setMonthLoading(false); return }
      if (!userRef.current) userRef.current = user
      const meta = user.user_metadata?.display_name || user.user_metadata?.full_name
      const emailName = user.email.split('@')[0]
      const firstName = meta ? meta.split(' ')[0] : emailName
      const fullName = meta || emailName
      const nameParts = fullName.trim().split(' ')
      const initials = nameParts.length >= 2
        ? (nameParts[0][0] + nameParts[nameParts.length - 1][0]).toUpperCase()
        : fullName.slice(0, 2).toUpperCase()
      setUserInitials(initials)

      const avatar = user.user_metadata?.picture || user.user_metadata?.avatar_url || null
      setAvatarUrl(avatar)
      if (avatar) {
        try {
          await AsyncStorage.setItem('savr_avatar_url', avatar)
        } catch {}
      }
      const symbol = await getCurrencySymbol()
      const code = await loadCurrency()
      const lastMonthInfo = getMonthInfo(offsetSnapshot - 1)
      const todayDate = new Date()
      const todayStr = `${todayDate.getFullYear()}-${String(todayDate.getMonth() + 1).padStart(2, '0')}-${String(todayDate.getDate()).padStart(2, '0')}`
      const { month: snapshotMonth } = getMonthInfo(offsetSnapshot)
      const [currentExpenses, lastTotal, recurringItems, incomeTotal, accTotal, todayIncomeTotal, budgets] = await Promise.all([
        getExpenses(user.id, { month: snapshotMonth }),
        getMonthlyTotal(user.id, lastMonthInfo.month),
        getRecurring(user.id),
        getMonthlyIncomeTotal(user.id, snapshotMonth),
        getAccountsTotal(user.id),
        getTodayIncomeTotal(user.id, todayStr),
        getBudgets(user.id, snapshotMonth),
      ])
      const filtered = sortExpenses(currentExpenses)
      const now = new Date()

      let daysElapsed
      if (offsetSnapshot === 0) {
        daysElapsed = now.getDate()
      } else {
        const { totalDays } = getMonthInfo(offsetSnapshot)
        daysElapsed = totalDays
      }

      const recTotal = recurringItems.reduce((sum, r) => sum + parseFloat(r.amount), 0)
      const recCount = recurringItems.length

      await saveCache(cacheKey, {
        expenses: filtered, userName: firstName, lastMonthTotal: lastTotal,
        daysInMonth: daysElapsed, currencySymbol: symbol, currencyCode: code,
        recurringTotal: recTotal, recurringCount: recCount, monthlyIncome: incomeTotal, accountsTotal: accTotal, todayIncome: todayIncomeTotal, avatarUrl: avatar, userInitials: initials,
        savedAt: Date.now(),
      })

      if (!isFocusedRef.current || token !== syncTokenRef.current) return
      setExpenses(filtered)
      setUserName(firstName)
      setLastMonthTotal(lastTotal)
      setDaysInMonth(daysElapsed)
      setCurrencySymbol(symbol)
      setCurrencyCode(code)
      setRecurringTotal(recTotal)
      setRecurringCount(recCount)
      setMonthlyIncome(incomeTotal)
      setAccountsTotal(accTotal)
      setTodayIncome(todayIncomeTotal)
      const goal = await loadGoal(user.id)
      if (goal !== null) setSpendingGoal(goal)

      if (offsetSnapshot === 0) {
        const allRecentExpenses = await getExpenses(user.id)
        checkWeeklySummary(allRecentExpenses)
        checkBudgetAlerts(filtered, budgets, snapshotMonth).catch(() => {})
        let currentStreak = 0
        for (let i = 0; i < 30; i++) {
          const d = new Date()
          d.setDate(d.getDate() - i)
          const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
          if (allRecentExpenses.some(e => e.date === dateStr)) currentStreak++
          else break
        }
        setStreak(currentStreak)
        import('../../src/lib/notifications').then(({ scheduleStreakReminder }) => {
          scheduleStreakReminder(currentStreak).catch(() => {})
        }).catch(() => {})
      } else {
        setStreak(0)
      }

      try {
        const shouldRequest = await AsyncStorage.getItem('savr_request_notif_after_load')
        if (shouldRequest === 'true') {
          await AsyncStorage.removeItem('savr_request_notif_after_load')
          const notifAsked = await AsyncStorage.getItem('savr_notif_asked')
          if (!notifAsked) {
            await AsyncStorage.setItem('savr_notif_asked', 'true')
            const { requestNotificationPermission, isNotificationGranted } = await import('../../src/lib/notifications')
            const alreadyGranted = await isNotificationGranted()
            if (!alreadyGranted) {
              setTimeout(() => requestNotificationPermission(), 8000)
            }
          }
        }
      } catch {}

    } catch (e) {}
    finally {
      setLoading(false)
      setRefreshing(false)
      setMonthLoading(false)
    }
  }

  useFocusEffect(useCallback(() => {
    isFocusedRef.current = true
    fetchData()

    if (backupTimerRef.current) clearTimeout(backupTimerRef.current)
    backupTimerRef.current = setTimeout(async () => {
      if (!isFocusedRef.current) return
      try {
        const restoreOffered = await AsyncStorage.getItem('savr_restore_offered')
        if (restoreOffered) return
        let user = getCachedUser() || await getUser()
        if (!user) return
        const { getExpenses: getExp } = await import('../../src/services/sqliteService')
        const localExpenses = await getExp(user.id)
        if (localExpenses.length > 0) return
        if (backupExistsRef.current === null) {
          const { checkBackupExists } = await import('../../src/services/driveBackupService')
          const backupInfo = await checkBackupExists()
          backupExistsRef.current = backupInfo?.exists ? true : false
        }
        if (!isFocusedRef.current) return
        if (backupExistsRef.current === true) {
          showAlert(
            '☁️ Backup Found!',
            'We found a Savr backup in your Google Drive. Would you like to restore your data?',
            [
              {
                text: 'Skip',
                style: 'cancel',
                onPress: async () => {
                  await AsyncStorage.setItem('savr_restore_offered', 'true')
                  backupExistsRef.current = false
                }
              },
              {
                text: 'Restore',
                onPress: async () => {
                  try {
                    const { restoreFromDrive } = await import('../../src/services/driveBackupService')
                    await AsyncStorage.setItem('savr_restore_offered', 'true')
                    backupExistsRef.current = false
                    const result = await restoreFromDrive()
                    if (result.success) {
                      showAlert('✅ Restored!', `${result.expenseCount} expenses restored successfully.`, [
                        {
                          text: 'OK',
                          onPress: () => fetchDataRef.current?.(true)
                        }
                      ])
                    } else if (result.error === 'BACKUP_USER_MISMATCH') {
                      showAlert(
                        'Wrong account',
                        'This backup belongs to a different Savr account. Sign in with the same Google account that created the backup.',
                      )
                    } else {
                      showAlert('Failed', result.error || 'Restore failed.')
                    }
                  } catch {
                    showAlert('Failed', 'Something went wrong.')
                  }
                }
              }
            ]
          )
        }
      } catch {}
    }, 2000)

    return () => {
      isFocusedRef.current = false
      if (backupTimerRef.current) clearTimeout(backupTimerRef.current)
      hideAlert()
    }
  }, []))

  async function handleSaveGoal() {
  const amount = parseFloat(goalInput)
  if (!goalInput || isNaN(amount) || amount <= 0) return
  const user = getCachedUser() || userRef.current || await getUser()
  if (!user) return
  const isFirstTime = !spendingGoal
  await saveGoal(user.id, amount)
  setSpendingGoal(amount)
  setShowGoalModal(false)
  setGoalInput('')
  setGoalBanner({ type: isFirstTime ? 'first' : 'updated', amount })
  setTimeout(() => setGoalBanner(null), 3500)
}

  async function handleClearGoal() {
    const user = getCachedUser() || userRef.current || await getUser()
    if (!user) return
    await clearGoal(user.id)
    setSpendingGoal(null)
    setShowGoalModal(false)
    setGoalInput('')
  }

  const { total, todayExpenses, todayTotal } = useMemo(() => {
  const now = new Date()
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  const todayExpenses = expenses.filter(e => e.date === todayStr)
  const todayTotal = todayExpenses.reduce((sum, e) => sum + parseFloat(e.amount), 0)
  const total = expenses.reduce((sum, e) => sum + parseFloat(e.amount), 0)
  return { total, todayExpenses, todayTotal }
}, [expenses])

  const byCategory = useMemo(() => CATEGORIES.map(cat => {
    const catExpenses = expenses.filter(e => e.category === cat.label)
    const catTotal = catExpenses.reduce((sum, e) => sum + parseFloat(e.amount), 0)
    return { ...cat, total: catTotal }
  }).filter(c => c.total > 0).sort((a, b) => b.total - a.total), [expenses])

  const recent = useMemo(() => expenses.slice(0, 5), [expenses])

  const [streak, setStreak] = useState(0)

  useEffect(() => {
    if (!isCurrentMonth || streak === 0) return
    const milestones = { 7: 'Week Streak!', 30: 'Month Streak!', 100: '100 Day Streak!' }
    if (!milestones[streak]) return
    const key = `savr_milestone_${streak}`
    AsyncStorage.getItem(key).then(done => {
      if (done) return
      AsyncStorage.setItem(key, 'true')
      showAlert(
        `${streak} Day ${milestones[streak]}`,
        `You've logged expenses ${streak} days in a row. Incredible consistency — keep it up!`,
        [{ text: 'Keep going!', style: 'default' }]
      )
    }).catch(() => {})
  }, [streak, isCurrentMonth])

  const goalPercentage = spendingGoal ? Math.min((total / spendingGoal) * 100, 100) : 0
  const goalExceeded = spendingGoal && total > spendingGoal
  const goalRemaining = spendingGoal ? Math.max(spendingGoal - total, 0) : 0
  const goalColor = goalPercentage >= 100 ? COLORS.accentRed : goalPercentage >= 80 ? COLORS.accentYellow : COLORS.accentGreen

  const insights = useMemo(() => {
    if (expenses.length < 3) return []
    const result = []
    const topCat = byCategory[0]
    if (topCat) result.push(`${topCat.label} is your biggest spend at ${((topCat.total / total) * 100).toFixed(0)}% of total`)
    if (total > lastMonthTotal && lastMonthTotal > 0) result.push(`You're spending ${((total - lastMonthTotal) / lastMonthTotal * 100).toFixed(0)}% more than last month`)
    if (total < lastMonthTotal && lastMonthTotal > 0) result.push(`Great job! You're spending ${((lastMonthTotal - total) / lastMonthTotal * 100).toFixed(0)}% less than last month`)
    const dailyAvg = total / Math.max(daysInMonth, 1)
    if (dailyAvg > 500) result.push(`You're averaging ${formatAmount(dailyAvg, currencySymbol, currencyCode)}/day this month`)
    if (byCategory.length >= 3) result.push(`You've spent across ${byCategory.length} categories this month`)
    if (spendingGoal && !goalExceeded && goalPercentage >= 80) result.push(`You've used ${goalPercentage.toFixed(0)}% of your monthly goal — slow down!`)
    if (spendingGoal && goalExceeded) result.push(`You've exceeded your monthly goal of ${formatAmount(spendingGoal, currencySymbol, currencyCode)}!`)
    return result
  }, [expenses, byCategory, total, lastMonthTotal, daysInMonth, currencySymbol, currencyCode, spendingGoal, goalExceeded, goalPercentage])

  if (loading) return <DashboardSkeleton />

  const h = new Date().getHours()
  const greeting = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'

  return (
    <View style={styles.outerContainer}>
      <View style={styles.header}>
        <Text style={styles.brandText}>Savr</Text>
        <View style={styles.avatarBtn}>
          <View style={styles.avatarGreeting}>
            <Text style={styles.greetingText}>
              {greeting}
            </Text>
            <Text style={styles.greetingName} numberOfLines={1}>{userName || 'there'}</Text>
          </View>
          <TouchableOpacity onPress={() => router.push('/settings')} activeOpacity={0.8}>
            {avatarUrl ? (
              <Image source={{ uri: avatarUrl }} style={styles.avatarImage} />
            ) : (
              <View style={styles.avatarFallback}>
                <Text style={styles.avatarInitials}>{userInitials}</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={{ paddingBottom: 100 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchData(true) }} tintColor={COLORS.accent} />
        }
      >

        <LinearGradient colors={['#7C75FF', '#6C63FF', '#5A50FF']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.totalCard}>
          <View style={styles.totalRow}>
            <View style={styles.totalLeft}>
              <Text style={styles.totalLabel}>TOTAL SPENT</Text>
              <CountUp value={total} style={styles.totalAmount} symbol={currencySymbol} currencyCode={currencyCode} />
              <Text style={styles.totalSub}>{expenses.length} transactions</Text>
            </View>
            {isCurrentMonth && <>
              <View style={styles.totalDivider} />
              <View style={styles.totalRight}>
                <Text style={styles.totalLabel}>TODAY SPENT</Text>
                <CountUp value={todayTotal} style={styles.totalAmount} symbol={currencySymbol} currencyCode={currencyCode} />
                <Text style={styles.totalSub}>{todayExpenses.length} today</Text>
              </View>
            </>}
          </View>
          <View style={styles.totalHDivider} />
          <View style={styles.totalRow}>
            <View style={styles.totalLeft}>
              <Text style={styles.totalLabel}>MONTHLY INCOME</Text>
              <CountUp value={monthlyIncome} style={[styles.totalAmount, { color: '#a8ffb8' }]} symbol={currencySymbol} currencyCode={currencyCode} />
              <Text style={styles.totalSub}>this month</Text>
            </View>
            <View style={styles.totalDivider} />
            <View style={styles.totalRight}>
              <Text style={styles.totalLabel}>TODAY INCOME</Text>
              <CountUp value={todayIncome} style={[styles.totalAmount, { color: '#a8ffb8' }]} symbol={currencySymbol} currencyCode={currencyCode} />
              <Text style={styles.totalSub}>today</Text>
            </View>
          </View>
        </LinearGradient>

        {isCurrentMonth && (
          <TouchableOpacity
            style={[styles.streakCard, streak === 0 && styles.streakCardEmpty]}
            onPress={() => router.push('/(tabs)/reports')}
            activeOpacity={0.8}
          >
            <View style={[styles.streakIconBox, { backgroundColor: streak > 0 ? '#FF8C4222' : COLORS.accent + '22' }]}>
              <Ionicons
                name={streak > 0 ? 'flame' : 'flame-outline'}
                size={22}
                color={streak > 0 ? '#FF8C42' : COLORS.accent}
              />
            </View>
            <View style={{ flex: 1 }}>
              {streak > 0 ? (
                <>
                  <Text style={styles.streakTitle}>{streak} Day Streak!</Text>
                  <Text style={styles.streakSub}>Keep going — log an expense today to continue</Text>
                </>
              ) : (
                <>
                  <Text style={styles.streakTitle}>Start your streak today</Text>
                  <Text style={styles.streakSub}>Log an expense to begin your first streak</Text>
                </>
              )}
            </View>
          </TouchableOpacity>
        )}

        <View style={styles.quickStatsGrid}>
          <TouchableOpacity style={styles.quickStatCard} onPress={() => router.push('/recurring')} activeOpacity={0.8}>
            <View style={styles.quickStatHeader}>
              <Text style={styles.quickStatLabel}>RECURRING</Text>
              {recurringCount > 0 && (
                <View style={styles.quickStatBadge}>
                  <Text style={styles.quickStatBadgeText}>{recurringCount} active</Text>
                </View>
              )}
            </View>
            <Text style={styles.quickStatValue}>{formatAmount(recurringTotal, currencySymbol, currencyCode)}</Text>
            <Text style={styles.quickStatSub}>monthly</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.quickStatCard} onPress={() => router.push('/(tabs)/accounts')} activeOpacity={0.8}>
            <View style={styles.quickStatHeader}>
              <Text style={styles.quickStatLabel}>ACCOUNTS</Text>
              {accountsTotal.count > 0 && (
                <View style={styles.quickStatBadgePurple}>
                  <Text style={styles.quickStatBadgeTextPurple}>{accountsTotal.count} total</Text>
                </View>
              )}
            </View>
            <Text style={[styles.quickStatValue, { color: COLORS.accent }]}>{formatAmount(accountsTotal.total, currencySymbol, currencyCode)}</Text>
            <Text style={styles.quickStatSub}>total balance</Text>
          </TouchableOpacity>
        </View>

        {goalBanner && (
  <View style={[styles.goalBannerWrap, { backgroundColor: goalBanner.type === 'first' ? COLORS.accent : COLORS.accentGreen }]}>
    <Ionicons name={goalBanner.type === 'first' ? 'flag' : 'checkmark-circle'} size={16} color="#fff" />
    <Text style={styles.goalBannerText}>
      {goalBanner.type === 'first'
        ? `Goal set! Tracking your ${currencySymbol}${goalBanner.amount.toLocaleString('en-IN')} this month.`
        : `Goal updated to ${currencySymbol}${goalBanner.amount.toLocaleString('en-IN')}`}
    </Text>
  </View>
)}

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
                    <View style={[styles.goalIconBox, { backgroundColor: goalExceeded ? COLORS.accentRed + '22' : goalPercentage >= 80 ? COLORS.accentYellow + '22' : COLORS.accentGreen + '22' }]}>
                      <Ionicons
                        name={goalExceeded ? 'alert-circle-outline' : goalPercentage >= 80 ? 'warning-outline' : 'trophy-outline'}
                        size={20}
                        color={goalColor}
                      />
                    </View>
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

        {insights.length > 0 && (
          <View style={styles.insightsCard}>
            <View style={styles.insightsTitleRow}>
              <Ionicons name="bulb-outline" size={16} color={COLORS.accentYellow} />
              <Text style={styles.insightsTitle}>Insights</Text>
            </View>
            {insights.map((insight, i) => (
              <View key={i} style={styles.insightRow}>
                <View style={styles.insightDot} />
                <Text style={styles.insightText}>{insight}</Text>
              </View>
            ))}
          </View>
        )}

        {byCategory.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>By Category</Text>
            {byCategory.map(cat => (
              <View key={cat.label} style={styles.categoryRow}>
                <View style={[styles.catIconBox, { backgroundColor: cat.color + '22' }]}>
                  <Ionicons name={cat.icon} size={18} color={cat.color} />
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
                    <Ionicons name={cat.icon} size={18} color={cat.color} />
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
            {isCurrentMonth ? (
              <>
                <Text style={styles.emptySub}>Start tracking to see your spending insights</Text>
                <TouchableOpacity
                  style={styles.emptyBtn}
                  onPress={() => router.push('/(tabs)/add')}
                  activeOpacity={0.85}
                >
                  <Ionicons name="add-circle-outline" size={18} color="#fff" />
                  <Text style={styles.emptyBtnText}>Add your first expense</Text>
                </TouchableOpacity>
              </>
            ) : (
              <Text style={styles.emptySub}>Nothing recorded this month</Text>
            )}
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
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Ionicons name="flag-outline" size={20} color={COLORS.accent} />
                <Text style={styles.modalTitle}>Monthly Spending Goal</Text>
              </View>
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
  outerContainer: { flex: 1, backgroundColor: COLORS.bg },
  scrollView: { flex: 1, paddingHorizontal: SCREEN.paddingHorizontal },
  header: { paddingTop: SCREEN.paddingTop, paddingHorizontal: SCREEN.paddingHorizontal, paddingBottom: 8, backgroundColor: COLORS.bg, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  brandText: { fontSize: 32, fontWeight: '900', color: COLORS.accent, letterSpacing: -1 },
  avatarBtn: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatarGreeting: { alignItems: 'flex-end' },
  greetingText: { fontSize: 11, color: COLORS.textMuted },
  greetingName: { fontSize: 13, fontWeight: '700', color: COLORS.text, maxWidth: 100 },
  avatarImage: { width: 38, height: 38, borderRadius: 19, borderWidth: 2, borderColor: COLORS.accent },
  avatarFallback: { width: 38, height: 38, borderRadius: 19, backgroundColor: COLORS.accent, justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: COLORS.accent + '66' },
  avatarInitials: { fontSize: 13, fontWeight: '700', color: '#fff' },
  totalCard: { borderRadius: 24, padding: 24, marginBottom: 16 },
  totalRow: { flexDirection: 'row', alignItems: 'center', width: '100%' },
  totalLeft: { flex: 1, alignItems: 'center', paddingHorizontal: 8 },
  totalRight: { flex: 1, alignItems: 'center', paddingHorizontal: 8 },
  totalDivider: { width: 1, height: 70, backgroundColor: 'rgba(255,255,255,0.3)' },
  totalHDivider: { height: 1, backgroundColor: 'rgba(255,255,255,0.15)', marginVertical: 14 },
  totalLabel: { fontSize: 10, color: 'rgba(255,255,255,0.7)', marginBottom: 6, letterSpacing: 1.5, textTransform: 'uppercase' },
  totalAmount: { fontSize: 22, fontWeight: '900', color: '#fff', letterSpacing: -0.5, width: '100%', textAlign: 'center' },
  totalSub: { fontSize: 12, color: 'rgba(255,255,255,0.6)', marginTop: 6, letterSpacing: 0.3 },
  goalCard: { backgroundColor: COLORS.card, borderRadius: 16, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: COLORS.border },
  goalCardExceeded: { borderColor: COLORS.accentRed + '66' },
  goalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  goalHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  goalIconBox: { width: 36, height: 36, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
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
  statsRow: { flexDirection: 'row', backgroundColor: COLORS.card, borderRadius: 16, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: COLORS.border },
  statCard: { flex: 1, alignItems: 'center' },
  statLabel: { fontSize: 11, color: COLORS.textMuted, marginBottom: 6, letterSpacing: 1, textTransform: 'uppercase' },
  statValue: { fontSize: 16, fontWeight: '800', color: COLORS.text, letterSpacing: -0.5, width: '100%', textAlign: 'center' },
  statDivider: { width: 1, backgroundColor: COLORS.border, marginHorizontal: 8 },
  insightsCard: { backgroundColor: COLORS.card, borderRadius: 16, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: COLORS.border },
  insightsTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  insightsTitle: { fontSize: 15, fontWeight: '700', color: COLORS.text },
  insightRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 8 },
  insightDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: COLORS.accent, marginTop: 8 },
  insightText: { flex: 1, fontSize: 13, color: COLORS.textMuted, lineHeight: 20 },
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
  emptyBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: COLORS.accent, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 24, marginTop: 20 },
  emptyBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },
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
  quickStatsGrid: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  quickStatCard: { flex: 1, backgroundColor: COLORS.card, borderRadius: 16, padding: 14, borderWidth: 1, borderColor: COLORS.border },
  quickStatHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  quickStatLabel: { fontSize: 10, color: COLORS.textMuted, fontWeight: '700', letterSpacing: 1.2 },
  quickStatValue: { fontSize: 18, fontWeight: '800', color: COLORS.text, letterSpacing: -0.5, marginBottom: 4 },
  quickStatSub: { fontSize: 11, color: COLORS.textMuted },
  quickStatBadge: { backgroundColor: '#4CAF5022', borderRadius: 20, paddingVertical: 3, paddingHorizontal: 8, borderWidth: 1, borderColor: '#4CAF5044' },
  quickStatBadgeText: { fontSize: 10, color: '#4CAF50', fontWeight: '700' },
  quickStatBadgePurple: { backgroundColor: COLORS.accent + '22', borderRadius: 20, paddingVertical: 3, paddingHorizontal: 8, borderWidth: 1, borderColor: COLORS.accent + '44' },
  quickStatBadgeTextPurple: { fontSize: 10, color: COLORS.accent, fontWeight: '700' },
  streakCard: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: COLORS.card, borderRadius: 16, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: '#FF8C4244' },
  streakCardEmpty: { borderColor: COLORS.border },
  streakIconBox: { width: 44, height: 44, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  streakTitle: { fontSize: 15, fontWeight: '700', color: COLORS.text },
  streakSub: { fontSize: 12, color: COLORS.textMuted, marginTop: 2 },
  goalBannerWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 14 },
  goalBannerText: { flex: 1, fontSize: 13, fontWeight: '600', color: '#fff' },
})