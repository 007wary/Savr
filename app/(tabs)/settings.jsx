import { useState, useCallback } from 'react'
import {
  View, Text, StyleSheet, ScrollView,
  TouchableOpacity, Switch, TextInput,
  KeyboardAvoidingView, Platform
} from 'react-native'
import { useFocusEffect, useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../../src/lib/supabase'
import { COLORS, CURRENCIES } from '../../src/constants/theme'
import { requestNotificationPermission } from '../../src/lib/notifications'
import { saveCurrency, loadCurrency } from '../../src/lib/currency'
import BottomSheet from '../../src/components/BottomSheet'
import { SettingsSkeleton } from '../../src/components/SkeletonLoader'
import CustomAlert from '../../src/components/CustomAlert'
import useAlert from '../../src/hooks/useAlert'
import * as Notifications from 'expo-notifications'
import { getUser, clearUserCache } from '../../src/lib/auth'
import { saveCache, loadCache, clearCache } from '../../src/lib/cache'

const APP_VERSION = '1.0'
const CACHE_KEY = 'savr_cache_settings'

export default function Settings() {
  const [user, setUser] = useState(null)
  const [displayName, setDisplayName] = useState('')
  const [phone, setPhone] = useState('')
  const [notificationsEnabled, setNotificationsEnabled] = useState(false)
  const [budgetAlerts, setBudgetAlerts] = useState(false)
  const [profileModalVisible, setProfileModalVisible] = useState(false)
  const [showCurrencyModal, setShowCurrencyModal] = useState(false)
  const [showPasswordModal, setShowPasswordModal] = useState(false)
  const [currency, setCurrency] = useState('INR')
  const [currencySearch, setCurrencySearch] = useState('')
  const [editName, setEditName] = useState('')
  const [editPhone, setEditPhone] = useState('')
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [changingPassword, setChangingPassword] = useState(false)
  const { alertConfig, showAlert, hideAlert } = useAlert()
  const router = useRouter()

  const isGoogleUser = user?.app_metadata?.providers?.includes('google')
  const hasEmailIdentity = user?.identities?.some(i => i.provider === 'email')
  const showSetPassword = isGoogleUser && !hasEmailIdentity

  async function fetchUser(forceRefresh = false) {
    const { status } = await Notifications.getPermissionsAsync()
    setNotificationsEnabled(status === 'granted')
    setBudgetAlerts(status === 'granted')

    if (!forceRefresh) {
      const cached = await loadCache(CACHE_KEY)
      if (cached) {
        setUser(cached.user)
        setDisplayName(cached.displayName)
        setPhone(cached.phone)
        setCurrency(cached.currency)
        setLoading(false)
        syncFromSupabase()
        return
      }
    }

    await syncFromSupabase()
  }

  async function syncFromSupabase() {
    try {
      const user = await getUser(true)
      setUser(user)
      const name = user.user_metadata?.display_name ||
                   user.user_metadata?.full_name ||
                   user.email.split('@')[0]
      const ph = user.user_metadata?.phone_number || ''
      setDisplayName(name)
      setPhone(ph)
      const savedCurrency = await loadCurrency()
      setCurrency(savedCurrency)
      await saveCache(CACHE_KEY, {
        user, displayName: name, phone: ph, currency: savedCurrency,
      })
    } catch {
      // Silently fail — cache already shown
    } finally {
      setLoading(false)
    }
  }

  useFocusEffect(useCallback(() => { fetchUser() }, []))

  function openProfileModal() {
    setEditName(displayName)
    setEditPhone(phone)
    setProfileModalVisible(true)
  }

  async function saveProfile() {
    if (!editName.trim()) return showAlert('Invalid', 'Name cannot be empty')
    setSaving(true)
    const { error } = await supabase.auth.updateUser({
      data: { display_name: editName.trim(), phone_number: editPhone.trim() }
    })
    if (error) showAlert('Error', error.message)
    else {
      setDisplayName(editName.trim())
      setPhone(editPhone.trim())
      setProfileModalVisible(false)
      clearUserCache()
      const now = new Date()
      const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
      await clearCache(`savr_cache_dashboard_${currentMonth}`)
      await saveCache(CACHE_KEY, {
        user, displayName: editName.trim(), phone: editPhone.trim(), currency,
      })
    }
    setSaving(false)
  }

  async function handleChangePassword() {
    if (!currentPassword || !newPassword || !confirmPassword) {
      return showAlert('Error', 'Please fill in all fields')
    }
    if (newPassword.length < 6) {
      return showAlert('Error', 'New password must be at least 6 characters')
    }
    if (newPassword !== confirmPassword) {
      return showAlert('Error', 'New passwords do not match')
    }
    setChangingPassword(true)
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: user.email,
      password: currentPassword,
    })
    if (signInError) {
      setChangingPassword(false)
      return showAlert('Error', 'Current password is incorrect')
    }
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    setChangingPassword(false)
    if (error) return showAlert('Error', error.message)
    closePasswordModal()
    showAlert('Success! 🎉', 'Your password has been changed successfully.')
  }

  async function handleSetPassword() {
    if (!newPassword || !confirmPassword) {
      return showAlert('Error', 'Please fill in all fields')
    }
    if (newPassword.length < 6) {
      return showAlert('Error', 'Password must be at least 6 characters')
    }
    if (newPassword !== confirmPassword) {
      return showAlert('Error', 'Passwords do not match')
    }
    setChangingPassword(true)
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    setChangingPassword(false)
    if (error) return showAlert('Error', error.message)
    closePasswordModal()
    showAlert('Password Set! 🎉', 'You can now sign in with your email and this password.')
  }

  function closePasswordModal() {
    setShowPasswordModal(false)
    setCurrentPassword('')
    setNewPassword('')
    setConfirmPassword('')
  }

  async function handleSignOut() {
    showAlert('Sign Out', 'Are you sure you want to sign out?', [
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

  const filteredCurrencies = CURRENCIES.filter(cur =>
    cur.name.toLowerCase().includes(currencySearch.toLowerCase()) ||
    cur.code.toLowerCase().includes(currencySearch.toLowerCase())
  )

  if (loading) return <SettingsSkeleton />

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
              if (val) await requestNotificationPermission()
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
            onValueChange={(val) => setBudgetAlerts(val)}
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
        <TouchableOpacity style={styles.row} onPress={() => setShowPasswordModal(true)}>
          <View style={styles.rowLeft}>
            <View style={[styles.rowIcon, { backgroundColor: '#6C63FF22' }]}>
              <Ionicons name="lock-closed-outline" size={18} color={COLORS.accent} />
            </View>
            <View>
              <Text style={styles.rowTitle}>
                {showSetPassword ? 'Set Password' : 'Change Password'}
              </Text>
              {showSetPassword && (
                <Text style={styles.rowSubtitle}>Sign in with email too</Text>
              )}
            </View>
          </View>
          <Ionicons name="chevron-forward" size={16} color={COLORS.textMuted} />
        </TouchableOpacity>

        <View style={styles.divider} />

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

      <Text style={styles.footer}>
        <Text style={styles.footerBold}>Savr</Text> · Spend smart, save more
      </Text>

      {/* Currency Bottom Sheet */}
      <BottomSheet visible={showCurrencyModal} onClose={() => { setShowCurrencyModal(false); setCurrencySearch('') }} maxHeight="85%">
        <View style={styles.sheetHeader}>
          <Text style={styles.sheetTitle}>Select Currency</Text>
          <TouchableOpacity onPress={() => { setShowCurrencyModal(false); setCurrencySearch('') }}>
            <Ionicons name="close" size={22} color={COLORS.textMuted} />
          </TouchableOpacity>
        </View>
        <View style={styles.currencySearch}>
          <Ionicons name="search-outline" size={16} color={COLORS.textMuted} style={{ marginRight: 8 }} />
          <TextInput
            style={styles.currencySearchInput}
            placeholder="Search currency or country..."
            placeholderTextColor={COLORS.textMuted}
            value={currencySearch}
            onChangeText={setCurrencySearch}
            autoCorrect={false}
          />
          {currencySearch !== '' && (
            <TouchableOpacity onPress={() => setCurrencySearch('')}>
              <Ionicons name="close-circle" size={16} color={COLORS.textMuted} />
            </TouchableOpacity>
          )}
        </View>
        <ScrollView showsVerticalScrollIndicator={false}>
          {filteredCurrencies.length === 0 ? (
            <View style={{ alignItems: 'center', paddingVertical: 32 }}>
              <Text style={{ color: COLORS.textMuted, fontSize: 14 }}>No results found</Text>
            </View>
          ) : (
            filteredCurrencies.map(cur => (
              <TouchableOpacity
                key={cur.code}
                style={[styles.currencyRow, currency === cur.code && styles.currencyRowActive]}
                onPress={async () => {
                  setCurrency(cur.code)
                  await saveCurrency(cur.code)
                  setCurrencySearch('')
                  setShowCurrencyModal(false)
                  await saveCache(CACHE_KEY, { user, displayName, phone, currency: cur.code })
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
            ))
          )}
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

      {/* Change Password / Set Password Bottom Sheet */}
      <BottomSheet visible={showPasswordModal} onClose={closePasswordModal}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>
              {showSetPassword ? 'Set Password' : 'Change Password'}
            </Text>
            <TouchableOpacity onPress={closePasswordModal}>
              <Ionicons name="close" size={22} color={COLORS.textMuted} />
            </TouchableOpacity>
          </View>

          {showSetPassword ? (
            <>
              <View style={styles.infoBox}>
                <Ionicons name="information-circle-outline" size={18} color={COLORS.accent} />
                <Text style={styles.infoText}>
                  Adding a password lets you also sign in with {user?.email} and password in addition to Google.
                </Text>
              </View>
              <Text style={styles.label}>New Password</Text>
              <TextInput
                style={styles.input}
                placeholder="Min. 6 characters"
                placeholderTextColor={COLORS.textMuted}
                value={newPassword}
                onChangeText={setNewPassword}
                secureTextEntry
              />
              <Text style={styles.label}>Confirm Password</Text>
              <TextInput
                style={styles.input}
                placeholder="Repeat new password"
                placeholderTextColor={COLORS.textMuted}
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secureTextEntry
              />
              <TouchableOpacity
                style={styles.saveBtn}
                onPress={handleSetPassword}
                disabled={changingPassword}
              >
                <Text style={styles.saveBtnText}>
                  {changingPassword ? 'Setting...' : 'Set Password'}
                </Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <Text style={styles.label}>Current Password</Text>
              <TextInput
                style={styles.input}
                placeholder="Enter current password"
                placeholderTextColor={COLORS.textMuted}
                value={currentPassword}
                onChangeText={setCurrentPassword}
                secureTextEntry
              />
              <Text style={styles.label}>New Password</Text>
              <TextInput
                style={styles.input}
                placeholder="Min. 6 characters"
                placeholderTextColor={COLORS.textMuted}
                value={newPassword}
                onChangeText={setNewPassword}
                secureTextEntry
              />
              <Text style={styles.label}>Confirm New Password</Text>
              <TextInput
                style={styles.input}
                placeholder="Repeat new password"
                placeholderTextColor={COLORS.textMuted}
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secureTextEntry
              />
              <TouchableOpacity
                style={styles.saveBtn}
                onPress={handleChangePassword}
                disabled={changingPassword}
              >
                <Text style={styles.saveBtnText}>
                  {changingPassword ? 'Changing...' : 'Change Password'}
                </Text>
              </TouchableOpacity>
            </>
          )}
        </KeyboardAvoidingView>
      </BottomSheet>

      <CustomAlert
        visible={alertConfig.visible}
        title={alertConfig.title}
        message={alertConfig.message}
        buttons={alertConfig.buttons}
        onClose={hideAlert}
      />
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg, paddingTop: 60, paddingHorizontal: 20 },
  heading: { fontSize: 28, fontWeight: '800', color: COLORS.text, letterSpacing: -0.8, marginBottom: 24 },
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
  displayName: { fontSize: 18, fontWeight: '800', color: COLORS.text, marginBottom: 2, letterSpacing: -0.3 },
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
  footer: { textAlign: 'center', color: COLORS.textMuted, fontSize: 13, marginTop: 8, marginBottom: 32 },
  footerBold: { fontWeight: '800', color: COLORS.text, letterSpacing: -0.5 },
  sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  sheetTitle: { fontSize: 20, fontWeight: '700', color: COLORS.text },
  currencySearch: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: COLORS.cardAlt, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 10,
    borderWidth: 1, borderColor: COLORS.border, marginBottom: 12,
  },
  currencySearchInput: { flex: 1, color: COLORS.text, fontSize: 14 },
  currencyRow: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    padding: 14, borderRadius: 12, marginBottom: 4,
  },
  currencyRowActive: { backgroundColor: COLORS.accent + '15' },
  currencyFlag: { fontSize: 24 },
  currencyName: { fontSize: 15, color: COLORS.text, fontWeight: '500' },
  currencyCode: { fontSize: 12, color: COLORS.textMuted, marginTop: 2 },
  currencySymbol: { fontSize: 16, color: COLORS.textMuted, fontWeight: '700' },
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
  saveBtn: { backgroundColor: COLORS.accent, borderRadius: 12, padding: 16, alignItems: 'center', marginBottom: 8 },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  infoBox: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    backgroundColor: COLORS.accent + '11', borderRadius: 12,
    padding: 14, marginBottom: 20,
    borderWidth: 1, borderColor: COLORS.accent + '33',
  },
  infoText: { flex: 1, fontSize: 13, color: COLORS.textMuted, lineHeight: 20 },
})