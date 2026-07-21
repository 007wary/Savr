import { useState, useMemo, lazy, Suspense } from 'react'
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useTheme } from '../src/lib/themeContext'
import { PRIVACY_POLICY_HTML, TERMS_HTML } from '../src/constants/legal'

// Lazy so importing react-native-webview — which triggers Android System
// WebView / Chromium native init (measured ~3s, JS-thread-blocking, on some
// devices) — happens only when the user actually opens privacy/terms, NOT
// when expo-router evaluates this route module while building the navigator
// tree at cold launch. That eager evaluation was the launch stall.
const WebView = lazy(() =>
  import('react-native-webview').then((m) => ({ default: m.WebView }))
)

export default function WebViewScreen() {
  const { COLORS } = useTheme()
  const { type, title } = useLocalSearchParams()
  const router = useRouter()
  const [loading, setLoading] = useState(true)

  const html = type === 'privacy' ? PRIVACY_POLICY_HTML : TERMS_HTML

  const styles = useMemo(() => StyleSheet.create({
    container: { flex: 1, backgroundColor: COLORS.bg },
    header: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingTop: 56, paddingBottom: 16, paddingHorizontal: 20,
      backgroundColor: COLORS.card, borderBottomWidth: 1, borderBottomColor: COLORS.border,
    },
    backBtn: { width: 36, height: 36, justifyContent: 'center' },
    title: { fontSize: 16, fontWeight: '700', color: COLORS.text, flex: 1, textAlign: 'center' },
    loader: { ...StyleSheet.absoluteFillObject, justifyContent: 'center', alignItems: 'center', zIndex: 10 },
  }), [COLORS])

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
      <Suspense fallback={null}>
        <WebView
          source={{ html }}
          onLoadEnd={() => setLoading(false)}
          style={{ flex: 1, backgroundColor: COLORS.bg }}
          scrollEnabled
        />
      </Suspense>
    </View>
  )
}