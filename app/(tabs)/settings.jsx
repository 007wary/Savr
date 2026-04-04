import { useState, useCallback } from 'react'
import {
  View, Text, StyleSheet, ScrollView,
  TouchableOpacity, Alert, Switch, TextInput,
  KeyboardAvoidingView, Platform
} from 'react-native'
import { useFocusEffect, useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../../src/lib/supabase'
import { COLORS, CURRENCIES } from '../../src/constants/theme'
import { sendNotification, requestNotificationPermission } from '../../src/lib/notifications'
import { saveCurrency, loadCurrency } from '../../src/lib/currency'
import BottomSheet from '../../src/components/BottomSheet'

const APP_VERSION = '1.0.0'

export default function Settings() {
  const [user, setUser] = useState(null)
  const [displayName, setDisplayName] = useState('')
  const [phone, setPhone] = useState('')
  const [notificationsEnabled, setNotificationsEnabled] = useState(true)
  const [budgetAlerts, setBudgetAlerts] = useState(true)
  const [profileModalVisible, setProfileModalVisible] = useState(false)
  const [showCurrencyModal, setShowCurrencyModal] = useState(false)
  const [currency, setCurrency] = useState('INR')
  const [editName, setEditName] = useState('')
  const [editPhone, setEditPhone] = useState('')
  const [saving, setSaving] = useState(false)
  const router = useRouter()

  async function fetchUser() {
    const { data: { user } } = await supabase.auth.getUser()
    setUser(user)
    const name = user.user_metadata?.display_name || user.email.split('@')[0]
    const ph = user.user_metadata?.phone_number || ''
    setDisplayName(name)
    setPhone(ph)
    const savedCurrency = await loadCurrency()
    setCurrency(savedCurrency)
  }

  useFocusEffect(useCallback(() => { fetchUser() }, []))

  function openProfileModal() {
    setEditName(displayName)
    setEditPhone(phone)
    setProfileModalVisible(true)
  }

  async function saveProfile() {
    if (!editName.trim()) return Alert.alert('Invalid', 'Name cannot be empty')
    setSaving(true)
    const { error } = await supabase.auth.updateUser({
      data: { display_name: editName.trim(), phone_number: editPhone.trim() }
    })
    if (error) Alert.alert('Error', error.message)
    else {
      setDisplayName(editName.trim())
      setPhone(editPhone.trim())
      setProfileModalVisible(false)
    }
    setSaving(false)
  }

  async function handleSignOut() {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: () => supabase.auth.signOut() }
    ])
  }

  function getInitials() {
    if (!displayName) return '?'
    const parts = displayName.trim().split(' ')
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
    return displayName.slice(0, 2).toUpperCase()
  }

  const selectedCurrency = CURRENCIES.find(c => c.code === currency)

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 60 }}>
      <Text style={styles.heading}>Settings</Text>

      {/* Profile Card */}
      <TouchableOpacity style={styles.profileCard} onPress={openProfileModal} activeOpacity={0.8}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{getInitials()}</Text>
        </View>
        <View style={styles.profileInfo}>
          <Text style={styles.displayName}>{displayName}</Text>
          <Text style={styles.email}>{user?.email}</Text>
          {phone ? <Text style={styles.phoneText}>📱 {phone}</Text> : null}
        </View>
        <View style={styles.editProfileBtn}>
          <Ionicons name="pencil-outline" size={16} color={COLORS.accent} />
          <Text style={styles.editProfileText}>Edit</Text>
        </View>
      </TouchableOpacity>

      {/* Preferences */}
      <Text style={styles.sectionLabel}>PREFERENCES</Text>
      <View style={styles.card}>
        <View style={styles.row}>
          <View style={styles.rowLeft}>
            <View style={[styles.rowIcon, { backgroundColor: '#6C63FF22' }]}>
              <Ionicons name="notifications-outline" size={18} color={COLORS.accent} />
            </View>
            <View>
              <Text style={styles.rowTitle}>Notifications</Text>
              <Text style={styles.rowSubtitle}>Enable push notifications</Text>
            </View>
          </View>
          <Switch
            value={notificationsEnabled}
            onValueChange={async (val) => {
              setNotificationsEnabled(val)
              if (val) {
                const granted = await requestNotificationPermission()
                if (granted) sendNotification('Notifications Enabled 🔔', 'You will now receive expense alerts')
              }
            }}
            trackColor={{ false: COLORS.border, true: COLORS.accent }}
            thumbColor="#fff"
          />
        </View>

        <View style={styles.divider} />

        <View style={styles.row}>
          <View style={styles.rowLeft}>
            <View style={[styles.rowIcon, { backgroundColor: '#FFB80022' }]}>
              <Ionicons name="wallet-outline" size={18} color={COLORS.accentYellow} />
            </View>
            <View>
              <Text style={styles.rowTitle}>Budget Alerts</Text>
              <Text style={styles.rowSubtitle}>Warn when nearing budget limit</Text>
            </View>
          </View>
          <Switch
            value={budgetAlerts}
            onValueChange={(val) => {
              setBudgetAlerts(val)
              if (val) sendNotification('Budget Alerts Enabled 💰', 'You will be warned when nearing your budget limit')
            }}
            trackColor={{ false: COLORS.border, true: COLORS.accent }}
            thumbColor="#fff"
          />
        </View>

        <View style={styles.divider} />

        <TouchableOpacity style={styles.row} onPress={() => setShowCurrencyModal(true)}>
          <View style={styles.rowLeft}>
            <View style={[styles.rowIcon, { backgroundColor: '#00D9A522' }]}>
              <Ionicons name="cash-outline" size={18} color={COLORS.accentGreen} />
            </View>
            <View>
              <Text style={styles.rowTitle}>Currency</Text>
              <Text style={styles.rowSubtitle}>
                {selectedCurrency?.flag} {currency} — {selectedCurrency?.name}
              </Text>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={16} color={COLORS.textMuted} />
        </TouchableOpacity>
      </View>

      {/* About */}
      <Text style={styles.sectionLabel}>ABOUT</Text>
      <View style={styles.card}>
        <View style={styles.row}>
          <View style={styles.rowLeft}>
            <View style={[styles.rowIcon, { backgroundColor: '#FF8C4222' }]}>
              <Ionicons name="code-slash-outline" size={18} color='#FF8C42' />
            </View>
            <View>
              <Text style={styles.rowTitle}>Version</Text>
              <Text style={styles.rowSubtitle}>Current app version</Text>
            </View>
          </View>
          <Text style={styles.versionText}>v{APP_VERSION}</Text>
        </View>

        <View style={styles.divider} />

        <TouchableOpacity
          style={styles.row}
          onPress={() => router.push({ pathname: '/webview', params: { type: 'privacy', title: 'Privacy Policy' } })}
        >
          <View style={styles.rowLeft}>
            <View style={[styles.rowIcon, { backgroundColor: '#5B9BD522' }]}>
              <Ionicons name="shield-checkmark-outline" size={18} color='#5B9BD5' />
            </View>
            <Text style={styles.rowTitle}>Privacy Policy</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={COLORS.textMuted} />
        </TouchableOpacity>

        <View style={styles.divider} />

        <TouchableOpacity
          style={styles.row}
          onPress={() => router.push({ pathname: '/webview', params: { type: 'terms', title: 'Terms of Service' } })}
        >
          <View style={styles.rowLeft}>
            <View style={[styles.rowIcon, { backgroundColor: '#88888822' }]}>
              <Ionicons name="document-text-outline" size={18} color={COLORS.textMuted} />
            </View>
            <Text style={styles.rowTitle}>Terms of Service</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={COLORS.textMuted} />
        </TouchableOpacity>
      </View>

      {/* Account */}
      <Text style={styles.sectionLabel}>ACCOUNT</Text>
      <View style={styles.card}>
        <TouchableOpacity style={styles.row} onPress={handleSignOut}>
          <View style={styles.rowLeft}>
            <View style={[styles.rowIcon, { backgroundColor: '#FF5C5C22' }]}>
              <Ionicons name="log-out-outline" size={18} color={COLORS.accentRed} />
            </View>
            <Text style={[styles.rowTitle, { color: COLORS.accentRed }]}>Sign Out</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={COLORS.textMuted} />
        </TouchableOpacity>
      </View>

      <Text style={styles.footer}>Made with 💸 by you</Text>

      {/* Currency Bottom Sheet */}
      <BottomSheet visible={showCurrencyModal} onClose={() => setShowCurrencyModal(false)} maxHeight="85%">
        <View style={styles.sheetHeader}>
          <Text style={styles.sheetTitle}>Select Currency</Text>
          <TouchableOpacity onPress={() => setShowCurrencyModal(false)}>
            <Ionicons name="close" size={22} color={COLORS.textMuted} />
          </TouchableOpacity>
        </View>
        <ScrollView showsVerticalScrollIndicator={false}>
          {CURRENCIES.map(cur => (
            <TouchableOpacity
              key={cur.code}
              style={[styles.currencyRow, currency === cur.code && styles.currencyRowActive]}
              onPress={async () => {
                setCurrency(cur.code)
                await saveCurrency(cur.code)
                setShowCurrencyModal(false)
              }}
            >
              <Text style={styles.currencyFlag}>{cur.flag}</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.currencyName}>{cur.name}</Text>
                <Text style={styles.currencyCode}>{cur.code}</Text>
              </View>
              <Text style={styles.currencySymbol}>{cur.symbol}</Text>
              {currency === cur.code && (
                <Ionicons name="checkmark-circle" size={20} color={COLORS.accent} style={{ marginLeft: 8 }} />
              )}
            </TouchableOpacity>
          ))}
        </ScrollView>
      </BottomSheet>

      {/* Profile Edit Bottom Sheet */}
      <BottomSheet visible={profileModalVisible} onClose={() => setProfileModalVisible(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>Edit Profile</Text>
            <TouchableOpacity onPress={() => setProfileModalVisible(false)}>
              <Ionicons name="close" size={22} color={COLORS.textMuted} />
            </TouchableOpacity>
          </View>
          <View style={styles.modalAvatar}>
            <Text style={styles.modalAvatarText}>{getInitials()}</Text>
          </View>
          <Text style={styles.label}>Full Name</Text>
          <TextInput
            style={styles.input}
            placeholder="Enter your name"
            placeholderTextColor={COLORS.textMuted}
            value={editName}
            onChangeText={setEditName}
            autoCapitalize="words"
          />
          <Text style={styles.label}>Phone Number</Text>
          <TextInput
            style={styles.input}
            placeholder="+91 00000 00000"
            placeholderTextColor={COLORS.textMuted}
            value={editPhone}
            onChangeText={setEditPhone}
            keyboardType="phone-pad"
          />
          <Text style={styles.label}>Email</Text>
          <View style={styles.readOnlyInput}>
            <Text style={styles.readOnlyText}>{user?.email}</Text>
            <Ionicons name="lock-closed-outline" size={14} color={COLORS.textMuted} />
          </View>
          <TouchableOpacity style={styles.saveBtn} onPress={saveProfile} disabled={saving}>
            <Text style={styles.saveBtnText}>{saving ? 'Saving...' : 'Save Profile'}</Text>
          </TouchableOpacity>
        </KeyboardAvoidingView>
      </BottomSheet>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg, paddingTop: 60, paddingHorizontal: 20 },
  heading: { fontSize: 26, fontWeight: '700', color: COLORS.text, marginBottom: 24 },
  profileCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: COLORS.card, borderRadius: 16,
    padding: 20, marginBottom: 28,
    borderWidth: 1, borderColor: COLORS.border,
  },
  avatar: {
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: COLORS.accent,
    justifyContent: 'center', alignItems: 'center', marginRight: 16,
  },
  avatarText: { fontSize: 20, fontWeight: '700', color: '#fff' },
  profileInfo: { flex: 1 },
  displayName: { fontSize: 17, fontWeight: '700', color: COLORS.text, marginBottom: 2 },
  email: { fontSize: 13, color: COLORS.textMuted },
  phoneText: { fontSize: 13, color: COLORS.textMuted, marginTop: 2 },
  editProfileBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  editProfileText: { fontSize: 13, color: COLORS.accent, fontWeight: '600' },
  sectionLabel: {
    fontSize: 11, fontWeight: '700', color: COLORS.textMuted,
    letterSpacing: 1.2, marginBottom: 10, marginLeft: 4,
  },
  card: {
    backgroundColor: COLORS.card, borderRadius: 16,
    borderWidth: 1, borderColor: COLORS.border,
    marginBottom: 24, overflow: 'hidden',
  },
  row: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', padding: 16,
  },
  rowLeft: { flexDirection: 'row', alignItems: 'center', gap: 14, flex: 1 },
  rowIcon: { width: 36, height: 36, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  rowTitle: { fontSize: 15, color: COLORS.text, fontWeight: '500' },
  rowSubtitle: { fontSize: 12, color: COLORS.textMuted, marginTop: 1 },
  divider: { height: 1, backgroundColor: COLORS.border, marginLeft: 66 },
  versionText: { fontSize: 14, color: COLORS.textMuted, fontWeight: '600' },
  footer: { textAlign: 'center', color: COLORS.textMuted, fontSize: 13, marginTop: 8 },
  sheetHeader: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: 20,
  },
  sheetTitle: { fontSize: 20, fontWeight: '700', color: COLORS.text },
  modalAvatar: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: COLORS.accent,
    justifyContent: 'center', alignItems: 'center',
    alignSelf: 'center', marginBottom: 24,
  },
  modalAvatarText: { fontSize: 26, fontWeight: '700', color: '#fff' },
  label: { fontSize: 13, color: COLORS.textMuted, marginBottom: 8, marginLeft: 2 },
  input: {
    backgroundColor: COLORS.cardAlt, borderRadius: 12, padding: 14,
    color: COLORS.text, fontSize: 15, borderWidth: 1,
    borderColor: COLORS.border, marginBottom: 16,
  },
  readOnlyInput: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: COLORS.cardAlt, borderRadius: 12, padding: 14,
    borderWidth: 1, borderColor: COLORS.border, marginBottom: 24,
  },
  readOnlyText: { fontSize: 15, color: COLORS.textMuted },
  saveBtn: { backgroundColor: COLORS.accent, borderRadius: 12, padding: 16, alignItems: 'center' },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  currencyRow: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    padding: 14, borderRadius: 12, marginBottom: 4,
  },
  currencyRowActive: { backgroundColor: COLORS.accent + '15' },
  currencyFlag: { fontSize: 24 },
  currencyName: { fontSize: 15, color: COLORS.text, fontWeight: '500' },
  currencyCode: { fontSize: 12, color: COLORS.textMuted, marginTop: 2 },
  currencySymbol: { fontSize: 16, color: COLORS.textMuted, fontWeight: '700' },
})