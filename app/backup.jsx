import { useState, useCallback, useEffect, useMemo } from 'react'
import {
  View, Text, StyleSheet, TouchableOpacity,
  ActivityIndicator, ScrollView
} from 'react-native'
import { useFocusEffect, useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { SCREEN } from '../src/constants/theme'
import { useTheme } from '../src/lib/themeContext'
import { getUser, getCachedUser } from '../src/lib/auth'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { hasDataChanged, reauthorizeDrive } from '../src/services/driveBackupService'
import { backupNow } from '../src/services/backgroundBackup'
import CustomAlert from '../src/components/CustomAlert'
import useAlert from '../src/hooks/useAlert'

const LAST_BACKUP_TRIGGER_KEY = 'savr_last_backup_trigger'

export default function BackupScreen() {
  const { COLORS } = useTheme()
  const insets = useSafeAreaInsets()
  const [lastBackup, setLastBackup] = useState(null)
  const [isUpToDate, setIsUpToDate] = useState(false)
  const [loading, setLoading] = useState(true)
  const [backingUp, setBackingUp] = useState(false)
  const [isOnline, setIsOnline] = useState(true)

  useEffect(() => {
    async function preload() {
      try {
        const [time, cached] = await Promise.all([
          AsyncStorage.getItem('savr_last_backup'),
          AsyncStorage.getItem('savr_is_up_to_date'),
        ])
        if (time) { setLastBackup(time); setLoading(false) }
        if (cached === 'true') { setIsUpToDate(true) }
      } catch {}
    }
    preload()
  }, [])
  const { alertConfig, showAlert, hideAlert } = useAlert()
  const router = useRouter()

  async function checkOnlineStatus() {
    try {
      // fetch() has no built-in timeout — on a captive portal or a dead network
      // that silently drops packets instead of erroring, an unbounded await here
      // would leave the backup button stuck on "Backing up..." forever. Race it
      // against a hard timeout so a bad network always resolves to "offline".
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 8000)
      try {
        await fetch('https://www.google.com', { method: 'HEAD', cache: 'no-cache', signal: controller.signal })
        return true
      } finally {
        clearTimeout(timeout)
      }
    } catch {
      return false
    }
  }

  const loadBackupStatus = useCallback(async () => {
    try {
      const online = await checkOnlineStatus()
      setIsOnline(online)
      const lastBackupTime = await AsyncStorage.getItem('savr_last_backup')
      setLastBackup(lastBackupTime)
      if (lastBackupTime) {
        const user = getCachedUser() || await getUser()
        if (user) {
          const changed = await hasDataChanged(user.id)
          const upToDate = !changed
          setIsUpToDate(upToDate)
          await AsyncStorage.setItem('savr_is_up_to_date', upToDate ? 'true' : 'false')
        }
      } else {
        setIsUpToDate(false)
        await AsyncStorage.setItem('savr_is_up_to_date', 'false')
      }
    } catch {}
    finally {
      setLoading(false)
    }
  }, [])

  useFocusEffect(useCallback(() => { loadBackupStatus() }, [loadBackupStatus]))

  async function handleBackupNow() {
    const online = await checkOnlineStatus()
    if (!online) {
      return showAlert('You\'re Offline', 'Please connect to the internet to backup your data.')
    }
    if (isUpToDate) {
      return showAlert('Already Up To Date', 'Your backup is already up to date. No new changes to backup.')
    }
    setBackingUp(true)
    let result = await backupNow()
    // A token failure usually just means the Drive access token lapsed and the
    // native session needs re-consent — not that the whole app login is dead.
    // Re-authorize inline and retry once before falling back to the hard message,
    // so the common case never asks the user to sign out of the app.
    if (!result.success && (result.error === 'NO_TOKEN' || result.error === 'SESSION_EXPIRED')) {
      const reauthed = await reauthorizeDrive()
      if (reauthed) result = await backupNow()
    }
    setBackingUp(false)
    if (result.success) {
      setLastBackup(result.backedUpAt)
      setIsUpToDate(true)
      await AsyncStorage.setItem('savr_is_up_to_date', 'true')
      await AsyncStorage.setItem(LAST_BACKUP_TRIGGER_KEY, new Date().toISOString().split('T')[0])
      showAlert('✅ Backup Successful', 'Your data has been backed up to Google Drive.')
    } else if (result.error === 'NO_TOKEN' || result.error === 'SESSION_EXPIRED') {
      showAlert('Google Access Needed', 'Savr needs permission to save your backup to Google Drive. Please try again and approve access.')
    } else if (result.error === 'NO_DATA') {
      showAlert('Nothing to Backup', 'Add expenses, income, accounts, or budgets before backing up.')
    } else {
      showAlert('Backup Failed', result.error || 'Something went wrong. Please try again.')
    }
  }

  function formatBackupDate(dateStr) {
    try {
      const d = new Date(dateStr)
      if (isNaN(d.getTime())) return null
      return {
        date: d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }),
        time: d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: true }),
      }
    } catch {
      return null
    }
  }

  const backupDate = lastBackup ? formatBackupDate(lastBackup) : null

  const styles = useMemo(() => StyleSheet.create({
    container: { flex: 1, backgroundColor: COLORS.bg, paddingTop: insets.top + 8, paddingHorizontal: SCREEN.paddingHorizontal },
    header: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 24 },
    backBtn: { padding: 4 },
    heading: { fontSize: 24, fontWeight: '800', color: COLORS.text, letterSpacing: -0.8 },
    statusCard: { borderRadius: 20, padding: 32, alignItems: 'center', marginBottom: 16, borderWidth: 1, borderColor: COLORS.border },
    statusIconBox: { marginBottom: 16 },
    statusTitle: { fontSize: 22, fontWeight: '800', color: COLORS.text, letterSpacing: -0.5, marginBottom: 8 },
    statusSub: { fontSize: 13, color: COLORS.textMuted, textAlign: 'center', lineHeight: 20 },
    infoCard: { backgroundColor: COLORS.card, borderRadius: 16, borderWidth: 1, borderColor: COLORS.border, marginBottom: 16, overflow: 'hidden' },
    infoRow: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16 },
    infoIconBox: { width: 36, height: 36, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
    infoText: { flex: 1 },
    infoLabel: { fontSize: 11, color: COLORS.textMuted, letterSpacing: 0.5, marginBottom: 2 },
    infoValue: { fontSize: 15, color: COLORS.text, fontWeight: '600' },
    infoSub: { fontSize: 12, color: COLORS.textMuted, marginTop: 2 },
    divider: { height: 1, backgroundColor: COLORS.border, marginLeft: 66 },
    backupBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.accent, borderRadius: 14, padding: 18, marginBottom: 16 },
    backupBtnDisabled: { backgroundColor: COLORS.cardAlt, borderWidth: 1, borderColor: COLORS.border },
    backupBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
    noteCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, backgroundColor: COLORS.card, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: COLORS.border },
    noteText: { flex: 1, fontSize: 12, color: COLORS.textMuted, lineHeight: 18 },
  }), [COLORS, insets.top])

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.heading}>Backup</Text>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 60 }}>
        <View style={styles.infoCard}>
          <View style={styles.infoRow}>
            <View style={[styles.infoIconBox, { backgroundColor: '#34C75922' }]}>
              <Ionicons name="time-outline" size={18} color="#34C759" />
            </View>
            <View style={styles.infoText}>
              <Text style={styles.infoLabel}>Last Backup</Text>
              {loading ? (
                <View style={{ height: 18, width: 140, backgroundColor: COLORS.border, borderRadius: 4, marginTop: 2 }} />
              ) : backupDate ? (
                <>
                  <Text style={styles.infoValue}>{backupDate.date}</Text>
                  <Text style={styles.infoSub}>{backupDate.time}</Text>
                </>
              ) : (
                <Text style={styles.infoValue}>Never</Text>
              )}
            </View>
          </View>
        </View>

        <TouchableOpacity
          style={[
            styles.backupBtn,
            (isUpToDate || !isOnline) && styles.backupBtnDisabled,
            backingUp && { opacity: 0.7 }
          ]}
          onPress={handleBackupNow}
          disabled={backingUp}
          activeOpacity={0.85}
        >
          {backingUp
            ? <ActivityIndicator size="small" color="#fff" style={{ marginRight: 10 }} />
            : <Ionicons name="cloud-upload-outline" size={20} color="#fff" style={{ marginRight: 10 }} />
          }
          <Text style={styles.backupBtnText}>
            {backingUp ? 'Backing up...' : isUpToDate ? 'Already Up To Date' : 'Backup Now'}
          </Text>
        </TouchableOpacity>

        <View style={styles.noteCard}>
          <Ionicons name="information-circle-outline" size={16} color={COLORS.textMuted} />
          <Text style={styles.noteText}>
            Your data is automatically backed up whenever you add, edit, or delete a transaction, and each time you open the app.
          </Text>
        </View>
      </ScrollView>

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