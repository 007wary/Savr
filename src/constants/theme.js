import { Dimensions } from 'react-native'

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window')

// No paddingTop here — top safe-area padding must come from useSafeAreaInsets()
// at each screen, not a static constant. This used to be Constants.statusBarHeight
// + 16, captured once at module load; under mandatory edge-to-edge (Android 15+,
// targetSdkVersion 35) that's not reactive to the real inset and can end up
// wrong depending on device/gesture-nav configuration. Every screen now computes
// its own `insets.top + 8` header padding instead.
export const SCREEN = {
  width: SCREEN_WIDTH,
  height: SCREEN_HEIGHT,
  paddingHorizontal: SCREEN_WIDTH < 380 ? 16 : 20,
  maxWidth: 500,
  isSmall: SCREEN_WIDTH < 360,
  isTablet: SCREEN_WIDTH >= 600,
}

export const DARK_COLORS = {
  bg: '#0F0F0F',
  card: '#1A1A1A',
  cardAlt: '#222222',
  accent: '#6C63FF',
  accentGreen: '#00D9A5',
  accentRed: '#FF5C5C',
  accentYellow: '#FFB800',
  text: '#FFFFFF',
  textMuted: '#888888',
  border: '#2A2A2A',
  // Same gradient in both modes — the hero card is a deliberate saturated
  // brand moment, not something that should fade to match the surrounding
  // surface. onGradientPositive is the income/positive-figure color used
  // against it (kept light-on-purple in both modes for contrast).
  heroGradient: ['#7C75FF', '#6C63FF', '#5A50FF'],
  onGradientPositive: '#a8ffb8',
}

export const LIGHT_COLORS = {
  bg: '#FFFFFF',
  card: '#F5F5F5',
  cardAlt: '#EEEEEE',
  accent: '#6C63FF',
  accentGreen: '#00A880',
  accentRed: '#E03E3E',
  accentYellow: '#D49700',
  text: '#0F0F0F',
  textMuted: '#777777',
  border: '#E0E0E0',
  heroGradient: ['#7C75FF', '#6C63FF', '#5A50FF'],
  onGradientPositive: '#a8ffb8',
}

// Backward-compat alias — screens still importing COLORS directly won't break
export const COLORS = DARK_COLORS

export const CATEGORIES = [
  { label: 'Food',          icon: 'restaurant-outline',   color: '#FF6B6B' },
  { label: 'Transport',     icon: 'car-outline',          color: '#4ECDC4' },
  { label: 'Shopping',      icon: 'bag-handle-outline',   color: '#FFB800' },
  { label: 'Bills',         icon: 'receipt-outline',      color: '#6C63FF' },
  { label: 'Health',        icon: 'medical-outline',      color: '#00D9A5' },
  { label: 'Entertainment', icon: 'film-outline',         color: '#FF8C42' },
  { label: 'Education',     icon: 'book-outline',         color: '#5B9BD5' },
  { label: 'Other',         icon: 'grid-outline',         color: '#888888' },
]

export const CURRENCIES = [
  { code: 'AUD', symbol: 'A$', name: 'Australian Dollar', flag: '🇦🇺' },
  { code: 'BDT', symbol: '৳', name: 'Bangladeshi Taka', flag: '🇧🇩' },
  { code: 'BRL', symbol: 'R$', name: 'Brazilian Real', flag: '🇧🇷' },
  { code: 'GBP', symbol: '£', name: 'British Pound', flag: '🇬🇧' },
  { code: 'CAD', symbol: 'C$', name: 'Canadian Dollar', flag: '🇨🇦' },
  { code: 'CNY', symbol: '¥', name: 'Chinese Yuan', flag: '🇨🇳' },
  { code: 'DKK', symbol: 'kr', name: 'Danish Krone', flag: '🇩🇰' },
  { code: 'EUR', symbol: '€', name: 'Euro', flag: '🇪🇺' },
  { code: 'HKD', symbol: 'HK$', name: 'Hong Kong Dollar', flag: '🇭🇰' },
  { code: 'INR', symbol: '₹', name: 'Indian Rupee', flag: '🇮🇳' },
  { code: 'IDR', symbol: 'Rp', name: 'Indonesian Rupiah', flag: '🇮🇩' },
  { code: 'JPY', symbol: '¥', name: 'Japanese Yen', flag: '🇯🇵' },
  { code: 'MYR', symbol: 'RM', name: 'Malaysian Ringgit', flag: '🇲🇾' },
  { code: 'MXN', symbol: 'MX$', name: 'Mexican Peso', flag: '🇲🇽' },
  { code: 'NPR', symbol: '₨', name: 'Nepalese Rupee', flag: '🇳🇵' },
  { code: 'NZD', symbol: 'NZ$', name: 'New Zealand Dollar', flag: '🇳🇿' },
  { code: 'NGN', symbol: '₦', name: 'Nigerian Naira', flag: '🇳🇬' },
  { code: 'NOK', symbol: 'kr', name: 'Norwegian Krone', flag: '🇳🇴' },
  { code: 'PKR', symbol: '₨', name: 'Pakistani Rupee', flag: '🇵🇰' },
  { code: 'RUB', symbol: '₽', name: 'Russian Ruble', flag: '🇷🇺' },
  { code: 'SAR', symbol: '﷼', name: 'Saudi Riyal', flag: '🇸🇦' },
  { code: 'SGD', symbol: 'S$', name: 'Singapore Dollar', flag: '🇸🇬' },
  { code: 'ZAR', symbol: 'R', name: 'South African Rand', flag: '🇿🇦' },
  { code: 'KRW', symbol: '₩', name: 'South Korean Won', flag: '🇰🇷' },
  { code: 'LKR', symbol: '₨', name: 'Sri Lankan Rupee', flag: '🇱🇰' },
  { code: 'SEK', symbol: 'kr', name: 'Swedish Krona', flag: '🇸🇪' },
  { code: 'CHF', symbol: 'Fr', name: 'Swiss Franc', flag: '🇨🇭' },
  { code: 'THB', symbol: '฿', name: 'Thai Baht', flag: '🇹🇭' },
  { code: 'AED', symbol: 'د.إ', name: 'UAE Dirham', flag: '🇦🇪' },
  { code: 'USD', symbol: '$', name: 'US Dollar', flag: '🇺🇸' },
]