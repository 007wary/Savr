import { useState, useCallback } from 'react'
import {
  View, Text, StyleSheet, ScrollView,
  TouchableOpacity, RefreshControl
} from 'react-native'
import { useFocusEffect } from 'expo-router'
import { supabase } from '../../src/lib/supabase'
import { COLORS, CATEGORIES } from '../../src/constants/theme'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'

export default function Dashboard() {
  const [expenses, setExpenses] = useState([])
  const [userName, setUserName] = useState('')
  const [refreshing, setRefreshing] = useState(false)
  const router = useRouter()

  const now = new Date()
const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
const monthName = now.toLocaleString('default', { month: 'long', year: 'numeric' })

  async function fetchData() {
  const { data: { user } } = await supabase.auth.getUser()
  setUserName(user.email.split('@')[0])

  const { data } = await supabase
    .from('expenses')
    .select('*')
    .eq('user_id', user.id)
    .order('date', { ascending: false })

  if (data) {
    const now = new Date()
    const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    const filtered = data.filter(e => e.date.startsWith(month))
    setExpenses(filtered)
  }
  setRefreshing(false)
}

  useFocusEffect(useCallback(() => { fetchData() }, []))

  // Calculate total
  const total = expenses.reduce((sum, e) => sum + parseFloat(e.amount), 0)

  // Calculate by category
  const byCategory = CATEGORIES.map(cat => {
    const catExpenses = expenses.filter(e => e.category === cat.label)
    const catTotal = catExpenses.reduce((sum, e) => sum + parseFloat(e.amount), 0)
    return { ...cat, total: catTotal }
  }).filter(c => c.total > 0).sort((a, b) => b.total - a.total)

  // Recent 5 expenses
  const recent = expenses.slice(0, 5)

  function getCategoryInfo(label) {
    return CATEGORIES.find(c => c.label === label) || { icon: '📦', color: '#888' }
  }

  return (
  <View style={{ flex: 1 }}>
  <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingBottom: 40 }}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchData() }} tintColor={COLORS.accent} />
      }
    >
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>Hey, {userName} 👋</Text>
          <Text style={styles.month}>{monthName}</Text>
        </View>
      </View>

      {/* Total Card */}
      <View style={styles.totalCard}>
        <Text style={styles.totalLabel}>Total Spent This Month</Text>
        <Text style={styles.totalAmount}>₹{total.toFixed(2)}</Text>
        <Text style={styles.totalSub}>{expenses.length} transactions</Text>
      </View>

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
                  <Text style={styles.catAmount}>₹{cat.total.toFixed(2)}</Text>
                </View>
                {/* Progress bar */}
                <View style={styles.progressBg}>
                  <View style={[
                    styles.progressFill,
                    {
                      width: `${Math.min((cat.total / total) * 100, 100)}%`,
                      backgroundColor: cat.color
                    }
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
                  <Text style={styles.txNote}>{item.note || item.date}</Text>
                </View>
                <Text style={styles.txAmount}>₹{parseFloat(item.amount).toFixed(2)}</Text>
              </View>
            )
          })}
        </View>
      )}

      {/* Empty state */}
      {expenses.length === 0 && (
        <View style={styles.empty}>
          <Text style={{ fontSize: 48 }}>📊</Text>
          <Text style={styles.emptyText}>No expenses this month</Text>
          <Text style={styles.emptySub}>Tap ➕ to start tracking</Text>
        </View>
      )}
    </ScrollView>

    {/* Floating Add Button */}
    <TouchableOpacity
      style={styles.fab}
      onPress={() => router.push('/(tabs)/add')}
      activeOpacity={0.85}
    >
      <Ionicons name="add" size={28} color="#fff" />
    </TouchableOpacity>

  </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg, paddingTop: 60, paddingHorizontal: 20 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 },
  greeting: { fontSize: 22, fontWeight: '700', color: COLORS.text },
  month: { fontSize: 13, color: COLORS.textMuted, marginTop: 2 },
  signOutBtn: { paddingVertical: 6, paddingHorizontal: 12, backgroundColor: COLORS.card, borderRadius: 8, borderWidth: 1, borderColor: COLORS.border },
  signOutText: { color: COLORS.textMuted, fontSize: 12 },
  totalCard: {
    backgroundColor: COLORS.accent,
    borderRadius: 20,
    padding: 24,
    marginBottom: 24,
    alignItems: 'center',
  },
  totalLabel: { fontSize: 13, color: 'rgba(255,255,255,0.7)', marginBottom: 8 },
  totalAmount: { fontSize: 42, fontWeight: '800', color: '#fff' },
  totalSub: { fontSize: 13, color: 'rgba(255,255,255,0.6)', marginTop: 6 },
  section: { marginBottom: 24 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: COLORS.text, marginBottom: 14 },
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
  position: 'absolute',
  bottom: 24,
  right: 24,
  width: 58,
  height: 58,
  borderRadius: 29,
  backgroundColor: COLORS.accent,
  justifyContent: 'center',
  alignItems: 'center',
  shadowColor: COLORS.accent,
  shadowOffset: { width: 0, height: 4 },
  shadowOpacity: 0.4,
  shadowRadius: 8,
  elevation: 8,
},
})