import { useState, useRef } from 'react'
import {
  View, Text, StyleSheet, TouchableOpacity,
  ScrollView, Dimensions, StatusBar
} from 'react-native'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { LinearGradient } from 'expo-linear-gradient'
import { COLORS } from '../src/constants/theme'
import AsyncStorage from '@react-native-async-storage/async-storage'

const { width } = Dimensions.get('window')

const SLIDES = [
  {
    icon: 'wallet-outline',
    gradient: ['#7C75FF', '#6C63FF', '#5A50FF'],
    color: '#6C63FF',
    title: 'Track Every Expense',
    subtitle: 'Add expenses in seconds with smart auto-detection. Know exactly where your money goes.',
    features: [
      { icon: 'flash-outline', text: 'Auto category detection from notes' },
      { icon: 'bar-chart-outline', text: 'Daily & monthly spending totals' },
      { icon: 'repeat-outline', text: 'Recurring expense automation' },
    ],
  },
  {
    icon: 'shield-checkmark-outline',
    gradient: ['#00E5AD', '#00D9A5', '#00C894'],
    color: '#00D9A5',
    title: 'Smart Budgets',
    subtitle: 'Set monthly budgets for each category. Get alerts before you overspend.',
    features: [
      { icon: 'flag-outline', text: 'Per category budget limits' },
      { icon: 'notifications-outline', text: 'Over-budget alerts instantly' },
      { icon: 'bulb-outline', text: 'AI-powered budget recommendations' },
    ],
  },
  {
    icon: 'bar-chart-outline',
    gradient: ['#FF9A5C', '#FF8C42', '#FF7A28'],
    color: '#FF8C42',
    title: 'Powerful Insights',
    subtitle: 'Beautiful reports and charts to understand and improve your spending habits.',
    features: [
      { icon: 'trending-up-outline', text: '6 month spending trends' },
      { icon: 'calendar-outline', text: 'Visual spending heatmap' },
      { icon: 'globe-outline', text: '30+ currencies supported' },
    ],
  },
]

export default function Onboarding() {
  const [currentIndex, setCurrentIndex] = useState(0)
  const scrollRef = useRef(null)
  const router = useRouter()

  async function handleDone() {
    await AsyncStorage.setItem('savr_onboarding_done', 'true')
    router.replace('/(auth)/login')
  }

  function handleNext() {
    if (currentIndex < SLIDES.length - 1) {
      const next = currentIndex + 1
      setCurrentIndex(next)
      scrollRef.current?.scrollTo({ x: next * width, animated: true })
    } else {
      handleDone()
    }
  }

  function handleSkip() {
    handleDone()
  }

  function handleScroll(e) {
    const index = Math.round(e.nativeEvent.contentOffset.x / width)
    if (index !== currentIndex) setCurrentIndex(index)
  }

  const slide = SLIDES[currentIndex]

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />

      {currentIndex < SLIDES.length - 1 && (
        <TouchableOpacity style={styles.skipBtn} onPress={handleSkip}>
          <Text style={styles.skipText}>Skip</Text>
        </TouchableOpacity>
      )}

      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={handleScroll}
        scrollEventThrottle={16}
        style={styles.slideScroll}
        bounces={false}
        decelerationRate="fast"
      >
        {SLIDES.map((s, index) => (
          <View key={index} style={styles.slide}>
            <LinearGradient
              colors={s.gradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.iconCircle}
            >
              <View style={styles.iconInner}>
                <Ionicons name={s.icon} size={64} color="#fff" />
              </View>
            </LinearGradient>

            <Text style={styles.title}>{s.title}</Text>
            <Text style={styles.subtitle}>{s.subtitle}</Text>

            <View style={styles.featureList}>
              {s.features.map((feature, i) => (
                <View key={i} style={[styles.featureItem, { borderColor: s.color + '33' }]}>
                  <View style={[styles.featureIconBox, { backgroundColor: s.color + '22' }]}>
                    <Ionicons name={feature.icon} size={20} color={s.color} />
                  </View>
                  <Text style={styles.featureText}>{feature.text}</Text>
                </View>
              ))}
            </View>
          </View>
        ))}
      </ScrollView>

      <View style={styles.bottom}>
        <View style={styles.dots}>
          {SLIDES.map((s, i) => (
            <TouchableOpacity
              key={i}
              onPress={() => {
                setCurrentIndex(i)
                scrollRef.current?.scrollTo({ x: i * width, animated: true })
              }}
            >
              <View style={[
                styles.dot,
                {
                  width: i === currentIndex ? 24 : 8,
                  backgroundColor: i === currentIndex ? slide.color : COLORS.border,
                }
              ]} />
            </TouchableOpacity>
          ))}
        </View>

        <LinearGradient
          colors={slide.gradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.nextBtnGradient}
        >
          <TouchableOpacity
            style={styles.nextBtn}
            onPress={handleNext}
            activeOpacity={0.85}
          >
            <Text style={styles.nextText}>
              {currentIndex === SLIDES.length - 1 ? 'Get Started' : 'Next'}
            </Text>
            <Ionicons
              name={currentIndex === SLIDES.length - 1 ? 'rocket-outline' : 'arrow-forward'}
              size={20}
              color="#fff"
            />
          </TouchableOpacity>
        </LinearGradient>

        <Text style={styles.pageCounter}>
          {currentIndex + 1} of {SLIDES.length}
        </Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  skipBtn: {
    position: 'absolute', top: 56, right: 24, zIndex: 10,
    paddingVertical: 8, paddingHorizontal: 16,
    borderRadius: 20, backgroundColor: COLORS.card,
    borderWidth: 1, borderColor: COLORS.border,
  },
  skipText: { fontSize: 14, color: COLORS.textMuted, fontWeight: '600' },
  slideScroll: { flex: 1 },
  slide: {
    width,
    paddingHorizontal: 28,
    paddingTop: 90,
    alignItems: 'center',
  },
  iconCircle: {
    width: 140, height: 140, borderRadius: 70,
    justifyContent: 'center', alignItems: 'center',
    marginBottom: 28,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.2, shadowRadius: 12, elevation: 8,
  },
  iconInner: {
    width: 110, height: 110, borderRadius: 55,
    justifyContent: 'center', alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  title: {
    fontSize: 26, fontWeight: '900', color: COLORS.text,
    textAlign: 'center', letterSpacing: -0.8, marginBottom: 12,
  },
  subtitle: {
    fontSize: 14, color: COLORS.textMuted, textAlign: 'center',
    lineHeight: 22, marginBottom: 24, paddingHorizontal: 4,
  },
  featureList: { gap: 10, width: '100%' },
  featureItem: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: COLORS.card, borderRadius: 14,
    padding: 14, borderWidth: 1,
  },
  featureIconBox: {
    width: 36, height: 36, borderRadius: 10,
    justifyContent: 'center', alignItems: 'center',
  },
  featureText: { fontSize: 14, color: COLORS.text, fontWeight: '500', flex: 1 },
  bottom: {
    paddingHorizontal: 24, paddingBottom: 44, paddingTop: 16,
    alignItems: 'center', gap: 14,
  },
  dots: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  dot: { height: 8, borderRadius: 4 },
  nextBtnGradient: {
    width: '100%', borderRadius: 16,
    shadowColor: '#6C63FF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 8, elevation: 6,
  },
  nextBtn: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', gap: 10,
    padding: 16,
  },
  nextText: { fontSize: 17, fontWeight: '800', color: '#fff' },
  pageCounter: { fontSize: 12, color: COLORS.textMuted },
})
