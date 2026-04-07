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