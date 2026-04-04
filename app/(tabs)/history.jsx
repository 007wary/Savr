import { useState, useCallback } from 'react'
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  Alert, RefreshControl, Modal, TextInput,
  KeyboardAvoidingView, Platform, ScrollView
} from 'react-native'
import { useFocusEffect } from 'expo-router'
import { supabase } from '../../src/lib/supabase'
import { COLORS, CATEGORIES } from '../../src/constants/theme'
import * as FileSystem from 'expo-file-system/legacy'
import * as Sharing from 'expo-sharing'

export default function History() {
  const [expenses, setExpenses] = useState(null)
  const [loading, setLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [editingExpense, setEditingExpense] = useState(null)
  const [editAmount, setEditAmount] = useState('')
  const [editCategory, setEditCategory] = useState('')
  const [editNote, setEditNote] = useState('')
  const [editDate, setEditDate] = useState('')
  const [saving, setSaving] = useState(false)

  async function fetchExpenses() {
    const { data: { user } } = await supabase.auth.getUser()
    const { data, error } = await supabase
      .from('expenses')
      .select('*')
      .eq('user_id', user.id)
      .order('date', { ascending: false })

    if (!error) setExpenses(data)
    setRefreshing(false)
  }

  useFocusEffect(useCallback(() => { fetchExpenses() }, []))

  async function handleDelete(id) {
    Alert.alert('Delete Expense', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          await supabase.from('expenses').delete().eq('id', id)
          fetchExpenses()
        }
      }
    ])
  }

  function openEdit(expense) {
    setEditingExpense(expense)
    setEditAmount(String(expense.amount))
    setEditCategory(expense.category)
    setEditNote(expense.note || '')
    setEditDate(expense.date)
  }

  async function handleSaveEdit() {
    if (!editAmount || isNaN(parseFloat(editAmount))) {
      return Alert.alert('Invalid', 'Please enter a valid amount')
    }
    setSaving(true)
    const { error } = await supabase
      .from('expenses')
      .update({
        amount: parseFloat(editAmount),
        category: editCategory,
        note: editNote.trim(),
        date: editDate,
      })
      .eq('id', editingExpense.id)

    if (error) Alert.alert('Error', error.message)
    else {
      setEditingExpense(null)
      fetchExpenses()
    }
    setSaving(false)
  }

  function getCategoryInfo(label) {
    return CATEGORIES.find(c => c.label === label) || { icon: '📦', color: '#888' }
  }

  async function handleExport() {
  if (expenses.length === 0) {
    return Alert.alert('No data', 'No expenses to export')
  }

  // Build CSV content
  const headers = 'Date,Category,Amount,Note\n'
  const rows = expenses.map(e =>
    `${e.date},${e.category},${e.amount},"${e.note || ''}"`
  ).join('\n')
  const csvContent = headers + rows

  // Write to a file
  const fileUri = FileSystem.documentDirectory + 'expenses.csv'
  await FileSystem.writeAsStringAsync(fileUri, csvContent, {
    encoding: 'utf8'
  })

  // Share the file
  const isAvailable = await Sharing.isAvailableAsync()
  if (isAvailable) {
    await Sharing.shareAsync(fileUri, {
      mimeType: 'text/csv',
      dialogTitle: 'Export Expenses',
    })
  } else {
    Alert.alert('Saved', `File saved to: ${fileUri}`)
  }
}

  function renderItem({ item }) {
    const cat = getCategoryInfo(item.category)
    return (
      <TouchableOpacity style={styles.card} onPress={() => openEdit(item)}>
        <View style={[styles.iconBox, { backgroundColor: cat.color + '22' }]}>
          <Text style={styles.icon}>{cat.icon}</Text>
        </View>
        <View style={styles.info}>
          <Text style={styles.category}>{item.category}</Text>
          <Text style={styles.note}>{item.note || item.date}</Text>
        </View>
        <View style={styles.right}>
          <Text style={styles.amount}>₹{parseFloat(item.amount).toFixed(2)}</Text>
          <Text style={styles.date}>{item.date}</Text>
        </View>
        <TouchableOpacity style={styles.deleteBtn} onPress={() => handleDelete(item.id)}>
          <Text style={styles.deleteText}>✕</Text>
        </TouchableOpacity>
      </TouchableOpacity>
    )
  }

  return (
    <View style={styles.container}>
      <View style={styles.headingRow}>
  <Text style={styles.heading}>History</Text>
  <TouchableOpacity style={styles.exportBtn} onPress={handleExport}>
    <Text style={styles.exportText}>📤 Export</Text>
  </TouchableOpacity>
</View>

      {expenses !== null && expenses.length === 0 ? (
        <View style={styles.centered}>
          <Text style={{ fontSize: 48 }}>📭</Text>
          <Text style={styles.emptyText}>No expenses yet</Text>
          <Text style={styles.emptySubtext}>Tap ➕ to add your first one</Text>
        </View>
      ) : (
        <FlatList
          data={expenses || []}
          keyExtractor={item => item.id}
          renderItem={renderItem}
          contentContainerStyle={{ paddingBottom: 40 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); fetchExpenses() }}
              tintColor={COLORS.accent}
            />
          }
        />
      )}

      {/* Edit Modal */}
      <Modal
        visible={editingExpense !== null}
        animationType="slide"
        transparent
        onRequestClose={() => setEditingExpense(null)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Edit Expense</Text>

            <ScrollView keyboardShouldPersistTaps="handled">
              {/* Amount */}
              <Text style={styles.label}>Amount (₹)</Text>
              <TextInput
                style={styles.input}
                value={editAmount}
                onChangeText={setEditAmount}
                keyboardType="numeric"
                placeholderTextColor={COLORS.textMuted}
              />

              {/* Category */}
              <Text style={styles.label}>Category</Text>
              <View style={styles.categoryGrid}>
                {CATEGORIES.map(cat => (
                  <TouchableOpacity
                    key={cat.label}
                    style={[
                      styles.categoryBtn,
                      editCategory === cat.label && { backgroundColor: cat.color, borderColor: cat.color }
                    ]}
                    onPress={() => setEditCategory(cat.label)}
                  >
                    <Text style={styles.categoryIcon}>{cat.icon}</Text>
                    <Text style={[
                      styles.categoryLabel,
                      editCategory === cat.label && { color: '#fff' }
                    ]}>
                      {cat.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Date */}
              <Text style={styles.label}>Date</Text>
              <TextInput
                style={styles.input}
                value={editDate}
                onChangeText={setEditDate}
                placeholderTextColor={COLORS.textMuted}
              />

              {/* Note */}
              <Text style={styles.label}>Note (optional)</Text>
              <TextInput
                style={[styles.input, { height: 80, textAlignVertical: 'top' }]}
                value={editNote}
                onChangeText={setEditNote}
                multiline
                placeholderTextColor={COLORS.textMuted}
              />

              {/* Buttons */}
              <View style={styles.modalBtns}>
                <TouchableOpacity
                  style={styles.cancelBtn}
                  onPress={() => setEditingExpense(null)}
                >
                  <Text style={styles.cancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.saveBtn}
                  onPress={handleSaveEdit}
                  disabled={saving}
                >
                  <Text style={styles.saveBtnText}>{saving ? 'Saving...' : 'Save'}</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg, paddingTop: 60, paddingHorizontal: 20 },
  heading: { fontSize: 26, fontWeight: '700', color: COLORS.text, marginBottom: 20 },
  card: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: COLORS.card, borderRadius: 14,
    padding: 14, marginBottom: 10,
    borderWidth: 1, borderColor: COLORS.border,
  },
  iconBox: { width: 44, height: 44, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  icon: { fontSize: 20 },
  info: { flex: 1 },
  category: { fontSize: 15, fontWeight: '600', color: COLORS.text },
  note: { fontSize: 12, color: COLORS.textMuted, marginTop: 2 },
  right: { alignItems: 'flex-end', marginRight: 10 },
  amount: { fontSize: 15, fontWeight: '700', color: COLORS.accentGreen },
  date: { fontSize: 11, color: COLORS.textMuted, marginTop: 2 },
  deleteBtn: { padding: 4 },
  deleteText: { color: COLORS.accentRed, fontSize: 14, fontWeight: '700' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyText: { fontSize: 18, color: COLORS.textMuted, marginTop: 12, fontWeight: '600' },
  emptySubtext: { fontSize: 14, color: COLORS.textMuted, marginTop: 6 },
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.6)' },
  modalSheet: {
    backgroundColor: COLORS.card, borderTopLeftRadius: 24,
    borderTopRightRadius: 24, padding: 24, maxHeight: '90%',
  },
  modalHandle: { width: 40, height: 4, backgroundColor: COLORS.border, borderRadius: 2, alignSelf: 'center', marginBottom: 20 },
  modalTitle: { fontSize: 20, fontWeight: '700', color: COLORS.text, marginBottom: 20 },
  label: { fontSize: 13, color: COLORS.textMuted, marginBottom: 8, marginLeft: 2 },
  input: {
    backgroundColor: COLORS.cardAlt, borderRadius: 12, padding: 14,
    color: COLORS.text, fontSize: 15, borderWidth: 1,
    borderColor: COLORS.border, marginBottom: 16,
  },
  categoryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  categoryBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingVertical: 8, paddingHorizontal: 12, borderRadius: 10,
    borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.cardAlt,
  },
  categoryIcon: { fontSize: 14 },
  categoryLabel: { fontSize: 12, color: COLORS.textMuted, fontWeight: '500' },
  modalBtns: { flexDirection: 'row', gap: 12, marginTop: 8, marginBottom: 20 },
  cancelBtn: {
    flex: 1, borderRadius: 12, padding: 14, alignItems: 'center',
    borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.cardAlt,
  },
  cancelText: { color: COLORS.textMuted, fontWeight: '600', fontSize: 15 },
  saveBtn: { flex: 1, backgroundColor: COLORS.accent, borderRadius: 12, padding: 14, alignItems: 'center' },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  headingRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
exportBtn: { backgroundColor: COLORS.card, borderRadius: 10, paddingVertical: 8, paddingHorizontal: 14, borderWidth: 1, borderColor: COLORS.border },
exportText: { color: COLORS.accent, fontWeight: '600', fontSize: 13 },
})