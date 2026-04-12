import { useState } from 'react'
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView, Platform,
  ActivityIndicator
} from 'react-native'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../src/lib/supabase'
import { COLORS } from '../src/constants/theme'
import CustomAlert from '../src/components/CustomAlert'
import useAlert from '../src/hooks/useAlert'

export default function ResetPassword() {
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [showNew, setShowNew] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const { alertConfig, showAlert, hideAlert } = useAlert()
  const router = useRouter()

  async function handleReset() {
    if (!newPassword || !confirmPassword) {
      return showAlert('Error', 'Please fill in all fields')
    }
    if (newPassword.length < 6) {
      return showAlert('Error', 'Password must be at least 6 characters')
    }
    if (newPassword !== confirmPassword) {
      return showAlert('Error', 'Passwords do not match')
    }

    setLoading(true)
    const { error } = await supabase.auth.updateUser({
      password: newPassword
    })
    setLoading(false)

    if (error) {
      return showAlert('Error', error.message)
    }

    showAlert(
      '✅ Password Reset!',
      'Your password has been updated successfully. Please sign in with your new password.',
      [{
        text: 'Sign In',
        onPress: async () => {
          await supabase.auth.signOut()
          router.replace('/(auth)/login')
        }
      }]
    )
  }

  function getStrength() {
    if (newPassword.length === 0) return null
    if (newPassword.length < 6) return { label: 'Too short', color: COLORS.accentRed, bars: 1 }
    if (newPassword.length < 8) return { label: 'Weak', color: COLORS.accentRed, bars: 1 }
    if (newPassword.length < 10) return { label: 'Fair', color: COLORS.accentYellow, bars: 2 }
    if (newPassword.length < 12) return { label: 'Good', color: COLORS.accentGreen, bars: 3 }
    return { label: 'Strong', color: COLORS.accentGreen, bars: 4 }
  }

  const strength = getStrength()

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <View style={styles.inner}>
        {/* Header */}
        <View style={styles.iconBox}>
          <Ionicons name="lock-open-outline" size={40} color={COLORS.accent} />
        </View>
        <Text style={styles.title}>Reset Password</Text>
        <Text style={styles.subtitle}>
          Enter your new password below
        </Text>

        {/* New Password */}
        <Text style={styles.label}>New Password</Text>
        <View style={styles.inputRow}>
          <TextInput
            style={styles.input}
            placeholder="Min. 6 characters"
            placeholderTextColor={COLORS.textMuted}
            value={newPassword}
            onChangeText={setNewPassword}
            secureTextEntry={!showNew}
            autoFocus
          />
          <TouchableOpacity
            style={styles.eyeBtn}
            onPress={() => setShowNew(!showNew)}
          >
            <Ionicons
              name={showNew ? 'eye-off-outline' : 'eye-outline'}
              size={20} color={COLORS.textMuted}
            />
          </TouchableOpacity>
        </View>

        {/* Password strength */}
        {strength && (
          <View style={styles.strengthRow}>
            {[1, 2, 3, 4].map(i => (
              <View
                key={i}
                style={[
                  styles.strengthBar,
                  { backgroundColor: i <= strength.bars ? strength.color : COLORS.border }
                ]}
              />
            ))}
            <Text style={[styles.strengthText, { color: strength.color }]}>
              {strength.label}
            </Text>
          </View>
        )}

        {/* Confirm Password */}
        <Text style={styles.label}>Confirm Password</Text>
        <View style={styles.inputRow}>
          <TextInput
            style={styles.input}
            placeholder="Repeat new password"
            placeholderTextColor={COLORS.textMuted}
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            secureTextEntry={!showConfirm}
          />
          <TouchableOpacity
            style={styles.eyeBtn}
            onPress={() => setShowConfirm(!showConfirm)}
          >
            <Ionicons
              name={showConfirm ? 'eye-off-outline' : 'eye-outline'}
              size={20} color={COLORS.textMuted}
            />
          </TouchableOpacity>
        </View>

        {/* Match indicator */}
        {confirmPassword.length > 0 && (
          <View style={styles.matchRow}>
            <Ionicons
              name={newPassword === confirmPassword ? 'checkmark-circle' : 'close-circle'}
              size={16}
              color={newPassword === confirmPassword ? COLORS.accentGreen : COLORS.accentRed}
            />
            <Text style={[
              styles.matchText,
              { color: newPassword === confirmPassword ? COLORS.accentGreen : COLORS.accentRed }
            ]}>
              {newPassword === confirmPassword ? 'Passwords match' : 'Passwords do not match'}
            </Text>
          </View>
        )}

        {/* Reset Button */}
        <TouchableOpacity
          style={[styles.btn, loading && { opacity: 0.7 }]}
          onPress={handleReset}
          disabled={loading}
        >
          {loading
            ? <ActivityIndicator color="#fff" size="small" />
            : <Text style={styles.btnText}>Reset Password</Text>
          }
        </TouchableOpacity>

        {/* Back to login */}
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => router.replace('/(auth)/login')}
        >
          <Ionicons name="arrow-back" size={16} color={COLORS.textMuted} />
          <Text style={styles.backText}>Back to Sign In</Text>
        </TouchableOpacity>
      </View>

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
  inner: {
    flex: 1, paddingHorizontal: 28,
    paddingTop: 80, paddingBottom: 40,
  },
  iconBox: {
    width: 80, height: 80, borderRadius: 24,
    backgroundColor: COLORS.accent + '22',
    justifyContent: 'center', alignItems: 'center',
    marginBottom: 24, borderWidth: 1,
    borderColor: COLORS.accent + '44',
  },
  title: {
    fontSize: 28, fontWeight: '900', color: COLORS.text,
    letterSpacing: -0.8, marginBottom: 8,
  },
  subtitle: {
    fontSize: 15, color: COLORS.textMuted,
    marginBottom: 32, lineHeight: 22,
  },
  label: {
    fontSize: 13, color: COLORS.textMuted,
    marginBottom: 8, marginLeft: 2,
  },
  inputRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: COLORS.card, borderRadius: 12,
    borderWidth: 1, borderColor: COLORS.border,
    marginBottom: 12,
  },
  input: {
    flex: 1, padding: 16,
    color: COLORS.text, fontSize: 15,
  },
  eyeBtn: { padding: 16 },
  strengthRow: {
    flexDirection: 'row', alignItems: 'center',
    gap: 6, marginBottom: 20,
  },
  strengthBar: { flex: 1, height: 4, borderRadius: 2 },
  strengthText: { fontSize: 11, fontWeight: '600', marginLeft: 4 },
  matchRow: {
    flexDirection: 'row', alignItems: 'center',
    gap: 6, marginBottom: 20,
  },
  matchText: { fontSize: 12, fontWeight: '600' },
  btn: {
    backgroundColor: COLORS.accent, borderRadius: 12,
    padding: 16, alignItems: 'center',
    marginBottom: 16, marginTop: 8,
  },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  backBtn: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', gap: 6, padding: 12,
  },
  backText: { fontSize: 14, color: COLORS.textMuted, fontWeight: '500' },
})