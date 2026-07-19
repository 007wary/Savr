import { useEffect, useRef, useMemo } from 'react'
import { View, Animated, StyleSheet } from 'react-native'
import { useTheme } from '../lib/themeContext'
import { SCREEN } from '../constants/theme'

function SkeletonBox({ width, height, borderRadius = 8, style, colors }) {
  const opacity = useRef(new Animated.Value(0.3)).current

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 800, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.3, duration: 800, useNativeDriver: true }),
      ])
    ).start()
  }, [opacity])

  return (
    <Animated.View
      style={[{ width, height, borderRadius, backgroundColor: colors.cardAlt, opacity }, style]}
    />
  )
}

const S = SkeletonBox

export function DashboardSkeleton() {
  const { COLORS } = useTheme()
  const styles = useMemo(() => makeStyles(COLORS), [COLORS])

  return (
    <View style={styles.container}>
      <S colors={COLORS} width={200} height={28} borderRadius={6} style={{ marginBottom: 24 }} />
      <View style={styles.monthNav}>
        <S colors={COLORS} width={24} height={24} borderRadius={6} />
        <S colors={COLORS} width={120} height={18} borderRadius={4} />
        <S colors={COLORS} width={24} height={24} borderRadius={6} />
      </View>
      <View style={styles.totalCard}>
        <S colors={COLORS} width={100} height={12} borderRadius={4} />
        <S colors={COLORS} width={180} height={52} borderRadius={8} style={{ marginTop: 12 }} />
        <S colors={COLORS} width={80} height={12} borderRadius={4} style={{ marginTop: 10 }} />
      </View>
      <View style={styles.statsRow}>
        <View style={{ flex: 1, alignItems: 'center', gap: 8 }}>
          <S colors={COLORS} width={60} height={11} borderRadius={4} />
          <S colors={COLORS} width={80} height={20} borderRadius={4} />
        </View>
        <View style={styles.statDivider} />
        <View style={{ flex: 1, alignItems: 'center', gap: 8 }}>
          <S colors={COLORS} width={80} height={11} borderRadius={4} />
          <S colors={COLORS} width={70} height={20} borderRadius={4} />
        </View>
      </View>
      <S colors={COLORS} width={120} height={11} borderRadius={4} style={{ marginBottom: 16 }} />
      {[1, 2, 3].map(i => (
        <View key={i} style={styles.categoryRow}>
          <S colors={COLORS} width={42} height={42} borderRadius={12} />
          <View style={{ flex: 1, marginLeft: 12, gap: 8 }}>
            <S colors={COLORS} width={80} height={14} borderRadius={4} />
            <S colors={COLORS} width="100%" height={4} borderRadius={2} />
          </View>
          <S colors={COLORS} width={60} height={14} borderRadius={4} style={{ marginLeft: 12 }} />
        </View>
      ))}
      <S colors={COLORS} width={160} height={11} borderRadius={4} style={{ marginTop: 24, marginBottom: 16 }} />
      {[1, 2, 3].map(i => (
        <View key={i} style={styles.txRow}>
          <S colors={COLORS} width={42} height={42} borderRadius={12} />
          <View style={{ flex: 1, marginLeft: 12, gap: 8 }}>
            <S colors={COLORS} width={100} height={14} borderRadius={4} />
            <S colors={COLORS} width={60} height={12} borderRadius={4} />
          </View>
          <S colors={COLORS} width={60} height={14} borderRadius={4} />
        </View>
      ))}
    </View>
  )
}

export function HistorySkeleton() {
  const { COLORS } = useTheme()
  const styles = useMemo(() => makeStyles(COLORS), [COLORS])
  return (
    <View style={styles.container}>
      <View style={styles.headingRow}>
        <S colors={COLORS} width={120} height={28} borderRadius={6} />
        <S colors={COLORS} width={80} height={34} borderRadius={10} />
      </View>
      <S colors={COLORS} width="100%" height={46} borderRadius={12} style={{ marginBottom: 12 }} />
      {[1, 2, 3, 4, 5, 6].map(i => (
        <View key={i} style={styles.txRow}>
          <S colors={COLORS} width={44} height={44} borderRadius={12} />
          <View style={{ flex: 1, marginLeft: 12, gap: 8 }}>
            <S colors={COLORS} width={100} height={14} borderRadius={4} />
            <S colors={COLORS} width={60} height={12} borderRadius={4} />
          </View>
          <View style={{ alignItems: 'flex-end', gap: 8 }}>
            <S colors={COLORS} width={60} height={14} borderRadius={4} />
            <S colors={COLORS} width={40} height={11} borderRadius={4} />
          </View>
        </View>
      ))}
    </View>
  )
}

