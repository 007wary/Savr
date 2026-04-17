import { useState, useCallback } from 'react'
import {
  View, Text, StyleSheet, ScrollView,
  TouchableOpacity, Switch, TextInput,
  KeyboardAvoidingView, Platform, Image, ActivityIndicator
} from 'react-native'
import { useFocusEffect, useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { LinearGradient } from 'expo-linear-gradient'
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
import { backupToDrive, checkBackupExists } from '../../src/services/driveBackupService'

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
  const [currency, setCurrency] = useState('INR')
  const [currencySearch, setCurrencySearch] = useState('')
  const [editName, setEditName] = useState('')
  const [editPhone, setEditPhone] = useState('')
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)
  const [lastBackup, setLastBackup] = useState(null)
  const [backingUp, setBackingUp] = useState(false)
  const { alertConfig, showAlert, hideAlert } = useAlert()
  const router = useRouter()

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
        syncFromAuth()
        return
      }
    }

    await syncFromAuth()
  }

  async function syncFromAuth() {
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

      // Check last backup time
      checkBackupExists().then(info => {
        if (info?.modifiedTime) setLastBackup(info.modifiedTime)
      }).catch(() => {})
    } catch {
      // Silently fail
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
    try {
      const { error } = await supabase.auth.updateUser({
        data: {
          display_name: editName.trim(),
          phone_number: editPhone.trim()
        }
      })
      if (error) {
        showAlert('Error', error.message)
        return
      }

      setDisplayName(editName.trim())
      setPhone(editPhone.trim())
      setProfileModalVisible(false)
      clearUserCache()

      const now = new Date()
      const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
      await clearCache(`savr_cache_dashboard_${currentMonth}`)
      await saveCache(CACHE_KEY, {
        user, displayName: editName.trim(),
        phone: editPhone.trim(), currency,
      })

      showAlert('✅ Saved!', 'Your profile has been updated.')
    } catch {
      showAlert('Error', 'Failed to save. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  async function handleSignOut() {
    showAlert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: () => supabase.auth.signOut()
      }
    ])
  }

  async function handleManualBackup() {
    setBackingUp(true)
    const result = await backupToDrive()
    setBackingUp(false)
    if (result.success) {
      setLastBackup(result.backedUpAt)
      showAlert('✅ Backup Successful', `${result.expenseCount} expenses backed up to Google Drive.`)
    } else if (result.error === 'NO_TOKEN') {
      showAlert('Sign In Required', 'Please sign out and sign in again to enable Google Drive backup.')
    } else {
      showAlert('Backup Failed', result.error || 'Something went wrong.')
    }
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

      <LinearGradient
        colors={['#7C75FF', '#6C63FF', '#5A50FF']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.appHeader}
      >
        <Image source={require('../../assets/icon.png')} style={styles.appIcon} />
        <View style={styles.appHeaderInfo}>
          <Text style={styles.appName}>Savr</Text>
          <Text style={styles.appTagline}>Spend smart, save more</Text>
        </View>
        <View style={styles.versionBadge}>
          <Text style={styles.versionBadgeText}>v{APP_VERSION}</Text>
        </View>
      </LinearGradient>

      {/* Profile Card */}
      <TouchableOpacity style={styles.profileCard} onPress={openProfileModal} activeOpacity={0.8}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{getInitials()}</Text>
        </View>
        <View style={styles.profileInfo}>
          <Text style={styles.displayName}>{displayName}</Text>
          <Text style={styles.email}>{user?.email}</Text>
          {phone
            ? <Text style={styles.phoneText}>📱 {phone}</Text>
            : <Text style={styles.phoneAdd}>📱 Add phone number</Text>
          }
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

      {/* Backup & Restore */}
      <Text style={styles.sectionLabel}>BACKUP & RESTORE</Text>
      <View style={styles.card}>
        <View style={styles.row}>
          <View style={styles.rowLeft}>
            <View style={[styles.rowIcon, { backgroundColor: '#34C75922' }]}>
              <Ionicons name="cloud-outline" size={18} color="#34C759" />
            </View>
            <View>
              <Text style={styles.rowTitle}>Google Drive Backup</Text>
              <Text style={styles.rowSubtitle}>
  {lastBackup
    ? `Last backup: ${new Date(lastBackup).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })} at ${new Date(lastBackup).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })}`
    : 'No backup yet — tap Backup Now'}
</Text>
            </View>
          </View>
        </View>

        <View style={styles.divider} />

        <TouchableOpacity
          style={styles.row}
          onPress={handleManualBackup}
          disabled={backingUp}
        >
          <View style={styles.rowLeft}>
            <View style={[styles.rowIcon, { backgroundColor: '#34C75922' }]}>
              {backingUp
                ? <ActivityIndicator size="small" color="#34C759" />
                : <Ionicons name="cloud-upload-outline" size={18} color="#34C759" />
              }
            </View>
            <Text style={styles.rowTitle}>{backingUp ? 'Backing up...' : 'Backup Now'}</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={COLORS.textMuted} />
        </TouchableOpacity>
      </View>

      {/* About */}
      <Text style={styles.sectionLabel}>ABOUT</Text>
      <View style={styles.card}>
        <View style={styles.row}>
          <View style={styles.rowLeft}>
            <View style={[styles.rowIcon, { backgroundColor: '#6C63FF22' }]}>
              <Ionicons name="information-circle-outline" size={18} color={COLORS.accent} />
            </View>
            <View>
              <Text style={styles.rowTitle}>Version</Text>
              <Text style={styles.rowSubtitle}>Savr v{APP_VERSION} — Latest</Text>
            </View>
          </View>
          <View style={styles.versionPill}>
            <Text style={styles.versionPillText}>v{APP_VERSION}</Text>
          </View>
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

        <View style={styles.divider} />

        <View style={styles.row}>
          <View style={styles.rowLeft}>
            <View style={[styles.rowIcon, { backgroundColor: '#FF8C4222' }]}>
              <Ionicons name="code-slash-outline" size={18} color='#FF8C42' />
            </View>
            <View>
              <Text style={styles.rowTitle}>Developer</Text>
              <Text style={styles.rowSubtitle}>Wary Dev.</Text>
            </View>
          </View>
        </View>
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

      <View style={styles.footer}>
        <Text style={styles.footerSub}>Savr v{APP_VERSION} · © 2026</Text>
      </View>

      {/* Currency Bottom Sheet */}
      <BottomSheet
        visible={showCurrencyModal}
        onClose={() => { setShowCurrencyModal(false); setCurrencySearch('') }}
        maxHeight="85%"
      >
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
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={100}>
          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
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
            <TouchableOpacity
              style={[styles.saveBtn, saving && { opacity: 0.6 }]}
              onPress={saveProfile}
              disabled={saving}
            >
              <Text style={styles.saveBtnText}>{saving ? 'Saving...' : 'Save Profile'}</Text>
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
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg, paddingTop: 60, paddingHorizontal: 20 },
  appHeader: { flexDirection: 'row', alignItems: 'center', borderRadius: 20, padding: 20, marginBottom: 20, gap: 14 },
  appIcon: { width: 52, height: 52, borderRadius: 14, borderWidth: 2, borderColor: 'rgba(255,255,255,0.3)' },
  appHeaderInfo: { flex: 1 },
  appName: { fontSize: 22, fontWeight: '900', color: '#fff', letterSpacing: -0.5 },
  appTagline: { fontSize: 12, color: 'rgba(255,255,255,0.7)', marginTop: 2 },
  versionBadge: { backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 20, paddingVertical: 4, paddingHorizontal: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)' },
  versionBadgeText: { fontSize: 12, color: '#fff', fontWeight: '700' },
  profileCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.card, borderRadius: 16, padding: 20, marginBottom: 28, borderWidth: 1, borderColor: COLORS.border },
  avatar: { width: 56, height: 56, borderRadius: 28, backgroundColor: COLORS.accent, justifyContent: 'center', alignItems: 'center', marginRight: 16 },
  avatarText: { fontSize: 20, fontWeight: '700', color: '#fff' },
  profileInfo: { flex: 1 },
  displayName: { fontSize: 18, fontWeight: '800', color: COLORS.text, marginBottom: 2, letterSpacing: -0.3 },
  email: { fontSize: 13, color: COLORS.textMuted },
  phoneText: { fontSize: 13, color: COLORS.textMuted, marginTop: 2 },
  phoneAdd: { fontSize: 13, color: COLORS.accent, marginTop: 2 },
  editProfileBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  editProfileText: { fontSize: 13, color: COLORS.accent, fontWeight: '600' },
  sectionLabel: { fontSize: 11, fontWeight: '700', color: COLORS.textMuted, letterSpacing: 1.2, marginBottom: 10, marginLeft: 4 },
  card: { backgroundColor: COLORS.card, borderRadius: 16, borderWidth: 1, borderColor: COLORS.border, marginBottom: 24, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16 },
  rowLeft: { flexDirection: 'row', alignItems: 'center', gap: 14, flex: 1 },
  rowIcon: { width: 36, height: 36, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  rowTitle: { fontSize: 15, color: COLORS.text, fontWeight: '500' },
  rowSubtitle: { fontSize: 12, color: COLORS.textMuted, marginTop: 1 },
  divider: { height: 1, backgroundColor: COLORS.border, marginLeft: 66 },
  versionPill: { backgroundColor: COLORS.accent + '22', borderRadius: 20, paddingVertical: 4, paddingHorizontal: 10, borderWidth: 1, borderColor: COLORS.accent + '44' },
  versionPillText: { fontSize: 12, color: COLORS.accent, fontWeight: '700' },
  footer: { alignItems: 'center', marginTop: 8, marginBottom: 32 },
  footerSub: { fontSize: 11, color: COLORS.border },
  sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  sheetTitle: { fontSize: 20, fontWeight: '700', color: COLORS.text },
  currencySearch: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.cardAlt, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, borderWidth: 1, borderColor: COLORS.border, marginBottom: 12 },
  currencySearchInput: { flex: 1, color: COLORS.text, fontSize: 14 },
  currencyRow: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 14, borderRadius: 12, marginBottom: 4 },
  currencyRowActive: { backgroundColor: COLORS.accent + '15' },
  currencyFlag: { fontSize: 24 },
  currencyName: { fontSize: 15, color: COLORS.text, fontWeight: '500' },
  currencyCode: { fontSize: 12, color: COLORS.textMuted, marginTop: 2 },
  currencySymbol: { fontSize: 16, color: COLORS.textMuted, fontWeight: '700' },
  modalAvatar: { width: 72, height: 72, borderRadius: 36, backgroundColor: COLORS.accent, justifyContent: 'center', alignItems: 'center', alignSelf: 'center', marginBottom: 24 },
  modalAvatarText: { fontSize: 26, fontWeight: '700', color: '#fff' },
  label: { fontSize: 13, color: COLORS.textMuted, marginBottom: 8, marginLeft: 2 },
  input: { backgroundColor: COLORS.cardAlt, borderRadius: 12, padding: 14, color: COLORS.text, fontSize: 15, borderWidth: 1, borderColor: COLORS.border, marginBottom: 16 },
  readOnlyInput: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: COLORS.cardAlt, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: COLORS.border, marginBottom: 24 },
  readOnlyText: { fontSize: 15, color: COLORS.textMuted },
  saveBtn: { backgroundColor: COLORS.accent, borderRadius: 12, padding: 16, alignItems: 'center', marginBottom: 8 },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
})