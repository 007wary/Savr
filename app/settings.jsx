import { useState, useCallback, useEffect } from 'react'
import Constants from 'expo-constants'
import {
  View, Text, StyleSheet, ScrollView,
  TouchableOpacity, Switch, TextInput,
  KeyboardAvoidingView, Platform,
  Linking, Image
} from 'react-native'
import { useFocusEffect, useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../src/lib/supabase'
import { COLORS, CURRENCIES, SCREEN } from '../src/constants/theme'
import { requestNotificationPermission, isNotificationGranted, BUDGET_ALERTS_KEY } from '../src/lib/notifications'
import { saveCurrency, loadCurrency } from '../src/lib/currency'
import BottomSheet from '../src/components/BottomSheet'
import { SettingsSkeleton } from '../src/components/SkeletonLoader'
import CustomAlert from '../src/components/CustomAlert'
import useAlert from '../src/hooks/useAlert'
import { getUser, getCachedUser, clearUserCache } from '../src/lib/auth'
import { saveCache, loadCache, clearCache } from '../src/lib/cache'
import { checkBackupExists } from '../src/services/driveBackupService'
import AsyncStorage from '@react-native-async-storage/async-storage'

const APP_VERSION = Constants.expoConfig?.version || '1.0'
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
  const [avatarUrl, setAvatarUrl] = useState(null)
  const { alertConfig, showAlert, hideAlert } = useAlert()
  const router = useRouter()

  async function checkOnlineStatus() {
    try {
      await fetch('https://www.google.com', { method: 'HEAD', cache: 'no-cache' })
      return true
    } catch {
      return false
    }
  }

  async function loadNotificationPrefs() {
    try {
      const granted = await isNotificationGranted()
      setNotificationsEnabled(granted)
      if (granted) {
        const savedBudgetAlerts = await AsyncStorage.getItem(BUDGET_ALERTS_KEY)
        setBudgetAlerts(savedBudgetAlerts !== 'false')
      } else {
        setBudgetAlerts(false)
      }
    } catch {}
  }

  async function fetchUser(forceRefresh = false) {
    await loadNotificationPrefs()
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
      const u = getCachedUser() || await getUser(true)
      if (!u) { setLoading(false); return }
      setUser(u)
      const name = u.user_metadata?.display_name ||
        u.user_metadata?.full_name ||
        u.email.split('@')[0]
      const ph = u.user_metadata?.phone_number || ''
      setDisplayName(name)
      setPhone(ph)
      const avatar = u.user_metadata?.picture || u.user_metadata?.avatar_url || null
      if (avatar) setAvatarUrl(avatar)
      const savedCurrency = await loadCurrency()
      setCurrency(savedCurrency)
      await saveCache(CACHE_KEY, {
        user: u, displayName: name, phone: ph, currency: savedCurrency,
      })

      checkBackupExists().then(info => {
        if (info?.modifiedTime) setLastBackup(info.modifiedTime)
      }).catch(() => {})

    } catch {
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    async function loadAvatar() {
      try {
        const saved = await AsyncStorage.getItem('savr_avatar_url')
        if (saved) setAvatarUrl(saved)
      } catch {}
    }
    loadAvatar()
  }, [])

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
          phone_number: editPhone.trim(),
        }
      })
      if (error) { showAlert('Error', error.message); return }
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

  function handleSignOut() {
    showAlert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: () => supabase.auth.signOut(),
      }
    ])
  }

  async function handleShareApp() {
    try {
      const { Share } = await import('react-native')
      await Share.share({
        message: `Savr — Expense Tracker & Budget Planner\n\nTrack expenses, set budgets, and get spending insights — all stored privately on your device.\n\nDownload free on Google Play:\nhttps://play.google.com/store/apps/details?id=com.saver.savr`,
        title: 'Check out Savr!',
      })
    } catch {}
  }

  async function handleNotificationToggle(val) {
    if (val) {
      const status = await requestNotificationPermission()
      if (status === 'granted') {
        setNotificationsEnabled(true)
        const savedBudgetAlerts = await AsyncStorage.getItem(BUDGET_ALERTS_KEY)
        setBudgetAlerts(savedBudgetAlerts !== 'false')
      } else if (status === 'denied') {
        setNotificationsEnabled(false)
        showAlert(
          'Permission Denied',
          'Notifications were denied. Please enable them in your device settings.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Open Settings', style: 'default', onPress: () => Linking.openSettings() },
          ]
        )
      }
    } else {
      setNotificationsEnabled(false)
      setBudgetAlerts(false)
      await AsyncStorage.setItem(BUDGET_ALERTS_KEY, 'false')
      showAlert(
        'Disable Notifications',
        'To fully disable notifications, go to your device settings.',
        [
          { text: 'OK', style: 'cancel' },
          { text: 'Open Settings', style: 'default', onPress: () => Linking.openSettings() },
        ]
      )
    }
  }

  async function handleBudgetAlertsToggle(val) {
    setBudgetAlerts(val)
    await AsyncStorage.setItem(BUDGET_ALERTS_KEY, val ? 'true' : 'false')
  }

  function getInitials() {
    if (!displayName) return '?'
    const parts = displayName.trim().split(' ')
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
    return displayName.slice(0, 2).toUpperCase()
  }

  function formatBackupDate(dateStr) {
    try {
      const d = new Date(dateStr)
      if (isNaN(d.getTime())) return 'No backup yet — tap Backup Now'
      return `Last backup: ${d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })} at ${d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })}`
    } catch {
      return 'No backup yet — tap Backup Now'
    }
  }

  const selectedCurrency = CURRENCIES.find(c => c.code === currency)
  const filteredCurrencies = CURRENCIES.filter(cur =>
    cur.name.toLowerCase().includes(currencySearch.toLowerCase()) ||
    cur.code.toLowerCase().includes(currencySearch.toLowerCase())
  )

  if (loading) return <SettingsSkeleton />

  return (
    <View style={styles.outerContainer}>
      <View style={styles.stickyHeader}>
        <TouchableOpacity onPress={() => router.back()} style={{ marginRight: 12 }}>
          <Ionicons name="chevron-back" size={26} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.heading}>Settings</Text>
      </View>
      <ScrollView style={styles.scrollView} contentContainerStyle={{ paddingBottom: 24 }}>

      <TouchableOpacity style={styles.profileCard} onPress={openProfileModal} activeOpacity={0.8}>
        {avatarUrl ? (
          <Image source={{ uri: avatarUrl }} style={styles.avatarImage} />
        ) : (
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{getInitials()}</Text>
          </View>
        )}
        <View style={styles.profileInfo}>
          <Text style={styles.displayName}>{displayName}</Text>
          <Text style={styles.email}>{user?.email}</Text>
          {phone
            ? <View style={styles.phoneRow}><Ionicons name="phone-portrait-outline" size={13} color={COLORS.textMuted} /><Text style={styles.phoneText}> {phone}</Text></View>
            : <View style={styles.phoneRow}><Ionicons name="phone-portrait-outline" size={13} color={COLORS.accent} /><Text style={styles.phoneAdd}> Add phone number</Text></View>
          }
        </View>
        <View style={styles.editProfileBtn}>
          <Ionicons name="pencil-outline" size={16} color={COLORS.accent} />
          <Text style={styles.editProfileText}>Edit</Text>
        </View>
      </TouchableOpacity>

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
            onValueChange={handleNotificationToggle}
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
            onValueChange={handleBudgetAlertsToggle}
            disabled={!notificationsEnabled}
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
                {selectedCurrency?.flag + ' ' + currency + ' — ' + (selectedCurrency?.name || '')}
              </Text>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={16} color={COLORS.textMuted} />
        </TouchableOpacity>
        <View style={styles.divider} />

        <TouchableOpacity style={styles.row} onPress={() => router.push('/manage-data')}>
          <View style={styles.rowLeft}>
            <View style={[styles.rowIcon, { backgroundColor: '#5B9BD522' }]}>
              <Ionicons name="server-outline" size={18} color="#5B9BD5" />
            </View>
            <View>
              <Text style={styles.rowTitle}>Manage Data</Text>
              <Text style={styles.rowSubtitle}>Backup and recurring expenses</Text>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={16} color={COLORS.textMuted} />
        </TouchableOpacity>
      </View>

      <Text style={[styles.sectionLabel, { marginTop: 8 }]}>ABOUT</Text>
      <View style={styles.card}>
        <View style={[styles.row, { paddingVertical: 10 }]}>
          <View style={styles.rowLeft}>
            <View style={[styles.rowIcon, { backgroundColor: '#6C63FF22' }]}>
              <Ionicons name="information-circle-outline" size={18} color={COLORS.accent} />
            </View>
            <View>
              <Text style={styles.rowTitle}>Version</Text>
              <Text style={styles.rowSubtitle}>{'Savr v' + APP_VERSION}</Text>
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

        <TouchableOpacity style={styles.row} onPress={handleShareApp}>
          <View style={styles.rowLeft}>
            <View style={[styles.rowIcon, { backgroundColor: '#30D15822' }]}>
              <Ionicons name="share-social-outline" size={18} color='#30D158' />
            </View>
            <View>
              <Text style={styles.rowTitle}>Share Savr</Text>
              <Text style={styles.rowSubtitle}>Invite friends to track smarter</Text>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={16} color={COLORS.textMuted} />
        </TouchableOpacity>

        <View style={styles.divider} />

        <TouchableOpacity
          style={styles.row}
          onPress={() => Linking.openURL('https://play.google.com/store/apps/details?id=com.saver.savr')}
        >
          <View style={styles.rowLeft}>
            <View style={[styles.rowIcon, { backgroundColor: '#FFD70022' }]}>
              <Ionicons name="star-outline" size={18} color='#FFD700' />
            </View>
            <View>
              <Text style={styles.rowTitle}>Rate Savr</Text>
              <Text style={styles.rowSubtitle}>Enjoying the app? Leave a review</Text>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={16} color={COLORS.textMuted} />
        </TouchableOpacity>

        <View style={styles.divider} />

        <TouchableOpacity
          style={styles.row}
          onPress={() => Linking.openURL('https://007wary.github.io')}
        >
          <View style={styles.rowLeft}>
            <View style={[styles.rowIcon, { backgroundColor: '#00BCD422' }]}>
              <Ionicons name="help-circle-outline" size={18} color='#00BCD4' />
            </View>
            <View>
              <Text style={styles.rowTitle}>Help & Support</Text>
              <Text style={styles.rowSubtitle}>Visit our website for help and FAQs</Text>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={16} color={COLORS.textMuted} />
        </TouchableOpacity>

        <View style={styles.divider} />

        <TouchableOpacity
          style={styles.row}
          onPress={() => Linking.openURL('mailto:007mwnswrangwary@gmail.com?subject=Savr%20App%20Feedback')}
        >
          <View style={styles.rowLeft}>
            <View style={[styles.rowIcon, { backgroundColor: '#4CAF5022' }]}>
              <Ionicons name="mail-outline" size={18} color='#4CAF50' />
            </View>
            <View>
              <Text style={styles.rowTitle}>Send Feedback</Text>
              <Text style={styles.rowSubtitle}>Share your thoughts and suggestions</Text>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={16} color={COLORS.textMuted} />
        </TouchableOpacity>
      </View>

      <Text style={[styles.sectionLabel, { marginTop: 8 }]}>ACCOUNT</Text>
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
        <Text style={styles.footerSub}>{'Savr v' + APP_VERSION + ' · © 2026'}</Text>
      </View>

      </ScrollView>

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

      <BottomSheet visible={profileModalVisible} onClose={() => setProfileModalVisible(false)}>
  <KeyboardAvoidingView
    behavior={Platform.OS === 'ios' ? 'padding' : 'padding'}
    keyboardVerticalOffset={Platform.OS === 'android' ? 180 : 100}
    style={{ flex: 1 }}
  >
    <ScrollView
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ paddingBottom: 40 }}
    >
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Edit Profile</Text>
              <TouchableOpacity onPress={() => setProfileModalVisible(false)}>
                <Ionicons name="close" size={22} color={COLORS.textMuted} />
              </TouchableOpacity>
            </View>
            {avatarUrl ? (
              <Image source={{ uri: avatarUrl }} style={styles.modalAvatarImage} />
            ) : (
              <View style={styles.modalAvatar}>
                <Text style={styles.modalAvatarText}>{getInitials()}</Text>
              </View>
            )}
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
    </View>
  )
}

