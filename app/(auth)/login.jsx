import { useState, useMemo } from 'react'
import {
  View, Text, TouchableOpacity,
  StyleSheet, ActivityIndicator
} from 'react-native'
import * as SecureStore from 'expo-secure-store'
import { cacheGoogleAccessToken } from '../../src/lib/googleAccessToken'
import { supabase } from '../../src/lib/supabase'
import { SCREEN } from '../../src/constants/theme'
import { useTheme } from '../../src/lib/themeContext'
import CustomAlert from '../../src/components/CustomAlert'
import useAlert from '../../src/hooks/useAlert'
import { Ionicons } from '@expo/vector-icons'
import * as WebBrowser from 'expo-web-browser'
import * as AuthSession from 'expo-auth-session'
import { useRouter } from 'expo-router'
import { setSigningIn } from '../../src/lib/authState'

WebBrowser.maybeCompleteAuthSession()

export default function Login() {
  const { COLORS } = useTheme()
  const [googleLoading, setGoogleLoading] = useState(false)
  const [accepted, setAccepted] = useState(false)
  const { alertConfig, showAlert, hideAlert } = useAlert()
  const router = useRouter()

  async function handleGoogleLogin() {
    if (!accepted) {
      return showAlert(
        'Accept Terms',
        'Please accept the Privacy Policy and Terms of Service to continue.'
      )
    }
    try {
      setGoogleLoading(true)

      const existingRefreshToken = await SecureStore.getItemAsync('savr_google_refresh_token')

      const redirectUrl = AuthSession.makeRedirectUri({ scheme: 'savr' })
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: redirectUrl,
          skipBrowserRedirect: true,
          queryParams: {
            prompt: existingRefreshToken ? 'select_account' : 'consent',
            access_type: 'offline',
            scope: [
              'openid',
              'email',
              'profile',
              'https://www.googleapis.com/auth/drive.file',
            ].join(' '),
          },
        },
      })
      if (error) throw error

      setSigningIn(true)
      const result = await WebBrowser.openAuthSessionAsync(data.url, redirectUrl)

      if (result.type !== 'success') {
        return
      }

      const url = result.url
      const queryParams = new URLSearchParams(url.split('?')[1]?.split('#')[0] || '')
      const code = queryParams.get('code')

      if (!code) {
        return
      }

      const { data: sessionData, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)
      if (exchangeError) throw exchangeError
      // Leave signingIn=true here — clearing it is _layout.jsx's job, once its
      // onAuthStateChange listener has actually observed the new session. If we
      // clear it here first, there's a window where signingIn=false but the
      // layout's session state hasn't updated yet, and the redirect effect just
      // leaves the user stranded on the login screen.

      try {
        const provider_token = sessionData?.session?.provider_token
        const provider_refresh_token = sessionData?.session?.provider_refresh_token
        if (provider_token) await cacheGoogleAccessToken(provider_token)
        if (provider_refresh_token) await SecureStore.setItemAsync('savr_google_refresh_token', provider_refresh_token)
      } catch {}
    } catch (error) {
      showAlert('Sign In Failed', 'Something went wrong. Please try again.')
      setSigningIn(false)
    } finally {
      setGoogleLoading(false)
    }
  }

  function openPrivacyPolicy() {
    router.push({ pathname: '/webview', params: { type: 'privacy', title: 'Privacy Policy' } })
  }

  function openTerms() {
    router.push({ pathname: '/webview', params: { type: 'terms', title: 'Terms of Service' } })
  }

  const styles = useMemo(() => StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  inner: {
    flex: 1, paddingHorizontal: SCREEN.paddingHorizontal,
    justifyContent: 'center', paddingBottom: 40, paddingTop: SCREEN.paddingTop,
  },
  logoSection: { alignItems: 'center', marginBottom: 24, marginTop: -20 },
  logoText: {
    fontSize: 42, fontWeight: '900', color: COLORS.text,
    letterSpacing: -2, marginBottom: 6,
  },
  tagline: { fontSize: 15, color: COLORS.textMuted, letterSpacing: 0.3 },
  featureList: { gap: 10, marginBottom: 28 },
  featureItem: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: COLORS.card, borderRadius: 14,
    padding: 13, borderWidth: 1, borderColor: COLORS.border,
  },
  featureText: { fontSize: 14, color: COLORS.text, fontWeight: '500' },
  acceptRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: COLORS.card, borderRadius: 14,
    padding: 14, marginBottom: 16,
    borderWidth: 1, borderColor: COLORS.border,
  },
  checkbox: {
    width: 22, height: 22, borderRadius: 6,
    borderWidth: 2, borderColor: COLORS.border,
    justifyContent: 'center', alignItems: 'center',
  },
  checkboxChecked: {
    backgroundColor: COLORS.accent, borderColor: COLORS.accent,
  },
  acceptText: { flex: 1, fontSize: 13, color: COLORS.textMuted, lineHeight: 20 },
  acceptLink: { color: COLORS.accent, fontWeight: '600' },
  googleBtn: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', gap: 12,
    backgroundColor: COLORS.card, borderRadius: 16,
    padding: 18, marginBottom: 16,
    borderWidth: 1, borderColor: COLORS.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15, shadowRadius: 8, elevation: 4,
  },
  googleBtnDisabled: { opacity: 0.5 },
  googleBtnText: {
    color: COLORS.text, fontWeight: '700',
    fontSize: 16, letterSpacing: -0.3,
  },
  }), [COLORS])

  return (
    <View style={styles.container}>
      <View style={styles.inner}>
        <View style={styles.logoSection}>
          <Text style={styles.logoText}>Savr</Text>
          <Text style={styles.tagline}>Spend smart, save more</Text>
        </View>

        <View style={styles.featureList}>
          {[
            { icon: 'trending-up-outline', text: 'Track expenses, income & accounts' },
            { icon: 'pie-chart-outline', text: 'Beautiful spending insights & reports' },
            { icon: 'wallet-outline', text: 'Smart budget management' },
            { icon: 'cloud-offline-outline', text: 'Works fully offline, always' },
            { icon: 'sync-outline', text: 'Backup & sync via Google Drive' },
            { icon: 'flash-outline', text: 'AI-powered expense tracker' },
          ].map((f, i) => (
            <View key={i} style={styles.featureItem}>
              <Ionicons name={f.icon} size={20} color={COLORS.accent} />
              <Text style={styles.featureText}>{f.text}</Text>
            </View>
          ))}
        </View>

        <View style={styles.acceptRow}>
          <TouchableOpacity onPress={() => setAccepted(!accepted)} activeOpacity={0.7}>
            <View style={[styles.checkbox, accepted && styles.checkboxChecked]}>
              {accepted && <Ionicons name="checkmark" size={14} color="#fff" />}
            </View>
          </TouchableOpacity>
          <Text style={styles.acceptText}>
            I agree to the{' '}
            <Text style={styles.acceptLink} onPress={openTerms}>Terms of Service</Text>
            {' '}and{' '}
            <Text style={styles.acceptLink} onPress={openPrivacyPolicy}>Privacy Policy</Text>
          </Text>
        </View>

        <TouchableOpacity
          style={[styles.googleBtn, !accepted && styles.googleBtnDisabled]}
          onPress={handleGoogleLogin}
          disabled={googleLoading || !accepted}
          activeOpacity={0.85}
        >
          {googleLoading
            ? <ActivityIndicator size="small" color={COLORS.text} />
            : <Ionicons name="logo-google" size={20} color={accepted ? '#DB4437' : COLORS.textMuted} />
          }
          <Text style={[styles.googleBtnText, !accepted && { color: COLORS.textMuted }]}>
            {googleLoading ? 'Signing in...' : 'Continue with Google'}
          </Text>
        </TouchableOpacity>
      </View>

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