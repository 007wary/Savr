import { useState } from 'react'
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView, Platform, ScrollView
} from 'react-native'
import { useRouter } from 'expo-router'
import { supabase } from '../../src/lib/supabase'
import { COLORS } from '../../src/constants/theme'
import { Ionicons } from '@expo/vector-icons'
import CustomAlert from '../../src/components/CustomAlert'
import useAlert from '../../src/hooks/useAlert'

export default function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const router = useRouter()
  const { alertConfig, showAlert, hideAlert } = useAlert()

  async function handleReset() {
    if (!email) return showAlert('Error', 'Please enter your email address')
    setLoading(true)
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: 'savr://reset-password',
    })
    setLoading(false)
    if (error) return showAlert('Error', error.message)
    setSent(true)
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <ScrollView contentContainerStyle={styles.inner} keyboardShouldPersistTaps="handled">
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={COLORS.text} />
        </TouchableOpacity>

        <View style={styles.iconBox}>
          <Ionicons name="lock-closed-outline" size={48} color={COLORS.accent} />
        </View>

        <Text style={styles.title}>Forgot Password?</Text>
        <Text style={styles.subtitle}>
          Enter your email and we'll send you a link to reset your password
        </Text>

        {sent ? (
          <View style={styles.successBox}>
            <Ionicons name="checkmark-circle" size={48} color={COLORS.accentGreen} />
            <Text style={styles.successTitle}>Email Sent!</Text>
            <Text style={styles.successText}>
              Check your inbox for the password reset link
            </Text>
            <TouchableOpacity style={styles.btn} onPress={() => router.replace('/(auth)/login')}>
              <Text style={styles.btnText}>Back to Sign In</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <Text style={styles.label}>Email</Text>
            <TextInput
              style={styles.input}
              placeholder="you@example.com"
              placeholderTextColor={COLORS.textMuted}
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              autoFocus
            />
            <TouchableOpacity
              style={styles.btn}
              onPress={handleReset}
              disabled={loading}
            >
              <Text style={styles.btnText}>
                {loading ? 'Sending...' : 'Send Reset Link'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => router.back()}>
              <Text style={styles.link}>
                Remember your password?{' '}
                <Text style={{ color: COLORS.accent }}>Sign in</Text>
              </Text>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>

      <CustomAlert
        visible={alertConfig.visible}
        title={alertConfig.title}
        message={alertConfig.message}
        buttons={alertConfig.buttons}
        onClose={hideAlert}
      />
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  inner: { flexGrow: 1, padding: 28, paddingTop: 60 },
  backBtn: { marginBottom: 32 },
  iconBox: {
    width: 88, height: 88, borderRadius: 24,
    backgroundColor: COLORS.accent + '22',
    justifyContent: 'center', alignItems: 'center',
    alignSelf: 'center', marginBottom: 24,
  },
  title: { fontSize: 28, fontWeight: '800', color: COLORS.text, textAlign: 'center', letterSpacing: -0.5 },
  subtitle: { fontSize: 14, color: COLORS.textMuted, textAlign: 'center', marginBottom: 36, lineHeight: 22 },
  label: { fontSize: 13, color: COLORS.textMuted, marginBottom: 6, marginLeft: 2 },
  input: {
    backgroundColor: COLORS.card, borderRadius: 12, padding: 16,
    color: COLORS.text, marginBottom: 18, fontSize: 15,
    borderWidth: 1, borderColor: COLORS.border,
  },
  btn: {
    backgroundColor: COLORS.accent, borderRadius: 12, padding: 16,
    alignItems: 'center', marginBottom: 24,
  },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  link: { color: COLORS.textMuted, textAlign: 'center', fontSize: 14 },
  successBox: { alignItems: 'center', marginTop: 32, gap: 12 },
  successTitle: { fontSize: 24, fontWeight: '800', color: COLORS.text },
  successText: { fontSize: 14, color: COLORS.textMuted, textAlign: 'center', lineHeight: 22 },
})