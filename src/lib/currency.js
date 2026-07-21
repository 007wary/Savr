import AsyncStorage from '@react-native-async-storage/async-storage'
import * as Localization from 'expo-localization'
import { CURRENCIES } from '../constants/theme'

const CURRENCY_KEY = 'savr_currency'

let _cachedCode = null

// Map device region to currency code
const REGION_CURRENCY_MAP = {
  US: 'USD', GB: 'GBP', EU: 'EUR', IN: 'INR', AU: 'AUD',
  CA: 'CAD', JP: 'JPY', CN: 'CNY', SG: 'SGD', AE: 'AED',
  SA: 'SAR', MY: 'MYR', TH: 'THB', PH: 'PHP', BD: 'BDT',
  PK: 'PKR', NP: 'NPR', LK: 'LKR', BR: 'BRL', MX: 'MXN',
  ZA: 'ZAR', NG: 'NGN', RU: 'RUB', CH: 'CHF', SE: 'SEK',
  NO: 'NOK', DK: 'DKK', NZ: 'NZD', HK: 'HKD', KR: 'KRW',
  ID: 'IDR', DE: 'EUR', FR: 'EUR', IT: 'EUR', ES: 'EUR',
  NL: 'EUR', BE: 'EUR', PT: 'EUR', AT: 'EUR', FI: 'EUR',
  IE: 'EUR', GR: 'EUR', PL: 'PLN', CZ: 'CZK', HU: 'HUF',
}

function getDeviceCurrency() {
  try {
    const locale = Localization.getLocales?.()[0]
    const region = locale?.regionCode || locale?.languageTag?.split('-')[1]
    return REGION_CURRENCY_MAP[region] || 'USD'
  } catch {
    return 'USD'
  }
}

export async function saveCurrency(currencyCode) {
  try {
    _cachedCode = currencyCode
    await AsyncStorage.setItem(CURRENCY_KEY, currencyCode)
  } catch {}
}

export async function loadCurrency() {
  try {
    if (_cachedCode) return _cachedCode
    const saved = await AsyncStorage.getItem(CURRENCY_KEY)
    _cachedCode = saved || getDeviceCurrency()
    return _cachedCode
  } catch {
    return getDeviceCurrency()
  }
}

export async function getCurrencySymbol() {
  try {
    const code = await loadCurrency()
    const cur = CURRENCIES.find(c => c.code === code)
    return cur?.symbol || '$'
  } catch {
    return '$'
  }
}

// Country locale map for each currency code
const CURRENCY_LOCALE_MAP = {
  AUD: 'en-AU', BDT: 'bn-BD', BRL: 'pt-BR', GBP: 'en-GB',
  CAD: 'en-CA', CNY: 'zh-CN', DKK: 'da-DK', EUR: 'de-DE',
  HKD: 'zh-HK', INR: 'en-IN', IDR: 'id-ID', JPY: 'ja-JP',
  MYR: 'ms-MY', MXN: 'es-MX', NPR: 'ne-NP', NZD: 'en-NZ',
  NGN: 'en-NG', NOK: 'nb-NO', PKR: 'ur-PK', RUB: 'ru-RU',
  SAR: 'ar-SA', SGD: 'en-SG', ZAR: 'en-ZA', KRW: 'ko-KR',
  LKR: 'si-LK', SEK: 'sv-SE', CHF: 'de-CH', THB: 'th-TH',
  AED: 'ar-AE', USD: 'en-US', PHP: 'en-PH',
}

const NO_DECIMAL_CURRENCIES = ['JPY', 'KRW', 'IDR']

// Rounds to 2 decimal places, correcting the binary floating-point drift that
// accumulates when summing many amounts with reduce() (e.g. 0.1 + 0.2 !== 0.3).
// Apply this at every running-total site, not just at final display, since
// unrounded intermediate totals can also feed into budget/threshold comparisons.
export function roundMoney(amount) {
  const num = Number(amount)
  if (!Number.isFinite(num)) return 0
  return Math.round((num + Number.EPSILON) * 100) / 100
}

export function formatAmount(amount, symbol = '$', currencyCode = null) {
  try {
    const num = parseFloat(amount)
    if (isNaN(num)) return `${symbol}0.00`
    const code = currencyCode || _cachedCode || 'USD'
    const locale = CURRENCY_LOCALE_MAP[code] || 'en-US'
    const noDecimal = NO_DECIMAL_CURRENCIES.includes(code)
    const formatted = num.toLocaleString(locale, {
      minimumFractionDigits: noDecimal ? 0 : 2,
      maximumFractionDigits: noDecimal ? 0 : 2,
    })
    return `${symbol}${formatted}`
  } catch {
    const n = parseFloat(amount)
    return `${symbol}${(isNaN(n) ? 0 : n).toFixed(2)}`
  }
}

export async function formatAmountWithCode(amount) {
  try {
    const code = await loadCurrency()
    const cur = CURRENCIES.find(c => c.code === code)
    const symbol = cur?.symbol || '$'
    return formatAmount(amount, symbol, code)
  } catch {
    const n = parseFloat(amount)
    return `$${(isNaN(n) ? 0 : n).toFixed(2)}`
  }
}

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