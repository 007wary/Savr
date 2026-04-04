import { useEffect, useRef } from 'react'
import { View, Animated, StyleSheet } from 'react-native'
import { COLORS } from '../constants/theme'

function SkeletonBox({ width, height, borderRadius = 8, style }) {
  const opacity = useRef(new Animated.Value(0.3)).current

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 800, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.3, duration: 800, useNativeDriver: true }),
      ])
    ).start()
  }, [])

  return (
    <Animated.View
      style={[
        { width, height, borderRadius, backgroundColor: COLORS.cardAlt, opacity },
        style
      ]}
    />
  )
}

export function DashboardSkeleton() {
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <SkeletonBox width={160} height={22} borderRadius={6} />
          <SkeletonBox width={80} height={14} borderRadius={4} style={{ marginTop: 8 }} />
        </View>
      </View>
      <View style={styles.totalCard}>
        <SkeletonBox width={140} height={14} borderRadius={4} />
        <SkeletonBox width={180} height={48} borderRadius={8} style={{ marginTop: 12 }} />
        <SkeletonBox width={100} height={12} borderRadius={4} style={{ marginTop: 10 }} />
      </View>
      <SkeletonBox width={120} height={16} borderRadius={4} style={{ marginBottom: 16 }} />
      {[1, 2, 3].map(i => (
        <View key={i} style={styles.categoryRow}>
          <SkeletonBox width={42} height={42} borderRadius={12} />
          <View style={{ flex: 1, marginLeft: 12 }}>
            <SkeletonBox width={80} height={14} borderRadius={4} />
            <SkeletonBox width="100%" height={4} borderRadius={2} style={{ marginTop: 10 }} />
          </View>
          <SkeletonBox width={60} height={14} borderRadius={4} style={{ marginLeft: 12 }} />
        </View>
      ))}
      <SkeletonBox width={160} height={16} borderRadius={4} style={{ marginTop: 24, marginBottom: 16 }} />
      {[1, 2, 3].map(i => (
        <View key={i} style={styles.txRow}>
          <SkeletonBox width={42} height={42} borderRadius={12} />
          <View style={{ flex: 1, marginLeft: 12 }}>
            <SkeletonBox width={100} height={14} borderRadius={4} />
            <SkeletonBox width={60} height={12} borderRadius={4} style={{ marginTop: 6 }} />
          </View>
          <SkeletonBox width={60} height={14} borderRadius={4} />
        </View>
      ))}
    </View>
  )
}

export function HistorySkeleton() {
  return (
    <View style={styles.container}>
      <SkeletonBox width={120} height={26} borderRadius={6} style={{ marginBottom: 24 }} />
      {[1, 2, 3, 4, 5].map(i => (
        <View key={i} style={styles.txRow}>
          <SkeletonBox width={44} height={44} borderRadius={12} />
          <View style={{ flex: 1, marginLeft: 12 }}>
            <SkeletonBox width={100} height={14} borderRadius={4} />
            <SkeletonBox width={60} height={12} borderRadius={4} style={{ marginTop: 6 }} />
          </View>
          <SkeletonBox width={60} height={14} borderRadius={4} />
        </View>
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg, paddingTop: 60, paddingHorizontal: 20 },
  header: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 24 },
  totalCard: {
    backgroundColor: COLORS.card, borderRadius: 20,
    padding: 24, marginBottom: 24, alignItems: 'center',
  },
  categoryRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  txRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: COLORS.card, borderRadius: 14,
    padding: 14, marginBottom: 10,
    borderWidth: 1, borderColor: COLORS.border,
  },
})