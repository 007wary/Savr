import AsyncStorage from '@react-native-async-storage/async-storage'
import { CURRENCIES } from '../constants/theme'

const CURRENCY_KEY = 'savr_currency'

export async function saveCurrency(currencyCode) {
  try {
    await AsyncStorage.setItem(CURRENCY_KEY, currencyCode)
  } catch {
    // Silently fail
  }
}

export async function loadCurrency() {
  try {
    const saved = await AsyncStorage.getItem(CURRENCY_KEY)
    return saved || 'INR'
  } catch {
    return 'INR'
  }
}

export async function getCurrencySymbol() {
  try {
    const code = await loadCurrency()
    const cur = CURRENCIES.find(c => c.code === code)
    return cur?.symbol || '₹'
  } catch {
    return '₹'
  }
}

// Country locale map for each currency code
const CURRENCY_LOCALE_MAP = {
  AUD: 'en-AU',
  BDT: 'bn-BD',
  BRL: 'pt-BR',
  GBP: 'en-GB',
  CAD: 'en-CA',
  CNY: 'zh-CN',
  DKK: 'da-DK',
  EUR: 'de-DE',
  HKD: 'zh-HK',
  INR: 'en-IN',
  IDR: 'id-ID',
  JPY: 'ja-JP',
  MYR: 'ms-MY',
  MXN: 'es-MX',
  NPR: 'ne-NP',
  NZD: 'en-NZ',
  NGN: 'en-NG',
  NOK: 'nb-NO',
  PKR: 'ur-PK',
  RUB: 'ru-RU',
  SAR: 'ar-SA',
  SGD: 'en-SG',
  ZAR: 'en-ZA',
  KRW: 'ko-KR',
  LKR: 'si-LK',
  SEK: 'sv-SE',
  CHF: 'de-CH',
  THB: 'th-TH',
  AED: 'ar-AE',
  USD: 'en-US',
}

// Currencies with no decimal places
const NO_DECIMAL_CURRENCIES = ['JPY', 'KRW', 'IDR']

export function formatAmount(amount, symbol = '₹', currencyCode = null) {
  try {
    const num = parseFloat(amount)
    if (isNaN(num)) return `${symbol}0.00`

    const code = currencyCode
    const locale = code ? (CURRENCY_LOCALE_MAP[code] || 'en-US') : 'en-IN'
    const noDecimal = code && NO_DECIMAL_CURRENCIES.includes(code)

    const formatted = num.toLocaleString(locale, {
      minimumFractionDigits: noDecimal ? 0 : 2,
      maximumFractionDigits: noDecimal ? 0 : 2,
    })

    return `${symbol}${formatted}`
  } catch {
    return `${symbol}${parseFloat(amount).toFixed(2)}`
  }
}

export async function formatAmountWithCode(amount) {
  try {
    const code = await loadCurrency()
    const cur = CURRENCIES.find(c => c.code === code)
    const symbol = cur?.symbol || '₹'
    return formatAmount(amount, symbol, code)
  } catch {
    return `₹${parseFloat(amount).toFixed(2)}`
  }
}