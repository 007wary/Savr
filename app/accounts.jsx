import { useState, useRef } from 'react'
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, KeyboardAvoidingView, Platform, ActivityIndicator
} from 'react-native'
import { useFocusEffect, useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { COLORS, SCREEN } from '../src/constants/theme'
import BottomSheet from '../src/components/BottomSheet'
import CustomAlert from '../src/components/CustomAlert'
import useAlert from '../src/hooks/useAlert'
import { getUser, getCachedUser } from '../src/lib/auth'
import { formatAmount, getCurrencySymbol, loadCurrency } from '../src/lib/currency'
import { getAccounts, addAccount, updateAccount, deleteAccount } from '../src/services/sqliteService'

const ACCOUNT_TYPES = [
  { label: 'Cash', icon: 'cash-outline', color: '#4CAF50' },
  { label: 'Bank', icon: 'business-outline', color: '#2196F3' },
  { label: 'Credit Card', icon: 'card-outline', color: '#FF9800' },
  { label: 'Savings', icon: 'save-outline', color: '#9C27B0' },
  { label: 'Investment', icon: 'trending-up-outline', color: '#00BCD4' },
  { label: 'Loan', icon: 'arrow-down-circle-outline', color: '#F44336' },
  { label: 'Other', icon: 'ellipsis-horizontal-outline', color: '#607D8B' },
]

export default function Accounts() {
  const [accounts, setAccounts] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [showSheet, setShowSheet] = useState(false)
  const [editingAccount, setEditingAccount] = useState(null)
  const [name, setName] = useState('')
  const [type, setType] = useState('Cash')
  const [balance, setBalance] = useState('')
  const [currencySymbol, setCurrencySymbol] = useState('₹')
  const [currencyCode, setCurrencyCode] = useState('INR')
  const { alertConfig, showAlert, hideAlert } = useAlert()
  const router = useRouter()
  const userRef = useRef(null)

  async function fetchAccounts() {
    try {
      const symbol = await getCurrencySymbol()
      const code = await loadCurrency()
      setCurrencySymbol(symbol)
      setCurrencyCode(code)
      const user = getCachedUser() || await getUser()
      if (!user) return
      userRef.current = user
      const data = await getAccounts(user.id)
      setAccounts(data)
    } catch {}
    finally { setLoading(false) }
  }

  useFocusEffect(() => {
    fetchAccounts()
  })

  function openAdd() {
    setEditingAccount(null)
    setName('')
    setType('Cash')
    setBalance('')
    setShowSheet(true)
  }

  function openEdit(account) {
    setEditingAccount(account)
    setName(account.name)
    setType(account.type)
    setBalance(String(account.balance))
    setShowSheet(true)
  }

  async function handleSave() {
    if (!name.trim()) return showAlert('Missing info', 'Please enter an account name')
    if (balance !== '' && isNaN(parseFloat(balance))) return showAlert('Invalid', 'Please enter a valid balance')
    setSaving(true)
    try {
      const user = getCachedUser() || await getUser()
      if (!user) return
      if (editingAccount) {
        await updateAccount(editingAccount.id, {
          name: name.trim(),
          type,
          balance: parseFloat(balance) || 0,
          currency: currencyCode,
        })
        setAccounts(prev => prev.map(a =>
          a.id === editingAccount.id
            ? { ...a, name: name.trim(), type, balance: parseFloat(balance) || 0 }
            : a
        ))
      } else {
        const newId = await addAccount(user.id, {
          name: name.trim(),
          type,
          balance: parseFloat(balance) || 0,
          currency: currencyCode,
        })
        setAccounts(prev => [...prev, {
          id: newId, user_id: user.id,
          name: name.trim(), type,
          balance: parseFloat(balance) || 0,
          currency: currencyCode,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }])
      }
      setShowSheet(false)
    } catch {
      showAlert('Error', 'Could not save account. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  function handleDelete(account) {
    showAlert('Delete Account', `Delete "${account.name}"? This cannot be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          await deleteAccount(account.id)
          setAccounts(prev => prev.filter(a => a.id !== account.id))
        }
      }
    ])
  }

  const totalBalance = accounts.reduce((sum, a) => {
    const balance = parseFloat(a.balance)
    if (a.type === 'Loan') return sum - balance
    if (a.type === 'Credit Card') return balance < 0 ? sum + balance : sum + balance
    return sum + balance
  }, 0)

  function getTypeInfo(typeLabel) {
    return ACCOUNT_TYPES.find(t => t.label === typeLabel) || ACCOUNT_TYPES[ACCOUNT_TYPES.length - 1]
  }

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.bg }}>

      {/* Header */}
      <View style={[styles.header, { paddingTop: SCREEN.paddingTop }]}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={22} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Accounts</Text>
        <TouchableOpacity style={styles.addBtn} onPress={openAdd}>
          <Ionicons name="add" size={22} color="#fff" />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={COLORS.accent} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.container}>

          {/* Net Worth card */}
          {accounts.length > 0 && (
            <View style={styles.netWorthCard}>
              <Text style={styles.netWorthLabel}>NET WORTH</Text>
              <Text style={[styles.netWorthAmount, { color: totalBalance >= 0 ? '#4CAF50' : COLORS.accentRed }]}>
                {totalBalance >= 0 ? '' : '-'}{formatAmount(Math.abs(totalBalance), currencySymbol, currencyCode)}
              </Text>
              <Text style={styles.netWorthSub}>{accounts.length} account{accounts.length !== 1 ? 's' : ''}</Text>
            </View>
          )}

          {/* Account list */}
          {accounts.length === 0 ? (
            <View style={styles.empty}>
              <View style={styles.emptyIcon}>
                <Ionicons name="card-outline" size={40} color={COLORS.textMuted} />
              </View>
              <Text style={styles.emptyTitle}>No accounts yet</Text>
              <Text style={styles.emptySub}>Add your cash, bank accounts, and cards to track your net worth.</Text>
              <TouchableOpacity style={styles.emptyBtn} onPress={openAdd}>
                <Ionicons name="add" size={18} color="#fff" style={{ marginRight: 6 }} />
                <Text style={styles.emptyBtnText}>Add First Account</Text>
              </TouchableOpacity>
            </View>
          ) : (
            accounts.map(account => {
              const typeInfo = getTypeInfo(account.type)
              const isLoan = account.type === 'Loan'
              const isCreditCard = account.type === 'Credit Card'
              const balance = parseFloat(account.balance)
              const isNegative = balance < 0
              return (
                <TouchableOpacity key={account.id} style={styles.accountCard} onPress={() => openEdit(account)}>
                  <View style={[styles.accountIcon, { backgroundColor: typeInfo.color + '22' }]}>
                    <Ionicons name={typeInfo.icon} size={22} color={typeInfo.color} />
                  </View>
                  <View style={styles.accountInfo}>
                    <Text style={styles.accountName}>{account.name}</Text>
                    <Text style={styles.accountType}>{account.type}</Text>
                  </View>
                  <View style={styles.accountRight}>
                    <Text style={[styles.accountBalance, { color: isLoan || isNegative ? COLORS.accentRed : COLORS.text }]}>
                      {isLoan ? '-' : ''}{formatAmount(Math.abs(balance), currencySymbol, currencyCode)}
                    </Text>
                  </View>
                  <TouchableOpacity style={styles.deleteBtn} onPress={() => handleDelete(account)}>
                    <Ionicons name="trash-outline" size={16} color={COLORS.accentRed} />
                  </TouchableOpacity>
                </TouchableOpacity>
              )
            })
          )}
        </ScrollView>
      )}

      {/* Add / Edit Bottom Sheet */}
      <BottomSheet visible={showSheet} onClose={() => setShowSheet(false)} maxHeight="90%">
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <ScrollView keyboardShouldPersistTaps="handled">
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>{editingAccount ? 'Edit Account' : 'Add Account'}</Text>
              <TouchableOpacity onPress={() => setShowSheet(false)}>
                <Ionicons name="close" size={22} color={COLORS.textMuted} />
              </TouchableOpacity>
            </View>

            <Text style={styles.label}>Account Name</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. SBI Savings, Wallet"
              placeholderTextColor={COLORS.textMuted}
              value={name}
              onChangeText={setName}
              autoCapitalize="words"
            />

            <Text style={styles.label}>Account Type</Text>
            <View style={styles.typeGrid}>
              {ACCOUNT_TYPES.map(t => (
                <TouchableOpacity
                  key={t.label}
                  style={[styles.typeBtn, type === t.label && { backgroundColor: t.color + '22', borderColor: t.color, borderWidth: 2 }]}
                  onPress={() => setType(t.label)}
                >
                  <View style={[styles.typeIconBox, { backgroundColor: type === t.label ? t.color : COLORS.cardAlt }]}>
                    <Ionicons name={t.icon} size={18} color={type === t.label ? '#fff' : t.color} />
                  </View>
                  <Text style={[styles.typeLabel, type === t.label && { color: COLORS.text, fontWeight: '700' }]}>
                    {t.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.label}>Current Balance ({currencySymbol})</Text>
            <TextInput
              style={styles.input}
              placeholder={`${currencySymbol}0.00`}
              placeholderTextColor={COLORS.textMuted}
              value={balance}
              onChangeText={setBalance}
              keyboardType="numeric"
            />

            <TouchableOpacity
              style={[styles.saveBtn, saving && { opacity: 0.6 }]}
              onPress={handleSave}
              disabled={saving}
            >
              {saving
                ? <ActivityIndicator size="small" color="#fff" style={{ marginRight: 8 }} />
                : <Ionicons name="checkmark" size={18} color="#fff" style={{ marginRight: 8 }} />
              }
              <Text style={styles.saveBtnText}>{saving ? 'Saving...' : editingAccount ? 'Save Changes' : 'Add Account'}</Text>
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      </BottomSheet>

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
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 12 },
  backBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '700', color: COLORS.text },
  addBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: COLORS.accent, justifyContent: 'center', alignItems: 'center' },
  container: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 40 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  netWorthCard: { backgroundColor: COLORS.card, borderRadius: 16, padding: 20, marginBottom: 16, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center' },
  netWorthLabel: { fontSize: 11, color: COLORS.textMuted, letterSpacing: 1.5, fontWeight: '700', marginBottom: 8 },
  netWorthAmount: { fontSize: 32, fontWeight: '900', letterSpacing: -1, marginBottom: 4 },
  netWorthSub: { fontSize: 13, color: COLORS.textMuted },
  accountCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.card, borderRadius: 14, padding: 16, marginBottom: 10, borderWidth: 1, borderColor: COLORS.border },
  accountIcon: { width: 46, height: 46, borderRadius: 13, justifyContent: 'center', alignItems: 'center', marginRight: 14 },
  accountInfo: { flex: 1 },
  accountName: { fontSize: 15, fontWeight: '600', color: COLORS.text },
  accountType: { fontSize: 12, color: COLORS.textMuted, marginTop: 2 },
  accountRight: { marginRight: 10 },
  accountBalance: { fontSize: 15, fontWeight: '800', letterSpacing: -0.3 },
  deleteBtn: { padding: 6 },
  empty: { alignItems: 'center', paddingTop: 60, paddingHorizontal: 32 },
  emptyIcon: { width: 80, height: 80, borderRadius: 24, backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border, justifyContent: 'center', alignItems: 'center', marginBottom: 20 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: COLORS.text, marginBottom: 10 },
  emptySub: { fontSize: 14, color: COLORS.textMuted, textAlign: 'center', lineHeight: 22, marginBottom: 24 },
  emptyBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.accent, borderRadius: 12, paddingVertical: 14, paddingHorizontal: 24 },
  emptyBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  sheetTitle: { fontSize: 20, fontWeight: '700', color: COLORS.text },
  label: { fontSize: 13, color: COLORS.textMuted, marginBottom: 8, marginLeft: 2 },
  input: { backgroundColor: COLORS.cardAlt, borderRadius: 12, padding: 14, color: COLORS.text, fontSize: 15, borderWidth: 1, borderColor: COLORS.border, marginBottom: 16 },
  typeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 16 },
  typeBtn: { width: '22%', alignItems: 'center', paddingVertical: 12, borderRadius: 14, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.card, gap: 6 },
  typeIconBox: { width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  typeLabel: { fontSize: 10, color: COLORS.textMuted, fontWeight: '500', textAlign: 'center' },
  saveBtn: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.accent, borderRadius: 12, padding: 16, marginTop: 8, marginBottom: 20 },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
})