import { useState, useMemo } from 'react'
import {
  View, Text, TouchableOpacity,
  StyleSheet, ActivityIndicator, ScrollView, Image
} from 'react-native'
import { GoogleSignin, isErrorWithCode, statusCodes } from '@react-native-google-signin/google-signin'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { LinearGradient } from 'expo-linear-gradient'
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
import { logError } from '../../src/lib/errorLog'

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
      setSigningIn(false)
      // The account-picker being dismissed rejects with SIGN_IN_CANCELLED —
      // that's the user changing their mind, not a failure, and showing an
      // alarming "Sign In Failed" alert for it is actively wrong. Same for
      // IN_PROGRESS (a double-tap racing the first sign-in): silently drop
      // it rather than stacking a second, confusing error on top.
      if (isErrorWithCode(err)) {
        if (err.code === statusCodes.SIGN_IN_CANCELLED || err.code === statusCodes.IN_PROGRESS) {
          return
        }
        if (err.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
          showAlert('Google Play Services Required', 'Please update Google Play Services and try again.')
          return
        }
      }
      // Fallback for cancellations that don't carry a matching statusCodes
      // value — the native module only normalizes to SIGN_IN_CANCELLED when
      // the underlying exception is a Google ApiException; a dismissal that
      // surfaces as some other exception type (seen on some Android/Play
      // Services combos) falls through with no matching code, but Google's
      // own message text for those still says "cancel". Catch that instead
      // of showing a false "Sign In Failed" for normal user-initiated exits.
      const msg = String(err?.message || '').toLowerCase()
      if (msg.includes('cancel')) {
        return
      }
      logError('login.handleGoogleLogin', err)
      showAlert('Sign In Failed', 'Something went wrong. Please try again.')
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
    flexGrow: 1, paddingHorizontal: SCREEN.paddingHorizontal,
    justifyContent: 'center', paddingBottom: 40, paddingTop: insets.top + 8,
  },
  logoSection: { alignItems: 'center', marginBottom: 20, marginTop: -20 },
  logoIcon: { width: 68, height: 68, borderRadius: 20, marginBottom: 14 },
  logoText: {
    fontSize: 34, fontWeight: '900', color: COLORS.accent,
    letterSpacing: -1.5, marginBottom: 6,
  },
  tagline: { fontSize: 15, color: COLORS.textMuted, letterSpacing: 0.3 },
  trustCard: {
    alignItems: 'center', gap: 6,
    backgroundColor: COLORS.card, borderRadius: 16,
    paddingVertical: 18, paddingHorizontal: 20, marginBottom: 28,
    borderWidth: 1, borderColor: COLORS.border,
  },
  trustHeadline: {
    fontSize: 15, fontWeight: '700', color: COLORS.text,
    textAlign: 'center', lineHeight: 21,
  },
  trustStatRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  trustStatText: { fontSize: 12.5, color: COLORS.textMuted, fontWeight: '600' },
  acceptText: {
    fontSize: 12.5, color: COLORS.textMuted, lineHeight: 18,
    textAlign: 'center', marginTop: 4,
  },
  acceptLink: { color: COLORS.accent, fontWeight: '600' },
  googleBtnGlow: {
    borderRadius: 18, padding: 1.5, marginBottom: 16,
    shadowColor: '#00D9A5',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 10, elevation: 6,
  },
  googleBtn: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', gap: 12,
    backgroundColor: COLORS.card, borderRadius: 16.5,
    padding: 17,
  },
  googleBtnText: {
    color: COLORS.text, fontWeight: '700',
    fontSize: 16, letterSpacing: -0.3,
  },
  privacyRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, marginBottom: 16,
  },
  privacyText: { fontSize: 12, color: COLORS.textMuted, fontWeight: '600' },
  }), [COLORS, insets.top])

  return (
    <View style={styles.container} onLayout={signalFirstPaint}>
      <ScrollView contentContainerStyle={styles.inner} showsVerticalScrollIndicator={false} bounces={false}>
        <View style={styles.logoSection}>
          <Image source={require('../../assets/icon.png')} style={styles.logoIcon} />
          <Text style={styles.logoText}>Savr</Text>
          <Text style={styles.tagline}>Spend smart, save more</Text>
        </View>

        <View style={styles.trustCard}>
          <Text style={styles.trustHeadline}>
            You&apos;re 10 seconds from your first insight
          </Text>
          <View style={styles.trustStatRow}>
            <Ionicons name="people" size={13} color={COLORS.accentGreen} />
            <Text style={styles.trustStatText}>Join thousands taking back control of their money</Text>
          </View>
        </View>

        <LinearGradient
          colors={['#00E5AD', '#6C63FF', '#FF9800']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.googleBtnGlow}
        >
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
        </LinearGradient>

        <View style={styles.privacyRow}>
          <Ionicons name="lock-closed" size={12} color={COLORS.accentGreen} />
          <Text style={styles.privacyText}>Bank-level privacy — your data never leaves your device</Text>
        </View>

        <Text style={styles.acceptText}>
          By continuing, you agree to our{' '}
          <Text style={styles.acceptLink} onPress={openTerms}>Terms of Service</Text>
          {' '}and{' '}
          <Text style={styles.acceptLink} onPress={openPrivacyPolicy}>Privacy Policy</Text>
        </Text>
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