export function BudgetsSkeleton() {
  const { COLORS } = useTheme()
  const styles = useMemo(() => makeStyles(COLORS), [COLORS])
  return (
    <View style={styles.container}>
      <S colors={COLORS} width={140} height={28} borderRadius={6} style={{ marginBottom: 8 }} />
      <S colors={COLORS} width={100} height={14} borderRadius={4} style={{ marginBottom: 24 }} />
      {[1, 2, 3, 4, 5].map(i => (
        <View key={i} style={[styles.txRow, { flexDirection: 'column', alignItems: 'flex-start', gap: 12, marginBottom: 12 }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', width: '100%' }}>
            <S colors={COLORS} width={44} height={44} borderRadius={12} />
            <View style={{ flex: 1, marginLeft: 12, gap: 8 }}>
              <S colors={COLORS} width={80} height={15} borderRadius={4} />
              <S colors={COLORS} width={120} height={12} borderRadius={4} />
            </View>
          </View>
          <S colors={COLORS} width="100%" height={6} borderRadius={3} />
        </View>
      ))}
    </View>
  )
}

export function ReportsSkeleton() {
  const { COLORS } = useTheme()
  const styles = useMemo(() => makeStyles(COLORS), [COLORS])
  return (
    <View style={styles.container}>
      <S colors={COLORS} width={120} height={28} borderRadius={6} style={{ marginBottom: 8 }} />
      <S colors={COLORS} width={100} height={14} borderRadius={4} style={{ marginBottom: 24 }} />
      <View style={styles.totalCard}>
        <S colors={COLORS} width={100} height={12} borderRadius={4} />
        <S colors={COLORS} width={160} height={42} borderRadius={8} style={{ marginTop: 12 }} />
        <S colors={COLORS} width={80} height={12} borderRadius={4} style={{ marginTop: 10 }} />
      </View>
      <S colors={COLORS} width={100} height={11} borderRadius={4} style={{ marginBottom: 16 }} />
      <S colors={COLORS} width="100%" height={160} borderRadius={16} style={{ marginBottom: 28 }} />
      <S colors={COLORS} width={140} height={11} borderRadius={4} style={{ marginBottom: 16 }} />
      {[1, 2, 3].map(i => (
        <View key={i} style={styles.categoryRow}>
          <S colors={COLORS} width={44} height={44} borderRadius={12} />
          <View style={{ flex: 1, marginLeft: 12, gap: 8 }}>
            <S colors={COLORS} width={80} height={14} borderRadius={4} />
            <S colors={COLORS} width="100%" height={4} borderRadius={2} />
          </View>
        </View>
      ))}
    </View>
  )
}

export function SettingsSkeleton() {
  const { COLORS } = useTheme()
  const styles = useMemo(() => makeStyles(COLORS), [COLORS])
  return (
    <View style={styles.container}>
      <S colors={COLORS} width={120} height={28} borderRadius={6} style={{ marginBottom: 24 }} />
      <View style={[styles.txRow, { marginBottom: 28, padding: 20, borderRadius: 16, backgroundColor: COLORS.card }]}>
        <S colors={COLORS} width={56} height={56} borderRadius={28} />
        <View style={{ flex: 1, marginLeft: 16, gap: 8 }}>
          <S colors={COLORS} width={120} height={17} borderRadius={4} />
          <S colors={COLORS} width={160} height={13} borderRadius={4} />
        </View>
      </View>
      <S colors={COLORS} width={80} height={11} borderRadius={4} style={{ marginBottom: 10 }} />
      <View style={[styles.txRow, { flexDirection: 'column', backgroundColor: COLORS.card, borderRadius: 16, padding: 0, overflow: 'hidden', marginBottom: 24 }]}>
        {[1, 2, 3].map(i => (
          <View key={i} style={{ padding: 16, borderBottomWidth: i < 3 ? 1 : 0, borderBottomColor: COLORS.border }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
              <S colors={COLORS} width={36} height={36} borderRadius={10} />
              <View style={{ gap: 6 }}>
                <S colors={COLORS} width={100} height={15} borderRadius={4} />
                <S colors={COLORS} width={140} height={12} borderRadius={4} />
              </View>
            </View>
          </View>
        ))}
      </View>
    </View>
  )
}

function makeStyles(COLORS) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: COLORS.bg, paddingTop: SCREEN.paddingTop, paddingHorizontal: SCREEN.paddingHorizontal },
    headingRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
    monthNav: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      backgroundColor: COLORS.card, borderRadius: 14, padding: 12, marginBottom: 20,
    },
    totalCard: {
      backgroundColor: COLORS.card, borderRadius: 24,
      padding: 28, marginBottom: 16, alignItems: 'center',
    },
    statsRow: {
      flexDirection: 'row', backgroundColor: COLORS.card,
      borderRadius: 16, padding: 16, marginBottom: 16,
    },
    statDivider: { width: 1, backgroundColor: COLORS.border, marginHorizontal: 8 },
    categoryRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
    txRow: {
      flexDirection: 'row', alignItems: 'center',
      backgroundColor: COLORS.card, borderRadius: 14,
      padding: 14, marginBottom: 10,
    },
  })
}