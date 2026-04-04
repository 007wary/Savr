import { useState } from 'react'
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, ScrollView, Alert, KeyboardAvoidingView,
  Platform, Switch
} from 'react-native'
import DateTimePicker from '@react-native-community/datetimepicker'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../../src/lib/supabase'
import { COLORS, CATEGORIES } from '../../src/constants/theme'
import { checkBudgetAlerts } from '../../src/lib/notifications'

const FREQUENCIES = [
  { label: 'Daily', value: 'daily', icon: '📅' },
  { label: 'Weekly', value: 'weekly', icon: '📆' },
  { label: 'Monthly', value: 'monthly', icon: '🗓️' },
]

export default function AddExpense() {
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [selectedCategory, setSelectedCategory] = useState(null)
  const [date, setDate] = useState(new Date())
  const [showDatePicker, setShowDatePicker] = useState(false)
  const [loading, setLoading] = useState(false)

  // Recurring
  const [isRecurring, setIsRecurring] = useState(false)
  const [frequency, setFrequency] = useState('monthly')

  function formatDate(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }

  function formatDisplayDate(d) {
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })
  }

  async function handleAdd() {
    if (!amount || !selectedCategory) {
      return Alert.alert('Missing info', 'Please enter an amount and select a category')
    }
    if (isNaN(parseFloat(amount))) {
      return Alert.alert('Invalid amount', 'Please enter a valid number')
    }

    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()

    if (isRecurring) {
      // Save to recurring_expenses
      const { error } = await supabase.from('recurring_expenses').insert({
        user_id: user.id,
        amount: parseFloat(amount),
        category: selectedCategory,
        note: note.trim(),
        frequency,
        next_due: formatDate(date),
        is_active: true,
      })

      if (error) {
        Alert.alert('Error', error.message)
      } else {
        Alert.alert('🔄 Recurring Added!', `This expense will auto-log ${frequency}`)
        resetForm()
      }
    } else {
      // Save as regular expense
      const { error } = await supabase.from('expenses').insert({
        user_id: user.id,
        amount: parseFloat(amount),
        category: selectedCategory,
        note: note.trim(),
        date: formatDate(date),
      })

      if (error) {
        Alert.alert('Error', error.message)
      } else {
        Alert.alert('✅ Saved!', 'Expense added successfully')

        // Check budget alerts
        const now = new Date()
        const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
        const [{ data: allExpenses }, { data: budgets }] = await Promise.all([
          supabase.from('expenses').select('*').eq('user_id', user.id),
          supabase.from('budgets').select('*').eq('user_id', user.id).eq('month', currentMonth)
        ])
        if (allExpenses && budgets && budgets.length > 0) {
          await checkBudgetAlerts(allExpenses, budgets, currentMonth)
        }

        resetForm()
      }
    }

    setLoading(false)
  }

  function resetForm() {
    setAmount('')
    setNote('')
    setSelectedCategory(null)
    setDate(new Date())
    setIsRecurring(false)
    setFrequency('monthly')
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={{ flex: 1, backgroundColor: COLORS.bg }}
    >
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Text style={styles.heading}>Add Expense</Text>

        {/* Amount */}
        <Text style={styles.label}>Amount (₹)</Text>
        <TextInput
          style={styles.input}
          placeholder="0.00"
          placeholderTextColor={COLORS.textMuted}
          value={amount}
          onChangeText={setAmount}
          keyboardType="numeric"
        />

        {/* Category */}
        <Text style={styles.label}>Category</Text>
        <View style={styles.categoryGrid}>
          {CATEGORIES.map((cat) => (
            <TouchableOpacity
              key={cat.label}
              style={[
                styles.categoryBtn,
                selectedCategory === cat.label && { backgroundColor: cat.color, borderColor: cat.color }
              ]}
              onPress={() => setSelectedCategory(cat.label)}
            >
              <Text style={styles.categoryIcon}>{cat.icon}</Text>
              <Text style={[
                styles.categoryLabel,
                selectedCategory === cat.label && { color: '#fff' }
              ]}>
                {cat.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Date Picker */}
        <Text style={styles.label}>{isRecurring ? 'First Due Date' : 'Date'}</Text>
        <TouchableOpacity style={styles.datePicker} onPress={() => setShowDatePicker(true)}>
          <Text style={styles.dateIcon}>📅</Text>
          <Text style={styles.dateText}>{formatDisplayDate(date)}</Text>
        </TouchableOpacity>

        {showDatePicker && (
          <DateTimePicker
            value={date}
            mode="date"
            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
            onChange={(event, selectedDate) => {
              setShowDatePicker(Platform.OS === 'ios')
              if (selectedDate) setDate(selectedDate)
            }}
          />
        )}

        {/* Note */}
        <Text style={styles.label}>Note (optional)</Text>
        <TextInput
          style={[styles.input, { height: 80, textAlignVertical: 'top' }]}
          placeholder="What was this for?"
          placeholderTextColor={COLORS.textMuted}
          value={note}
          onChangeText={setNote}
          multiline
        />

        {/* Recurring Toggle */}
        <View style={styles.recurringToggleRow}>
          <View style={styles.recurringToggleLeft}>
            <View style={styles.recurringIconBox}>
              <Ionicons name="repeat" size={18} color={COLORS.accent} />
            </View>
            <View>
              <Text style={styles.recurringToggleTitle}>Repeat this expense</Text>
              <Text style={styles.recurringToggleSub}>Auto-log daily, weekly or monthly</Text>
            </View>
          </View>
          <Switch
            value={isRecurring}
            onValueChange={setIsRecurring}
            trackColor={{ false: COLORS.border, true: COLORS.accent }}
            thumbColor="#fff"
          />
        </View>

        {/* Frequency selector — only when recurring is on */}
        {isRecurring && (
          <View style={styles.frequencySection}>
            <Text style={styles.label}>Repeat every</Text>
            <View style={styles.freqRow}>
              {FREQUENCIES.map(f => (
                <TouchableOpacity
                  key={f.value}
                  style={[
                    styles.freqBtn,
                    frequency === f.value && styles.freqBtnActive
                  ]}
                  onPress={() => setFrequency(f.value)}
                >
                  <Text style={{ fontSize: 16 }}>{f.icon}</Text>
                  <Text style={[
                    styles.freqLabel,
                    frequency === f.value && { color: '#fff' }
                  ]}>
                    {f.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {/* Submit */}
        <TouchableOpacity
          style={[styles.btn, isRecurring && { backgroundColor: COLORS.accentGreen }]}
          onPress={handleAdd}
          disabled={loading}
        >
          <Ionicons
            name={isRecurring ? 'repeat' : 'checkmark'}
            size={18}
            color="#fff"
            style={{ marginRight: 8 }}
          />
          <Text style={styles.btnText}>
            {loading ? 'Saving...' : isRecurring ? 'Add Recurring Expense' : 'Add Expense'}
          </Text>
        </TouchableOpacity>

      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: { padding: 24, paddingTop: 60 },
  heading: { fontSize: 26, fontWeight: '700', color: COLORS.text, marginBottom: 28 },
  label: { fontSize: 13, color: COLORS.textMuted, marginBottom: 8, marginLeft: 2 },
  input: {
    backgroundColor: COLORS.card, borderRadius: 12, padding: 16,
    color: COLORS.text, fontSize: 15, borderWidth: 1,
    borderColor: COLORS.border, marginBottom: 20,
  },
  categoryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 20 },
  categoryBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingVertical: 10, paddingHorizontal: 14, borderRadius: 10,
    borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.card,
  },
  categoryIcon: { fontSize: 16 },
  categoryLabel: { fontSize: 13, color: COLORS.textMuted, fontWeight: '500' },
  datePicker: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: COLORS.card, borderRadius: 12, padding: 16,
    marginBottom: 20, borderWidth: 1, borderColor: COLORS.border,
  },
  dateIcon: { fontSize: 18 },
  dateText: { fontSize: 15, color: COLORS.text, fontWeight: '500' },
  recurringToggleRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: COLORS.card, borderRadius: 14, padding: 16,
    borderWidth: 1, borderColor: COLORS.border, marginBottom: 16,
  },
  recurringToggleLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  recurringIconBox: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: COLORS.accent + '22',
    justifyContent: 'center', alignItems: 'center',
  },
  recurringToggleTitle: { fontSize: 15, fontWeight: '600', color: COLORS.text },
  recurringToggleSub: { fontSize: 12, color: COLORS.textMuted, marginTop: 2 },
  frequencySection: {
    backgroundColor: COLORS.card, borderRadius: 14, padding: 16,
    borderWidth: 1, borderColor: COLORS.border, marginBottom: 16,
  },
  freqRow: { flexDirection: 'row', gap: 10 },
  freqBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 12, borderRadius: 12,
    borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.cardAlt,
  },
  freqBtnActive: { backgroundColor: COLORS.accentGreen, borderColor: COLORS.accentGreen },
  freqLabel: { fontSize: 13, color: COLORS.textMuted, fontWeight: '600' },
  btn: {
    flexDirection: 'row', justifyContent: 'center', alignItems: 'center',
    backgroundColor: COLORS.accent, borderRadius: 12, padding: 16,
    marginTop: 8, marginBottom: 40,
  },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
})