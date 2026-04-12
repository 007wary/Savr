import { useState } from 'react'
import {
  View, Text, TouchableOpacity,
  StyleSheet, ActivityIndicator
} from 'react-native'
import { supabase } from '../../src/lib/supabase'
import { COLORS } from '../../src/constants/theme'
import CustomAlert from '../../src/components/CustomAlert'
import useAlert from '../../src/hooks/useAlert'
import { Ionicons } from '@expo/vector-icons'
import { LinearGradient } from 'expo-linear-gradient'
import * as WebBrowser from 'expo-web-browser'
import * as AuthSession from 'expo-auth-session'
import { useRouter } from 'expo-router'

WebBrowser.maybeCompleteAuthSession()

export default function Login() {
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
      const redirectUrl = AuthSession.makeRedirectUri({ scheme: 'savr' })
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: redirectUrl,
          skipBrowserRedirect: true,
          queryParams: {
            prompt: 'select_account',
          },
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

  function openPrivacyPolicy() {
    router.push({
      pathname: '/webview',
      params: { type: 'privacy', title: 'Privacy Policy' }
    })
  }

  function openTerms() {
    router.push({
      pathname: '/webview',
      params: { type: 'terms', title: 'Terms of Service' }
    })
  }

  return (
    <View style={styles.container}>

      {/* Background gradient */}
      <LinearGradient
        colors={['#1A1033', '#0F0F0F']}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={styles.gradientBg}
      />

      <View style={styles.inner}>

        {/* Logo section */}
        <View style={styles.logoSection}>
          <LinearGradient
            colors={['#7C75FF', '#5A50FF']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.logoBox}
          >
            <Text style={styles.logoEmoji}>💰</Text>
          </LinearGradient>
          <Text style={styles.logoText}>Savr</Text>
          <Text style={styles.tagline}>Spend smart, save more</Text>
        </View>

        {/* Features list */}
        <View style={styles.featureList}>
          {[
            { icon: '⚡', text: 'Track expenses in seconds' },
            { icon: '🎯', text: 'Smart budget management' },
            { icon: '📊', text: 'Beautiful spending insights' },
            { icon: '🌍', text: '30+ currencies supported' },
          ].map((f, i) => (
            <View key={i} style={styles.featureItem}>
              <Text style={styles.featureIcon}>{f.icon}</Text>
              <Text style={styles.featureText}>{f.text}</Text>
            </View>
          ))}
        </View>

        {/* Terms acceptance checkbox */}
        <TouchableOpacity
          style={styles.acceptRow}
          onPress={() => setAccepted(!accepted)}
          activeOpacity={0.7}
        >
          <View style={[styles.checkbox, accepted && styles.checkboxChecked]}>
            {accepted && (
              <Ionicons name="checkmark" size={14} color="#fff" />
            )}
          </View>
          <Text style={styles.acceptText}>
            I agree to the{' '}
            <Text
              style={styles.acceptLink}
              onPress={openTerms}
            >
              Terms of Service
            </Text>
            {' '}and{' '}
            <Text
              style={styles.acceptLink}
              onPress={openPrivacyPolicy}
            >
              Privacy Policy
            </Text>
          </Text>
        </TouchableOpacity>

        {/* Google Sign In Button */}
        <TouchableOpacity
          style={[
            styles.googleBtn,
            googleLoading && { opacity: 0.7 },
            !accepted && styles.googleBtnDisabled,
          ]}
          onPress={handleGoogleLogin}
          disabled={googleLoading}
          activeOpacity={0.85}
        >
          {googleLoading ? (
            <ActivityIndicator size="small" color={COLORS.text} />
          ) : (
            <Ionicons
              name="logo-google"
              size={20}
              color={accepted ? '#DB4437' : COLORS.textMuted}
            />
          )}
          <Text style={[
            styles.googleBtnText,
            !accepted && { color: COLORS.textMuted }
          ]}>
            {googleLoading ? 'Signing in...' : 'Continue with Google'}
          </Text>
        </TouchableOpacity>

      </View>

      {/* Footer */}
      <View style={styles.footer}>
        <Text style={styles.footerText}><b>Savr</b> © 2026 All rights reserved.</Text>
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

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  gradientBg: {
    position: 'absolute', top: 0, left: 0, right: 0,
    height: '50%',
  },
  inner: {
  flex: 1, paddingHorizontal: 28,
  justifyContent: 'center', paddingBottom: 40,
  paddingTop: 60,
},
  logoSection: { alignItems: 'center', marginBottom: 40 },
  logoBox: {
    width: 80, height: 80, borderRadius: 24,
    justifyContent: 'center', alignItems: 'center',
    marginBottom: 16,
    shadowColor: '#6C63FF',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4, shadowRadius: 16, elevation: 10,
  },
  logoEmoji: { fontSize: 36 },
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
  featureIcon: { fontSize: 20 },
  featureText: { fontSize: 14, color: COLORS.text, fontWeight: '500' },
  acceptRow: {
    flexDirection: 'row', alignItems: 'center',
    gap: 12, marginBottom: 16,
    backgroundColor: COLORS.card, borderRadius: 14,
    padding: 14, borderWidth: 1, borderColor: COLORS.border,
  },
  checkbox: {
    width: 22, height: 22, borderRadius: 6,
    borderWidth: 2, borderColor: COLORS.border,
    justifyContent: 'center', alignItems: 'center',
    backgroundColor: 'transparent',
  },
  checkboxChecked: {
    backgroundColor: COLORS.accent,
    borderColor: COLORS.accent,
  },
  acceptText: {
    flex: 1, fontSize: 13,
    color: COLORS.textMuted, lineHeight: 20,
  },
  acceptLink: {
    color: COLORS.accent, fontWeight: '600',
  },
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
  googleBtnDisabled: {
    opacity: 0.5,
  },
  googleBtnText: {
    color: COLORS.text, fontWeight: '700',
    fontSize: 16, letterSpacing: -0.3,
  },
  footer: { paddingBottom: 32, alignItems: 'center' },
  footerText: { fontSize: 12, color: COLORS.border },
})