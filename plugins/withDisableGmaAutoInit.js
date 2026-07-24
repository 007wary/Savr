const { withAndroidManifest } = require('@expo/config-plugins')

// The Google Mobile Ads native SDK (play-services-ads) auto-initializes at
// process start via its own manifest-declared ContentProvider
// (com.google.android.gms.ads.MobileAdsInitProvider) — this runs before any
// JS executes, regardless of when the app calls mobileAds().initialize().
// Measured on device: that auto-init constructs an internal android.webkit.WebView
// (used for ad rendering), which cold-boots Android's System WebView/Chromium
// and blocks the JS thread for ~4s on every launch — the app's dashboard
// couldn't mount until this finished. This is a long-standing, Google-
// acknowledged SDK issue (see the public admob-ads-sdk forum reports of
// MobileAds.initialize() blocking the main thread for seconds), with no
// official flag that fully prevents it — OPTIMIZE_INITIALIZATION only
// backgrounds *some* of the work if you call initialize() on the main thread.
//
// The fix: remove the auto-init ContentProvider from the merged manifest, so
// GMA does NOT self-initialize at process start. The app already calls
// mobileAds().initialize() itself (src/lib/ads.js), deferred well past first
// paint (app/_layout.jsx) — that explicit call still initializes ads
// correctly, just off the launch-critical path instead of blocking it.
function withDisableGmaAutoInit(config) {
  return withAndroidManifest(config, (config) => {
    const application = config.modResults.manifest.application?.[0]
    if (!application) return config

    if (!application.provider) application.provider = []
    application.provider.push({
      $: {
        'android:name': 'com.google.android.gms.ads.MobileAdsInitProvider',
        'tools:node': 'remove',
      },
    })

    return config
  })
}

module.exports = withDisableGmaAutoInit
