import { useState } from 'react'
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, ScrollView, Alert, KeyboardAvoidingView,
  Platform
} from 'react-native'
import DateTimePicker from '@react-native-community/datetimepicker'
import { supabase } from '../../src/lib/supabase'
import { COLORS, CATEGORIES } from '../../src/constants/theme'

export default function AddExpense() {
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [selectedCategory, setSelectedCategory] = useState(null)
  const [date, setDate] = useState(new Date())
  const [showDatePicker, setShowDatePicker] = useState(false)
  const [loading, setLoading] = useState(false)

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
      setAmount('')
      setNote('')
      setSelectedCategory(null)
      setDate(new Date())
    }
    setLoading(false)
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
        <Text style={styles.label}>Date</Text>
        <TouchableOpacity
          style={styles.datePicker}
          onPress={() => setShowDatePicker(true)}
        >
          <Text style={styles.dateIcon}>📅</Text>
          <Text style={styles.dateText}>{formatDisplayDate(date)}</Text>
        </TouchableOpacity>

        {showDatePicker && (
          <DateTimePicker
            value={date}
            mode="date"
            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
            maximumDate={new Date()}
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

        {/* Submit */}
        <TouchableOpacity style={styles.btn} onPress={handleAdd} disabled={loading}>
          <Text style={styles.btnText}>{loading ? 'Saving...' : 'Add Expense'}</Text>
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
    backgroundColor: COLORS.card,
    borderRadius: 12,
    padding: 16,
    color: COLORS.text,
    fontSize: 15,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 20,
  },
  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 20,
  },
  categoryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.card,
  },
  categoryIcon: { fontSize: 16 },
  categoryLabel: { fontSize: 13, color: COLORS.textMuted, fontWeight: '500' },
  datePicker: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.card,
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 10,
  },
  dateIcon: { fontSize: 18 },
  dateText: { fontSize: 15, color: COLORS.text, fontWeight: '500' },
  btn: {
    backgroundColor: COLORS.accent,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 40,
  },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
})