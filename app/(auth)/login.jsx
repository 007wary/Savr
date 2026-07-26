import { useState, useMemo } from 'react'
import {
  View, Text, TouchableOpacity,
  StyleSheet, ActivityIndicator
} from 'react-native'
import { GoogleSignin } from '@react-native-google-signin/google-signin'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { cacheGoogleAccessToken } from '../../src/lib/googleAccessToken'
import { supabase } from '../../src/lib/supabase'
import { SCREEN } from '../../src/constants/theme'
import { useTheme } from '../../src/lib/themeContext'
import CustomAlert from '../../src/components/CustomAlert'
import useAlert from '../../src/hooks/useAlert'
import { Ionicons } from '@expo/vector-icons'
import { setSigningIn } from '../../src/lib/authState'
import { signalFirstPaint } from '../../src/lib/splashSignal'
import { openLegalDoc } from '../../src/lib/legalViewer'

export default function Login() {
  const { COLORS } = useTheme()
  const insets = useSafeAreaInsets()
  const [googleLoading, setGoogleLoading] = useState(false)
  const { alertConfig, showAlert, hideAlert } = useAlert()

  async function handleGoogleLogin() {
    try {
      setGoogleLoading(true)

      await GoogleSignin.hasPlayServices()
      await GoogleSignin.signIn()
      const { idToken, accessToken } = await GoogleSignin.getTokens()
      if (!idToken) throw new Error('No ID token returned from Google Sign-In')

      setSigningIn(true)
      const { error } = await supabase.auth.signInWithIdToken({
        provider: 'google',
        token: idToken,
      })
      if (error) throw error
      // Leave signingIn=true here — clearing it is _layout.jsx's job, once its
      // onAuthStateChange listener has actually observed the new session. If we
      // clear it here first, there's a window where signingIn=false but the
      // layout's session state hasn't updated yet, and the redirect effect just
      // leaves the user stranded on the login screen.

      try {
        if (accessToken) await cacheGoogleAccessToken(accessToken)
      } catch {}
    } catch (err) {
      console.error('Google sign-in failed', err)
      showAlert('Sign In Failed', 'Something went wrong. Please try again.')
      setSigningIn(false)
    } finally {
      setGoogleLoading(false)
    }
  }

  function openPrivacyPolicy() {
    openLegalDoc('privacy').catch(() => {})
  }

  function openTerms() {
    openLegalDoc('terms').catch(() => {})
  }

  const styles = useMemo(() => StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  inner: {
    flex: 1, paddingHorizontal: SCREEN.paddingHorizontal,
    justifyContent: 'center', paddingBottom: 40, paddingTop: insets.top + 8,
  },
  logoSection: { alignItems: 'center', marginBottom: 24, marginTop: -20 },
  logoText: {
    fontSize: 42, fontWeight: '900', color: COLORS.accent,
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
  acceptText: {
    fontSize: 12.5, color: COLORS.textMuted, lineHeight: 18,
    textAlign: 'center', marginTop: 4,
  },
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
  googleBtnText: {
    color: COLORS.text, fontWeight: '700',
    fontSize: 16, letterSpacing: -0.3,
  },
  }), [COLORS, insets.top])

  return (
    <View style={styles.container} onLayout={signalFirstPaint}>
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

        <TouchableOpacity
          style={styles.googleBtn}
          onPress={handleGoogleLogin}
          disabled={googleLoading}
          activeOpacity={0.85}
        >
          {googleLoading
            ? <ActivityIndicator size="small" color={COLORS.text} />
            : <Ionicons name="logo-google" size={20} color="#DB4437" />
          }
          <Text style={styles.googleBtnText}>
            {googleLoading ? 'Signing in...' : 'Continue with Google'}
          </Text>
        </TouchableOpacity>

        <Text style={styles.acceptText}>
          By continuing, you agree to our{' '}
          <Text style={styles.acceptLink} onPress={openTerms}>Terms of Service</Text>
          {' '}and{' '}
          <Text style={styles.acceptLink} onPress={openPrivacyPolicy}>Privacy Policy</Text>
        </Text>
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