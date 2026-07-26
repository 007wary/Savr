import { useState, useRef, useMemo, useEffect } from 'react'
import {
  View, Text, StyleSheet, TouchableOpacity,
  ScrollView, Dimensions, StatusBar, Platform, TextInput
} from 'react-native'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { LinearGradient } from 'expo-linear-gradient'
import { useTheme } from '../src/lib/themeContext'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { signalFirstPaint } from '../src/lib/splashSignal'
import { Analytics } from '../src/lib/analytics'
import { requestNotificationPermission, isNotificationGranted } from '../src/lib/notifications'
import { loadCurrency, saveCurrency } from '../src/lib/currency'
import { CURRENCIES } from '../src/constants/theme'
import BottomSheet from '../src/components/BottomSheet'
import { setOnboardingDone as setOnboardingDoneShared } from '../src/lib/onboardingState'

const { width } = Dimensions.get('window')

const SLIDES = [
  {
    icon: 'wallet-outline',
    gradient: ['#FFB347', '#FF9800', '#FF6F00'],
    color: '#FF9800',
    title: 'Where did your money go?',
    subtitle: 'Most people lose 20–30% of their income every month without realising it. Savr shows you exactly where every penny goes — and your first expense takes 5 seconds to log.',
    features: [
      { icon: 'search-outline', color: '#FF9800', text: 'See your biggest spending category instantly' },
      { icon: 'receipt-outline', color: '#6C63FF', text: 'Catch expenses you forgot about' },
      { icon: 'lock-closed-outline', color: '#00D9A5', text: 'Your data never leaves your device' },
    ],
  },
  {
    icon: 'shield-checkmark-outline',
    gradient: ['#00E5AD', '#00D9A5', '#00C894'],
    color: '#00D9A5',
    title: 'Take back control',
    subtitle: 'Set a budget once. Savr watches it for you and warns you before you overspend — not after it\'s too late. People who track expenses save 20% more on average.',
    features: [
      { icon: 'warning-outline', color: '#FFB800', text: 'Get warned before you hit your limit' },
      { icon: 'bulb-outline', color: '#6C63FF', text: 'AI recommends budgets from your habits' },
      { icon: 'cloud-done-outline', color: '#00D9A5', text: 'Auto backup to Google Drive' },
    ],
  },
]

