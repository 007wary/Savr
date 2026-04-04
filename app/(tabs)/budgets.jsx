import { useState, useCallback } from 'react'
import {
  View, Text, StyleSheet, ScrollView,
  TouchableOpacity, TextInput, Alert, RefreshControl
} from 'react-native'
import { useFocusEffect } from 'expo-router'
import { supabase } from '../../src/lib/supabase'
import { COLORS, CATEGORIES } from '../../src/constants/theme'
import { getCurrencySymbol } from '../../src/lib/currency'

export default function Budgets() {
  const [budgets, setBudgets] = useState([])
  const [expenses, setExpenses] = useState([])
  const [editing, setEditing] = useState(null)
  const [inputValue, setInputValue] = useState('')
  const [refreshing, setRefreshing] = useState(false)
  const [currencySymbol, setCurrencySymbol] = useState('₹')

  const now = new Date()
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const monthName = now.toLocaleString('default', { month: 'long', year: 'numeric' })

  async function fetchData() {
    const { data: { user } } = await supabase.auth.getUser()
    const symbol = await getCurrencySymbol()
    setCurrencySymbol(symbol)

    const [{ data: budgetData }, { data: expenseData }] = await Promise.all([
      supabase.from('budgets').select('*').eq('user_id', user.id).eq('month', currentMonth),
      supabase.from('expenses').select('*').eq('user_id', user.id)
    ])

    if (budgetData) setBudgets(budgetData)
    if (expenseData) {
      const filtered = expenseData.filter(e => e.date.startsWith(currentMonth))
      setExpenses(filtered)
    }
    setRefreshing(false)
  }

  useFocusEffect(useCallback(() => { fetchData() }, []))

  async function saveBudget(category) {
    if (!inputValue || isNaN(parseFloat(inputValue))) {
      return Alert.alert('Invalid', 'Please enter a valid amount')
    }

    const { data: { user } } = await supabase.auth.getUser()
    const existing = budgets.find(b => b.category === category)

    if (existing) {
      await supabase.from('budgets').update({ limit_amount: parseFloat(inputValue) }).eq('id', existing.id)
    } else {
      await supabase.from('budgets').insert({
        user_id: user.id,
        category,
        limit_amount: parseFloat(inputValue),
        month: currentMonth
      })
    }

    setEditing(null)
    setInputValue('')
    fetchData()
  }

  async function deleteBudget(category) {
    const existing = budgets.find(b => b.category === category)
    if (existing) {
      await supabase.from('budgets').delete().eq('id', existing.id)
      fetchData()
    }
  }

  function getSpent(category) {
    return expenses
      .filter(e => e.category === category)
      .reduce((sum, e) => sum + parseFloat(e.amount), 0)
  }

  function getBudgetLimit(category) {
    const b = budgets.find(b => b.category === category)
    return b ? parseFloat(b.limit_amount) : null
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingBottom: 40 }}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchData() }} tintColor={COLORS.accent} />
      }
    >
      <Text style={styles.heading}>Budgets</Text>
      <Text style={styles.subheading}>{monthName}</Text>

      {CATEGORIES.map(cat => {
        const spent = getSpent(cat.label)
        const limit = getBudgetLimit(cat.label)
        const percentage = limit ? Math.min((spent / limit) * 100, 100) : 0
        const isOver = limit && spent > limit
        const isEditing = editing === cat.label

        return (
          <View key={cat.label} style={styles.card}>
            <View style={styles.cardHeader}>
              <View style={[styles.iconBox, { backgroundColor: cat.color + '22' }]}>
                <Text style={{ fontSize: 20 }}>{cat.icon}</Text>
              </View>
              <View style={styles.cardInfo}>
                <Text style={styles.catName}>{cat.label}</Text>
                <Text style={styles.spentText}>
                  Spent: <Text style={{ color: isOver ? COLORS.accentRed : COLORS.accentGreen }}>{currencySymbol}{spent.toFixed(2)}</Text>
                  {limit
                    ? <Text style={styles.limitText}> / {currencySymbol}{limit.toFixed(2)}</Text>
                    : <Text style={styles.limitText}> (no budget set)</Text>
                  }
                </Text>
              </View>
              <TouchableOpacity
                style={styles.editBtn}
                onPress={() => {
                  if (isEditing) {
                    setEditing(null)
                  } else {
                    setEditing(cat.label)
                    setInputValue(limit ? String(limit) : '')
                  }
                }}
              >
                <Text style={styles.editText}>{isEditing ? '✕' : '✏️'}</Text>
              </TouchableOpacity>
            </View>

            {limit && (
              <View style={styles.progressBg}>
                <View style={[
                  styles.progressFill,
                  { width: `${percentage}%`, backgroundColor: isOver ? COLORS.accentRed : cat.color }
                ]} />
              </View>
            )}

            {isOver && (
              <Text style={styles.overText}>
                ⚠️ Over budget by {currencySymbol}{(spent - limit).toFixed(2)}
              </Text>
            )}

            {isEditing && (
              <View style={styles.editRow}>
                <TextInput
                  style={styles.editInput}
                  placeholder={`Set budget amount`}
                  placeholderTextColor={COLORS.textMuted}
                  value={inputValue}
                  onChangeText={setInputValue}
                  keyboardType="numeric"
                  autoFocus
                />
                <TouchableOpacity style={styles.saveBtn} onPress={() => saveBudget(cat.label)}>
                  <Text style={styles.saveBtnText}>Save</Text>
                </TouchableOpacity>
                {limit && (
                  <TouchableOpacity style={styles.deleteBtn} onPress={() => deleteBudget(cat.label)}>
                    <Text style={styles.deleteBtnText}>Remove</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
          </View>
        )
      })}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg, paddingTop: 60, paddingHorizontal: 20 },
  heading: { fontSize: 26, fontWeight: '700', color: COLORS.text, marginBottom: 4 },
  subheading: { fontSize: 14, color: COLORS.textMuted, marginBottom: 24 },
  card: {
    backgroundColor: COLORS.card, borderRadius: 16,
    padding: 16, marginBottom: 12,
    borderWidth: 1, borderColor: COLORS.border,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  iconBox: { width: 44, height: 44, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  cardInfo: { flex: 1 },
  catName: { fontSize: 15, fontWeight: '600', color: COLORS.text },
  spentText: { fontSize: 13, color: COLORS.textMuted, marginTop: 2 },
  limitText: { color: COLORS.textMuted },
  editBtn: { padding: 6 },
  editText: { fontSize: 16 },
  progressBg: { height: 6, backgroundColor: COLORS.border, borderRadius: 3, marginBottom: 6 },
  progressFill: { height: 6, borderRadius: 3 },
  overText: { fontSize: 12, color: COLORS.accentRed, marginTop: 4 },
  editRow: { flexDirection: 'row', alignItems: 'center', marginTop: 12, gap: 8 },
  editInput: {
    flex: 1, backgroundColor: COLORS.cardAlt, borderRadius: 10,
    padding: 10, color: COLORS.text, fontSize: 14,
    borderWidth: 1, borderColor: COLORS.border,
  },
  saveBtn: { backgroundColor: COLORS.accent, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 14 },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  deleteBtn: { backgroundColor: COLORS.cardAlt, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 14, borderWidth: 1, borderColor: COLORS.border },
  deleteBtnText: { color: COLORS.accentRed, fontWeight: '600', fontSize: 13 },
})