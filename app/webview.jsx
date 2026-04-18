import { useState } from 'react'
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { WebView } from 'react-native-webview'
import { Ionicons } from '@expo/vector-icons'
import { COLORS } from '../src/constants/theme'
import { PRIVACY_POLICY_HTML, TERMS_HTML } from '../src/constants/legal'

export default function WebViewScreen() {
  const { type, title } = useLocalSearchParams()
  const router = useRouter()
  const [loading, setLoading] = useState(true)

  const html = type === 'privacy' ? PRIVACY_POLICY_HTML : TERMS_HTML

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.title}>{title}</Text>
        <View style={{ width: 36 }} />
      </View>
      {loading && (
        <View style={styles.loader}>
          <ActivityIndicator color={COLORS.accent} size="large" />
        </View>
      )}
      <WebView
        source={{ html }}
        onLoadEnd={() => setLoading(false)} onError={() => setLoading(false)}
        style={{ flex: 1, backgroundColor: COLORS.bg }}
        scrollEnabled
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingTop: 56, paddingBottom: 16, paddingHorizontal: 20,
    backgroundColor: COLORS.card, borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  backBtn: { width: 36, height: 36, justifyContent: 'center' },
  title: { fontSize: 16, fontWeight: '700', color: COLORS.text, flex: 1, textAlign: 'center' },
  loader: { ...StyleSheet.absoluteFillObject, justifyContent: 'center', alignItems: 'center', zIndex: 10 },
})
