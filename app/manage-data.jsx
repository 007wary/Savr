import { useState, useCallback } from 'react'
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity
} from 'react-native'
import { useFocusEffect, useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { COLORS, SCREEN } from '../src/constants/theme'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { checkBackupExists } from '../src/services/driveBackupService'

export default function ManageDataScreen() {
  const [lastBackup, setLastBackup] = useState(null)
  const router = useRouter()

  async function loadBackupTime() {
    try {
      const cached = await AsyncStorage.getItem('savr_last_backup')
      if (cached) setLastBackup(cached)
      checkBackupExists().then(info => {
        if (info?.modifiedTime) setLastBackup(info.modifiedTime)
      }).catch(() => {})
    } catch {}
  }

  useFocusEffect(useCallback(() => { loadBackupTime() }, []))

  function formatBackupDate(dateStr) {
    try {
      const d = new Date(dateStr)
      if (isNaN(d.getTime())) return 'No backup yet'
      return `Last backup: ${d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })} at ${d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })}`
    } catch {
      return 'No backup yet'
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.heading}>Manage Data</Text>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 60 }}>
        <View style={styles.card}>

          <TouchableOpacity style={styles.row} onPress={() => router.push('/backup')}>
            <View style={styles.rowLeft}>
              <View style={[styles.rowIcon, { backgroundColor: '#34C75922' }]}>
                <Ionicons name="cloud-outline" size={18} color="#34C759" />
              </View>
              <View>
                <Text style={styles.rowTitle}>Google Drive Backup</Text>
                <Text style={styles.rowSubtitle}>{formatBackupDate(lastBackup)}</Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={16} color={COLORS.textMuted} />
          </TouchableOpacity>

          <View style={styles.divider} />

          <TouchableOpacity style={styles.row} onPress={() => router.push('/recurring')}>
            <View style={styles.rowLeft}>
              <View style={[styles.rowIcon, { backgroundColor: COLORS.accent + '22' }]}>
                <Ionicons name="repeat-outline" size={18} color={COLORS.accent} />
              </View>
              <View>
                <Text style={styles.rowTitle}>Manage Recurring</Text>
                <Text style={styles.rowSubtitle}>View, edit or delete recurring expenses</Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={16} color={COLORS.textMuted} />
          </TouchableOpacity>

        </View>
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg, paddingTop: SCREEN.paddingTop, paddingHorizontal: SCREEN.paddingHorizontal },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 24 },
  backBtn: { padding: 4 },
  heading: { fontSize: 24, fontWeight: '800', color: COLORS.text, letterSpacing: -0.8 },
  card: {},
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16 },
  rowLeft: { flexDirection: 'row', alignItems: 'center', gap: 14, flex: 1 },
  rowIcon: { width: 36, height: 36, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  rowTitle: { fontSize: 15, color: COLORS.text, fontWeight: '500' },
  rowSubtitle: { fontSize: 12, color: COLORS.textMuted, marginTop: 1 },
  divider: { height: 1, backgroundColor: COLORS.border },
})