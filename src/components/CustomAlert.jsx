import { View, Text, StyleSheet, Modal, TouchableOpacity } from 'react-native'
import { COLORS } from '../constants/theme'

export default function CustomAlert({ visible, title, message, buttons, onClose }) {
  if (!visible) return null

  const handlePress = (btn) => {
    onClose?.()
    setTimeout(() => {
      btn.onPress?.()
    }, 100)
  }

  const hasLongText = buttons?.some(btn => btn.text?.length > 10)
  const shouldStack = buttons?.length === 2 && hasLongText

  return (
    <Modal transparent animationType="fade" visible={visible} onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.box}>
          {title && <Text style={styles.title}>{title}</Text>}
          {message && <Text style={styles.message}>{message}</Text>}
          <View style={[
            styles.btnRow,
            buttons?.length === 1 && { justifyContent: 'center' },
            shouldStack && { flexDirection: 'column' },
          ]}>
            {buttons?.map((btn, i) => (
              <TouchableOpacity
                key={i}
                style={[
                  styles.btn,
                  btn.style === 'destructive' && styles.btnDestructive,
                  btn.style === 'cancel' && styles.btnCancel,
                  !btn.style && styles.btnDefault,
                  buttons.length === 1 && { flex: 0, paddingHorizontal: 40 },
                  shouldStack && { flex: 0, width: '100%' },
                ]}
                onPress={() => handlePress(btn)}
              >
                <Text style={[
                  styles.btnText,
                  btn.style === 'destructive' && styles.btnTextDestructive,
                  btn.style === 'cancel' && styles.btnTextCancel,
                  !btn.style && styles.btnTextDefault,
                ]}>
                  {btn.text}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center', alignItems: 'center', padding: 32,
  },
  box: {
    backgroundColor: COLORS.card, borderRadius: 20,
    padding: 24, width: '100%',
    borderWidth: 1, borderColor: COLORS.border,
  },
  title: {
    fontSize: 18, fontWeight: '700', color: COLORS.text,
    marginBottom: 8, textAlign: 'center',
  },
  message: {
    fontSize: 14, color: COLORS.textMuted, textAlign: 'center',
    lineHeight: 22, marginBottom: 24,
  },
  btnRow: { flexDirection: 'row', gap: 10 },
  btn: { flex: 1, borderRadius: 12, padding: 14, alignItems: 'center' },
  btnDefault: { backgroundColor: COLORS.accent },
  btnCancel: { backgroundColor: COLORS.cardAlt, borderWidth: 1, borderColor: COLORS.border },
  btnDestructive: { backgroundColor: COLORS.accentRed + '22', borderWidth: 1, borderColor: COLORS.accentRed + '44' },
  btnText: { fontSize: 15, fontWeight: '700' },
  btnTextDefault: { color: '#fff' },
  btnTextCancel: { color: COLORS.textMuted },
  btnTextDestructive: { color: COLORS.accentRed },
})