export default function Onboarding() {
  const { COLORS } = useTheme()
  const [currentIndex, setCurrentIndex] = useState(0)
  const scrollRef = useRef(null)
  const router = useRouter()
  // Guards against double-firing onboarding_completed/onboarding_skipped —
  // handleDone can in principle be reached more than once if a tap lands
  // right as the route is replacing.
  const exitLoggedRef = useRef(false)
  // Notification permission is asked here, in-context on the budget-warning
  // slide, instead of cold later (previously: silently 8s after the first
  // expense save, with zero framing). Asking right after the user reads
  // "get warned before you hit your limit" gives the OS prompt a reason
  // before it appears, which measurably improves opt-in vs. a cold ask.
  const [notifStatus, setNotifStatus] = useState('unknown') // unknown | granted | denied
  // Currency defaults from device locale (see currency.js) and is confirmed
  // with a single tap here instead of being silently assumed — a wrong
  // guess (e.g. a US-locale device someone's using while traveling) would
  // otherwise surface as "why is everything in $" confusion much later,
  // deep in the add-expense flow.
  const [currencyCode, setCurrencyCode] = useState('USD')
  const [currencyConfirmed, setCurrencyConfirmed] = useState(false)
  const [showCurrencySheet, setShowCurrencySheet] = useState(false)
  const [currencySearch, setCurrencySearch] = useState('')

  useEffect(() => {
    Analytics.onboardingStarted()
    Analytics.onboardingSlideViewed(0)
    if (Platform.OS !== 'web') {
      isNotificationGranted().then((granted) => {
        if (granted) setNotifStatus('granted')
      }).catch(() => {})
    }
    loadCurrency().then(setCurrencyCode).catch(() => {})
  }, [])

  async function handleConfirmCurrency() {
    setCurrencyConfirmed(true)
    await saveCurrency(currencyCode)
  }

  async function handleSelectCurrency(code) {
    setCurrencyCode(code)
    setCurrencyConfirmed(true)
    setShowCurrencySheet(false)
    setCurrencySearch('')
    await saveCurrency(code)
  }

  const selectedCurrency = CURRENCIES.find(c => c.code === currencyCode)
  const filteredCurrencies = useMemo(() => {
    const q = currencySearch.trim().toLowerCase()
    if (!q) return CURRENCIES
    return CURRENCIES.filter(c =>
      c.code.toLowerCase().includes(q) || c.name.toLowerCase().includes(q)
    )
  }, [currencySearch])

  async function handleEnableNotifications() {
    Analytics.notificationPromptRequested('onboarding')
    const status = await requestNotificationPermission()
    setNotifStatus(status === 'granted' ? 'granted' : 'denied')
    Analytics.notificationPromptResult('onboarding', status === 'granted')
  }

  async function handleDone() {
    await AsyncStorage.setItem('savr_onboarding_done', 'true')
    // Must happen before the navigate: _layout.jsx's redirect effect reads
    // its own onboardingDone React state (seeded once from AsyncStorage at
    // launch) on every segment change, including the one this replace()
    // triggers. Without updating the shared state here, that effect still
    // sees the stale pre-onboarding value and immediately bounces the user
    // straight back to /onboarding.
    setOnboardingDoneShared(true)
    router.replace('/(auth)/login')
  }

  function handleNext() {
    if (currentIndex < SLIDES.length - 1) {
      const next = currentIndex + 1
      setCurrentIndex(next)
      Analytics.onboardingSlideViewed(next)
      scrollRef.current?.scrollTo({ x: next * width, animated: true })
    } else {
      if (!exitLoggedRef.current) {
        exitLoggedRef.current = true
        Analytics.onboardingCompleted()
      }
      handleDone()
    }
  }

  function handleSkip() {
    if (!exitLoggedRef.current) {
      exitLoggedRef.current = true
      Analytics.onboardingSkipped(currentIndex)
    }
    handleDone()
  }

  function handleScroll(e) {
    const index = Math.round(e.nativeEvent.contentOffset.x / width)
    if (index !== currentIndex) {
      setCurrentIndex(index)
      Analytics.onboardingSlideViewed(index)
    }
  }

  const slide = SLIDES[currentIndex]

  const styles = useMemo(() => StyleSheet.create({
    container: { flex: 1, backgroundColor: COLORS.bg },
    skipBtn: {
      position: 'absolute', top: 56, right: 24, zIndex: 10,
      paddingVertical: 8, paddingHorizontal: 16,
      borderRadius: 20, backgroundColor: COLORS.card,
      borderWidth: 1, borderColor: COLORS.border,
    },
    skipText: { fontSize: 14, color: COLORS.textMuted, fontWeight: '600' },
    slideScroll: { flex: 1 },
    slide: { width, paddingHorizontal: 28, paddingTop: 90, paddingBottom: 32, alignItems: 'center' },
    iconCircle: {
      width: 140, height: 140, borderRadius: 70,
      justifyContent: 'center', alignItems: 'center',
      marginBottom: 28, shadowColor: '#000',
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.2, shadowRadius: 12, elevation: 8,
    },
    iconInner: {
      width: 110, height: 110, borderRadius: 55,
      justifyContent: 'center', alignItems: 'center',
      backgroundColor: 'rgba(255,255,255,0.15)',
    },
    title: { fontSize: 26, fontWeight: '900', color: COLORS.text, textAlign: 'center', letterSpacing: -0.8, marginBottom: 12 },
    subtitle: { fontSize: 14, color: COLORS.textMuted, textAlign: 'center', lineHeight: 22, marginBottom: 24, paddingHorizontal: 4 },
    featureList: { gap: 10, width: '100%' },
    featureItem: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: COLORS.card, borderRadius: 14, padding: 14, borderWidth: 1 },
    featureIconBox: { width: 36, height: 36, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
    featureText: { fontSize: 14, color: COLORS.text, fontWeight: '500', flex: 1 },
    notifEnableBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1.5, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 16, marginTop: 16 },
    notifEnableText: { fontSize: 13, fontWeight: '700' },
    notifEnabledPill: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1.5, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 16, marginTop: 16 },
    notifEnabledText: { fontSize: 13, fontWeight: '700' },
    currencyConfirmRow: { width: '100%', alignItems: 'center', marginTop: 16, gap: 8 },
    currencyConfirmBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1.5, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 16 },
    currencyConfirmFlag: { fontSize: 16 },
    currencyConfirmText: { fontSize: 13, fontWeight: '700' },
    currencyChangeLink: { fontSize: 12, fontWeight: '600', textDecorationLine: 'underline' },
    sheetTitle: { fontSize: 18, fontWeight: '800', color: COLORS.text, marginBottom: 16 },
    currencySearchBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.cardAlt, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, marginBottom: 12, borderWidth: 1, borderColor: COLORS.border },
    currencySearchInput: { flex: 1, fontSize: 14, color: COLORS.text },
    currencyRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: COLORS.border },
    currencyFlag: { fontSize: 22 },
    currencyName: { fontSize: 14, color: COLORS.text, fontWeight: '600' },
    currencyCodeText: { fontSize: 12, color: COLORS.textMuted, marginTop: 2 },
    currencySymbolText: { fontSize: 15, color: COLORS.textMuted, fontWeight: '600' },
    bottom: { paddingHorizontal: 24, paddingBottom: 44, paddingTop: 16, alignItems: 'center', gap: 14 },
    dots: { flexDirection: 'row', gap: 8, alignItems: 'center' },
    dot: { height: 8, borderRadius: 4 },
    nextBtnGradient: { width: '100%', borderRadius: 16, shadowColor: '#6C63FF', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 6 },
    nextBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, padding: 16 },
    nextText: { fontSize: 17, fontWeight: '800', color: '#fff' },
    pageCounter: { fontSize: 12, color: COLORS.textMuted },
  }), [COLORS])

  return (
    <View style={styles.container} onLayout={signalFirstPaint}>
      <StatusBar barStyle="light-content" />

      {/* Skip button */}
      {currentIndex < SLIDES.length - 1 && (
        <TouchableOpacity style={styles.skipBtn} onPress={handleSkip}>
          <Text style={styles.skipText}>Skip</Text>
        </TouchableOpacity>
      )}

      {/* Horizontal slides */}
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
          <ScrollView
            key={index}
            style={{ width }}
            contentContainerStyle={styles.slide}
            showsVerticalScrollIndicator={false}
            bounces={false}
          >
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
                  <View style={[styles.featureIconBox, { backgroundColor: feature.color + '22' }]}>
  <Ionicons name={feature.icon} size={18} color={feature.color} />
</View>
                  <Text style={styles.featureText}>{feature.text}</Text>
                </View>
              ))}
            </View>

            {index === 0 && selectedCurrency && (
              currencyConfirmed ? (
                <View style={[styles.notifEnabledPill, { borderColor: s.color + '55' }]}>
                  <Ionicons name="checkmark-circle" size={16} color={s.color} />
                  <Text style={[styles.notifEnabledText, { color: s.color }]}>
                    Tracking in {selectedCurrency.flag} {selectedCurrency.code}
                  </Text>
                </View>
              ) : (
                <View style={styles.currencyConfirmRow}>
                  <TouchableOpacity
                    style={[styles.currencyConfirmBtn, { borderColor: s.color }]}
                    onPress={handleConfirmCurrency}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.currencyConfirmFlag}>{selectedCurrency.flag}</Text>
                    <Text style={[styles.currencyConfirmText, { color: s.color }]}>
                      Track in {selectedCurrency.name} ({selectedCurrency.symbol})
                    </Text>
                    <Ionicons name="checkmark" size={16} color={s.color} />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => setShowCurrencySheet(true)}>
                    <Text style={[styles.currencyChangeLink, { color: COLORS.textMuted }]}>Not right? Change it</Text>
                  </TouchableOpacity>
                </View>
              )
            )}

            {index === 1 && Platform.OS !== 'web' && (
              notifStatus === 'granted' ? (
                <View style={[styles.notifEnabledPill, { borderColor: s.color + '55' }]}>
                  <Ionicons name="checkmark-circle" size={16} color={s.color} />
                  <Text style={[styles.notifEnabledText, { color: s.color }]}>Budget alerts enabled</Text>
                </View>
              ) : (
                <TouchableOpacity
                  style={[styles.notifEnableBtn, { borderColor: s.color }]}
                  onPress={handleEnableNotifications}
                  activeOpacity={0.8}
                >
                  <Ionicons name="notifications-outline" size={16} color={s.color} />
                  <Text style={[styles.notifEnableText, { color: s.color }]}>
                    {notifStatus === 'denied' ? 'Enable in device settings' : 'Turn on budget alerts'}
                  </Text>
                </TouchableOpacity>
              )
            )}
          </ScrollView>
        ))}
      </ScrollView>

      {/* Bottom controls */}
      <View style={styles.bottom}>
        <View style={styles.dots}>
          {SLIDES.map((s, i) => (
            <TouchableOpacity
              key={i}
              onPress={() => {
                setCurrentIndex(i)
                Analytics.onboardingSlideViewed(i)
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
{currentIndex === SLIDES.length - 1 && (
  <Ionicons name="rocket-outline" size={20} color="#fff" />
)}
            {currentIndex < SLIDES.length - 1 && (
              <Ionicons name="arrow-forward" size={20} color="#fff" />
            )}
          </TouchableOpacity>
        </LinearGradient>

        <Text style={styles.pageCounter}>
          {currentIndex + 1} of {SLIDES.length}
        </Text>
      </View>

      <BottomSheet visible={showCurrencySheet} onClose={() => { setShowCurrencySheet(false); setCurrencySearch('') }}>
        <Text style={styles.sheetTitle}>Select Currency</Text>
        <View style={styles.currencySearchBox}>
          <Ionicons name="search-outline" size={16} color={COLORS.textMuted} style={{ marginRight: 8 }} />
          <TextInput
            style={styles.currencySearchInput}
            placeholder="Search currency or country..."
            placeholderTextColor={COLORS.textMuted}
            value={currencySearch}
            onChangeText={setCurrencySearch}
            autoCorrect={false}
          />
        </View>
        {filteredCurrencies.map(cur => (
          <TouchableOpacity
            key={cur.code}
            style={styles.currencyRow}
            onPress={() => handleSelectCurrency(cur.code)}
          >
            <Text style={styles.currencyFlag}>{cur.flag}</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.currencyName}>{cur.name}</Text>
              <Text style={styles.currencyCodeText}>{cur.code}</Text>
            </View>
            <Text style={styles.currencySymbolText}>{cur.symbol}</Text>
          </TouchableOpacity>
        ))}
      </BottomSheet>
    </View>
  )
}