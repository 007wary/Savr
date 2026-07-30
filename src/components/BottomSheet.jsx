import { useEffect, useMemo, useRef, useState } from 'react'
import { Modal, View, TouchableOpacity, StyleSheet, Animated, Dimensions } from 'react-native'
import { useTheme } from '../lib/themeContext'

const SCREEN_HEIGHT = Dimensions.get('window').height

export default function BottomSheet({ visible, onClose, children, maxHeight = '85%' }) {
  const { COLORS } = useTheme()
  const [rendered, setRendered] = useState(visible)
  const overlayOpacity = useRef(new Animated.Value(0)).current
  const sheetTranslateY = useRef(new Animated.Value(SCREEN_HEIGHT)).current

  // The Modal itself animates nothing (animationType="none") — sliding the
  // whole tree (as animationType="slide" does) drags the dim overlay up from
  // the bottom edge with it, so the screen looks like it "wipes" dark instead
  // of dimming instantly while only the sheet slides. Animating overlay
  // opacity and sheet translateY separately matches how native bottom sheets
  // actually look: scrim fades in immediately, sheet slides up on top of it.
  useEffect(() => {
    if (visible) {
      setRendered(true)
      Animated.parallel([
        Animated.timing(overlayOpacity, { toValue: 1, duration: 220, useNativeDriver: true }),
        Animated.spring(sheetTranslateY, { toValue: 0, useNativeDriver: true, bounciness: 4 }),
      ]).start()
    } else if (rendered) {
      Animated.parallel([
        Animated.timing(overlayOpacity, { toValue: 0, duration: 180, useNativeDriver: true }),
        Animated.timing(sheetTranslateY, { toValue: SCREEN_HEIGHT, duration: 200, useNativeDriver: true }),
      ]).start(() => setRendered(false))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible])

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
      paddingHorizontal: 24,
      paddingTop: 24,
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
    body: {
      flex: 1,
      paddingBottom: 40,
    },
  }), [COLORS])

  if (!rendered) return null

  return (
    <Modal
      visible={rendered}
      animationType="none"
      transparent
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <Animated.View style={[styles.overlay, { opacity: overlayOpacity }]}>
        <TouchableOpacity
          style={StyleSheet.absoluteFill}
          activeOpacity={1}
          onPress={onClose}
        />
        <Animated.View
          style={[styles.sheet, { height: maxHeight, transform: [{ translateY: sheetTranslateY }] }]}
        >
          <View style={styles.handle} />
          <View style={styles.body}>
            {children}
          </View>
        </Animated.View>
      </Animated.View>
    </Modal>
  )
}
