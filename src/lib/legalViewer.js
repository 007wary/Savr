import * as WebBrowser from 'expo-web-browser'
import * as FileSystem from 'expo-file-system/legacy'
import { PRIVACY_POLICY_HTML, TERMS_HTML } from '../constants/legal'

// Opens privacy/terms as a Chrome Custom Tab instead of an embedded WebView.
// react-native-webview's native ViewManager gets eagerly constructed by React
// Native's New Architecture component registry at app process start (Fabric
// registers all autolinked ViewManagers up front, not lazily per-screen) —
// measured triggering Android's WebViewFactory/Chromium init and blocking the
// JS thread for ~4s on cold launch, even though this screen is only ever
// reached by tapping a link on login/settings. Custom Tabs use the system
// browser process instead, so there's no ViewManager to register and nothing
// on the launch path to block.
//
// The HTML is written to a cache file and opened via a content:// URI rather
// than a data: URL: a base64 data: URL for this content is ~9KB, well past
// the ~2000-char limit Android enforces on ACTION_VIEW intent URIs, so the
// Custom Tab intent silently failed to launch.
export async function openLegalDoc(type) {
  const html = type === 'privacy' ? PRIVACY_POLICY_HTML : TERMS_HTML
  const fileUri = `${FileSystem.cacheDirectory}savr-${type}.html`
  await FileSystem.writeAsStringAsync(fileUri, html, { encoding: 'utf8' })
  const contentUri = await FileSystem.getContentUriAsync(fileUri)
  await WebBrowser.openBrowserAsync(contentUri)
}
