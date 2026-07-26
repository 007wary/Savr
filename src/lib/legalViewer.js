import * as WebBrowser from 'expo-web-browser'
import { Linking } from 'react-native'

const URLS = {
  privacy: 'https://savrappindia.vercel.app/privacy',
  terms: 'https://savrappindia.vercel.app/terms',
}

// Opens the hosted privacy/terms page in a Chrome Custom Tab (falls back to
// the system browser if Custom Tabs are unavailable), instead of an embedded
// WebView or a locally-generated HTML file.
export async function openLegalDoc(type) {
  const url = URLS[type]
  try {
    await WebBrowser.openBrowserAsync(url)
  } catch {
    await Linking.openURL(url)
  }
}