const styles = StyleSheet.create({
  outerContainer: { flex: 1, backgroundColor: COLORS.bg },
  stickyHeader: { paddingTop: SCREEN.paddingTop, paddingHorizontal: SCREEN.paddingHorizontal, paddingBottom: 8, backgroundColor: COLORS.bg, flexDirection: 'row', alignItems: 'center' },
  scrollView: { flex: 1, paddingHorizontal: SCREEN.paddingHorizontal, backgroundColor: COLORS.bg },
  heading: { fontSize: 28, fontWeight: '800', color: COLORS.text, letterSpacing: -0.8 },
  profileCard: { flexDirection: 'row', alignItems: 'center', paddingVertical: 20, marginBottom: 0, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  avatar: { width: 56, height: 56, borderRadius: 28, backgroundColor: COLORS.accent, justifyContent: 'center', alignItems: 'center', marginRight: 16 },
  avatarImage: { width: 56, height: 56, borderRadius: 28, marginRight: 16, borderWidth: 2, borderColor: COLORS.accent },
  avatarText: { fontSize: 20, fontWeight: '700', color: '#fff' },
  profileInfo: { flex: 1 },
  displayName: { fontSize: 18, fontWeight: '800', color: COLORS.text, marginBottom: 2, letterSpacing: -0.3 },
  email: { fontSize: 13, color: COLORS.textMuted },
  phoneRow: { flexDirection: 'row', alignItems: 'center', marginTop: 2 },
  phoneText: { fontSize: 13, color: COLORS.textMuted, marginTop: 2 },
  phoneAdd: { fontSize: 13, color: COLORS.accent, marginTop: 2 },
  editProfileBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  editProfileText: { fontSize: 13, color: COLORS.accent, fontWeight: '600' },
  sectionLabel: { fontSize: 11, fontWeight: '700', color: COLORS.textMuted, letterSpacing: 1.2, marginTop: 24, marginBottom: 10, marginLeft: 4 },
  card: { marginBottom: 24 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 16, paddingHorizontal: 4 },
  rowLeft: { flexDirection: 'row', alignItems: 'center', gap: 14, flex: 1 },
  rowIcon: { width: 36, height: 36, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  rowTitle: { fontSize: 15, color: COLORS.text, fontWeight: '500' },
  rowSubtitle: { fontSize: 12, color: COLORS.textMuted, marginTop: 1 },
  divider: { height: 1, backgroundColor: COLORS.border },
  versionPill: { backgroundColor: COLORS.accent + '22', borderRadius: 20, paddingVertical: 4, paddingHorizontal: 10, borderWidth: 1, borderColor: COLORS.accent + '44' },
  versionPillText: { fontSize: 12, color: COLORS.accent, fontWeight: '700' },
  footer: { alignItems: 'center', marginTop: 8, marginBottom: 8 },
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
  modalAvatarImage: { width: 72, height: 72, borderRadius: 36, alignSelf: 'center', marginBottom: 24, borderWidth: 2, borderColor: COLORS.accent },
  modalAvatarText: { fontSize: 26, fontWeight: '700', color: '#fff' },
  label: { fontSize: 13, color: COLORS.textMuted, marginBottom: 8, marginLeft: 2 },
  input: { backgroundColor: COLORS.cardAlt, borderRadius: 12, padding: 14, color: COLORS.text, fontSize: 15, borderWidth: 1, borderColor: COLORS.border, marginBottom: 16 },
  readOnlyInput: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: COLORS.cardAlt, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: COLORS.border, marginBottom: 24 },
  readOnlyText: { fontSize: 15, color: COLORS.textMuted },
  saveBtn: { backgroundColor: COLORS.accent, borderRadius: 12, padding: 16, alignItems: 'center', marginBottom: 8 },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
})