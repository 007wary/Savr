import AsyncStorage from '@react-native-async-storage/async-storage'
import { CURRENCIES } from '../constants/theme'

const CURRENCY_KEY = 'savr_currency'

// In-memory cache so we don't hit AsyncStorage every render
let _cachedCode = null

export function clearCurrencyCache() {
  _cachedCode = null
}

export async function saveCurrency(currencyCode) {
  try {
    _cachedCode = currencyCode
    await AsyncStorage.setItem(CURRENCY_KEY, currencyCode)
  } catch {
    // Silently fail
  }
}

export async function loadCurrency() {
  try {
    if (_cachedCode) return _cachedCode
    const saved = await AsyncStorage.getItem(CURRENCY_KEY)
    _cachedCode = saved || 'INR'
    return _cachedCode
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
  PHP: 'en-PH',
}

// Currencies with no decimal places
const NO_DECIMAL_CURRENCIES = ['JPY', 'KRW', 'IDR']

export function formatAmount(amount, symbol = '₹', currencyCode = null) {
  try {
    const num = parseFloat(amount)
    if (isNaN(num)) return `${symbol}0.00`

    // Use cached code as fallback if currencyCode not passed
    const code = currencyCode || _cachedCode || 'INR'
    const locale = CURRENCY_LOCALE_MAP[code] || 'en-US'
    const noDecimal = NO_DECIMAL_CURRENCIES.includes(code)

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

// Currency-aware quick amounts
const QUICK_AMOUNTS_MAP = {
  INR: ['50', '100', '200', '500', '1000', '2000'],
  USD: ['1', '5', '10', '20', '50', '100'],
  EUR: ['1', '5', '10', '20', '50', '100'],
  GBP: ['1', '5', '10', '20', '50', '100'],
  AUD: ['2', '5', '10', '20', '50', '100'],
  CAD: ['2', '5', '10', '20', '50', '100'],
  JPY: ['100', '200', '500', '1000', '2000', '5000'],
  KRW: ['1000', '2000', '5000', '10000', '20000', '50000'],
  IDR: ['5000', '10000', '20000', '50000', '100000', '200000'],
  CNY: ['5', '10', '20', '50', '100', '200'],
  SGD: ['2', '5', '10', '20', '50', '100'],
  MYR: ['2', '5', '10', '20', '50', '100'],
  THB: ['20', '50', '100', '200', '500', '1000'],
  PHP: ['20', '50', '100', '200', '500', '1000'],
  BDT: ['50', '100', '200', '500', '1000', '2000'],
  PKR: ['50', '100', '200', '500', '1000', '2000'],
  NPR: ['50', '100', '200', '500', '1000', '2000'],
  LKR: ['50', '100', '200', '500', '1000', '2000'],
  AED: ['5', '10', '20', '50', '100', '200'],
  SAR: ['5', '10', '20', '50', '100', '200'],
  BRL: ['5', '10', '20', '50', '100', '200'],
  MXN: ['10', '20', '50', '100', '200', '500'],
  ZAR: ['10', '20', '50', '100', '200', '500'],
  NGN: ['100', '200', '500', '1000', '2000', '5000'],
  RUB: ['50', '100', '200', '500', '1000', '2000'],
  CHF: ['2', '5', '10', '20', '50', '100'],
  SEK: ['10', '20', '50', '100', '200', '500'],
  NOK: ['10', '20', '50', '100', '200', '500'],
  DKK: ['10', '20', '50', '100', '200', '500'],
  NZD: ['2', '5', '10', '20', '50', '100'],
  HKD: ['10', '20', '50', '100', '200', '500'],
}

export function getQuickAmounts(currencyCode) {
  return QUICK_AMOUNTS_MAP[currencyCode] || QUICK_AMOUNTS_MAP['USD']
}
