import { useState } from 'react'
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView, Platform, Alert, ScrollView
} from 'react-native'
import { useRouter } from 'expo-router'
import { supabase } from '../../src/lib/supabase'
import { COLORS } from '../../src/constants/theme'
import { Ionicons } from '@expo/vector-icons'
import { Linking } from 'react-native'

export default function Register() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [agreed, setAgreed] = useState(false)
  const router = useRouter()

  async function handleRegister() {
    if (!email || !password) return Alert.alert('Error', 'Please fill in all fields')
    if (password.length < 6) return Alert.alert('Error', 'Password must be at least 6 characters')
    if (!agreed) return Alert.alert('Required', 'Please agree to the Privacy Policy and Terms of Service to continue')

    setLoading(true)
    const { error } = await supabase.auth.signUp({ email, password })
    if (error) Alert.alert('Error', error.message)
    else Alert.alert(
      'Account Created! 🎉',
      'Check your email to confirm your account, then come back and sign in.',
      [{ text: 'OK', onPress: () => router.replace('/(auth)/login') }]
    )
    setLoading(false)
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <ScrollView contentContainerStyle={styles.inner} keyboardShouldPersistTaps="handled">
        <Text style={styles.logoText}>Savr</Text>
        <Text style={styles.title}>Create account</Text>
        <Text style={styles.subtitle}>Start tracking your expenses today</Text>

        <Text style={styles.label}>Email</Text>
        <TextInput
          style={styles.input}
          placeholder="you@example.com"
          placeholderTextColor={COLORS.textMuted}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
        />

        <Text style={styles.label}>Password</Text>
        <TextInput
          style={styles.input}
          placeholder="Min. 6 characters"
          placeholderTextColor={COLORS.textMuted}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
        />

        {/* Consent checkbox */}
        <View style={styles.checkboxRow}>
          <TouchableOpacity
            onPress={() => setAgreed(!agreed)}
            style={[styles.checkbox, agreed && styles.checkboxChecked]}
            activeOpacity={0.8}
          >
            {agreed && <Ionicons name="checkmark" size={14} color="#fff" />}
          </TouchableOpacity>
          <View style={styles.checkboxTextRow}>
            <Text style={styles.checkboxText}>I agree to the </Text>
            <TouchableOpacity
              onPress={() => router.push({
  pathname: '/(auth)/webview',
  params: { type: 'privacy', title: 'Privacy Policy' }
})}
            >
              <Text style={styles.link}>Privacy Policy</Text>
            </TouchableOpacity>
            <Text style={styles.checkboxText}> and </Text>
            <TouchableOpacity
              onPress={() => router.push({
  pathname: '/(auth)/webview',
  params: { type: 'terms', title: 'Terms of Service' }
})}
            >
              <Text style={styles.link}>Terms of Service</Text>
            </TouchableOpacity>
          </View>
        </View>

        <TouchableOpacity
          style={[styles.btn, !agreed && styles.btnDisabled]}
          onPress={handleRegister}
          disabled={loading}
        >
          <Text style={styles.btnText}>{loading ? 'Creating account...' : 'Sign Up'}</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.bottomLink}>
            Already have an account?{' '}
            <Text style={{ color: COLORS.accent }}>Sign in</Text>
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  inner: { flexGrow: 1, justifyContent: 'center', padding: 28 },
  logoText: {
    fontSize: 48, fontWeight: '900', color: '#FFFFFF',
    textAlign: 'center', marginBottom: 16, letterSpacing: -2,
  },
  title: { fontSize: 28, fontWeight: '700', color: COLORS.text, textAlign: 'center' },
  subtitle: { fontSize: 14, color: COLORS.textMuted, textAlign: 'center', marginBottom: 36 },
  label: { fontSize: 13, color: COLORS.textMuted, marginBottom: 6, marginLeft: 2 },
  input: {
    backgroundColor: COLORS.card, borderRadius: 12, padding: 16,
    color: COLORS.text, marginBottom: 18, fontSize: 15,
    borderWidth: 1, borderColor: COLORS.border,
  },
  checkboxRow: {
    flexDirection: 'row', alignItems: 'center',
    gap: 12, marginBottom: 24, marginTop: 4,
  },
  checkbox: {
    width: 22, height: 22, borderRadius: 6,
    borderWidth: 2, borderColor: COLORS.border,
    backgroundColor: COLORS.card,
    justifyContent: 'center', alignItems: 'center',
    flexShrink: 0,
  },
  checkboxChecked: {
    backgroundColor: COLORS.accent,
    borderColor: COLORS.accent,
  },
  checkboxTextRow: {
    flex: 1, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center',
  },
  checkboxText: { fontSize: 14, color: COLORS.textMuted, lineHeight: 22 },
  link: { fontSize: 14, color: COLORS.accent, fontWeight: '600', lineHeight: 22 },
  btn: {
    backgroundColor: COLORS.accent, borderRadius: 12,
    padding: 16, alignItems: 'center', marginBottom: 24,
  },
  btnDisabled: { opacity: 0.5 },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  bottomLink: { color: COLORS.textMuted, textAlign: 'center', fontSize: 14 },
})