import mobileAds from 'react-native-google-mobile-ads'

const isDev = __DEV__

export const BANNER_AD_UNIT_ID = isDev
  ? 'ca-app-pub-3940256099942544/6300978111'
  : 'ca-app-pub-6010190127310138/4400836086'

export const INTERSTITIAL_AD_UNIT_ID = isDev
  ? 'ca-app-pub-3940256099942544/1033173712'
  : 'ca-app-pub-6010190127310138/7132596193'

export async function initializeAds() {
  try {
    await mobileAds().initialize()
  } catch {}
}