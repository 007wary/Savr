import { useState } from 'react'
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView, Platform, ScrollView
} from 'react-native'
import { useRouter } from 'expo-router'
import { supabase } from '../../src/lib/supabase'
import { COLORS } from '../../src/constants/theme'
import CustomAlert from '../../src/components/CustomAlert'
import useAlert from '../../src/hooks/useAlert'
import { Ionicons } from '@expo/vector-icons'
import * as WebBrowser from 'expo-web-browser'
import * as AuthSession from 'expo-auth-session'

WebBrowser.maybeCompleteAuthSession()

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const router = useRouter()
  const { alertConfig, showAlert, hideAlert } = useAlert()

  async function handleLogin() {
    if (!email || !password) return showAlert('Error', 'Please fill in all fields')
    setLoading(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    setLoading(false)
    if (error) {
      if (error.message.toLowerCase().includes('email not confirmed')) {
        return showAlert(
          'Email Not Confirmed',
          'Please check your inbox and click the confirmation link before signing in.'
        )
      }
      return showAlert('Error', error.message)
    }
  }

  async function handleGoogleLogin() {
    try {
      setGoogleLoading(true)
      const redirectUrl = AuthSession.makeRedirectUri({ scheme: 'savr' })
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: redirectUrl,
          skipBrowserRedirect: true,
        },
      })
      if (error) throw error
      const result = await WebBrowser.openAuthSessionAsync(data.url, redirectUrl)
      if (result.type === 'success') {
        const url = result.url
        const params = new URLSearchParams(url.split('#')[1] || url.split('?')[1])
        const access_token = params.get('access_token')
        const refresh_token = params.get('refresh_token')
        if (access_token) {
          await supabase.auth.setSession({ access_token, refresh_token })
        }
      }
    } catch (error) {
      showAlert('Error', error.message)
    } finally {
      setGoogleLoading(false)
    }
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <ScrollView contentContainerStyle={styles.inner} keyboardShouldPersistTaps="handled">
        <Text style={styles.logoText}>Savr</Text>
        <Text style={styles.title}>Welcome back</Text>
        <Text style={styles.subtitle}>Track every rupee, every day</Text>

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
          placeholder="••••••••"
          placeholderTextColor={COLORS.textMuted}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
        />

        <TouchableOpacity
          style={{ marginBottom: 20, alignItems: 'flex-end' }}
          onPress={() => router.push('/(auth)/forgot-password')}
        >
          <Text style={{ color: COLORS.accent, fontSize: 13, fontWeight: '600' }}>
            Forgot Password?
          </Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.btn} onPress={handleLogin} disabled={loading}>
          <Text style={styles.btnText}>{loading ? 'Signing in...' : 'Sign In'}</Text>
        </TouchableOpacity>

        <View style={styles.dividerRow}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>or</Text>
          <View style={styles.dividerLine} />
        </View>

        <TouchableOpacity
          style={styles.googleBtn}
          onPress={handleGoogleLogin}
          disabled={googleLoading}
        >
          <Ionicons name="logo-google" size={18} color={COLORS.text} style={{ marginRight: 10 }} />
          <Text style={styles.googleBtnText}>
            {googleLoading ? 'Signing in...' : 'Continue with Google'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={{ marginBottom: 16 }}
          onPress={async () => {
            if (!email) return showAlert('Enter Email', 'Please enter your email address first')
            const { error } = await supabase.auth.resend({ type: 'signup', email })
            if (error) return showAlert('Error', error.message)
            showAlert('Email Sent', 'Confirmation email resent! Check your inbox.')
          }}
        >
          <Text style={[styles.link, { color: COLORS.textMuted }]}>
            Didn't get confirmation email?{' '}
            <Text style={{ color: COLORS.accent }}>Resend</Text>
          </Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={() => router.push('/(auth)/register')}>
          <Text style={styles.link}>
            Don't have an account?{' '}
            <Text style={{ color: COLORS.accent }}>Sign up</Text>
          </Text>
        </TouchableOpacity>
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
  inner: { flexGrow: 1, justifyContent: 'center', padding: 28 },
  logoText: {
    fontSize: 48, fontWeight: '900', color: COLORS.accent,
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
  btn: {
    backgroundColor: COLORS.accent, borderRadius: 12, padding: 16,
    alignItems: 'center', marginBottom: 24,
  },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  dividerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  dividerLine: { flex: 1, height: 1, backgroundColor: COLORS.border },
  dividerText: { color: COLORS.textMuted, fontSize: 13, marginHorizontal: 12 },
  googleBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: COLORS.card, borderRadius: 12, padding: 16,
    marginBottom: 24, borderWidth: 1, borderColor: COLORS.border,
  },
  googleBtnText: { color: COLORS.text, fontWeight: '600', fontSize: 15 },
  link: { color: COLORS.textMuted, textAlign: 'center', fontSize: 14, marginBottom: 12 },
})