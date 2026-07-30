import { useMemo } from 'react'
import { Modal, View, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native'
import { useTheme } from '../lib/themeContext'

export default function BottomSheet({ visible, onClose, children, maxHeight = '85%' }) {
  const { COLORS } = useTheme()

  const styles = useMemo(() => StyleSheet.create({
    overlay: {
      flex: 1,
      justifyContent: 'flex-end',
      backgroundColor: 'rgba(0,0,0,0.6)',
    },
    sheet: {
      backgroundColor: COLORS.card,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      padding: 24,
      paddingBottom: 40,
      flexShrink: 1,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: -4 },
      shadowOpacity: 0.15,
      shadowRadius: 12,
      elevation: 12,
    },
    handle: {
      width: 40, height: 4,
      backgroundColor: COLORS.border,
      borderRadius: 2,
      alignSelf: 'center',
      marginBottom: 20,
    },
  }), [COLORS])

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <TouchableOpacity
          style={styles.overlay}
          activeOpacity={1}
          onPress={onClose}
        >
          <TouchableOpacity
            activeOpacity={1}
            onPress={() => {}}
            style={[styles.sheet, { maxHeight }]}
          >
            <View style={styles.handle} />
            {children}
          </TouchableOpacity>
        </TouchableOpacity>
      </KeyboardAvoidingView>
    </Modal>
  )
}