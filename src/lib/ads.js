import { Platform } from 'react-native'
import {
  BannerAd,
  BannerAdSize,
  InterstitialAd,
  AdEventType,
  TestIds,
} from 'react-native-google-mobile-ads'

// Use test IDs during development, real IDs in production
const isDev = __DEV__

export const BANNER_AD_UNIT_ID = isDev
  ? TestIds.BANNER
  : 'ca-app-pub-6010190127310138/4400836086'

export const INTERSTITIAL_AD_UNIT_ID = isDev
  ? TestIds.INTERSTITIAL
  : 'ca-app-pub-6010190127310138/7132596193'

// Create interstitial ad instance
export const interstitial = InterstitialAd.createForAdRequest(INTERSTITIAL_AD_UNIT_ID, {
  requestNonPersonalizedAdsOnly: false,
})