import * as WebBrowser from 'expo-web-browser'
import { PRIVACY_POLICY_HTML, TERMS_HTML } from '../constants/legal'

const BASE64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

// Hermes has no Buffer and no UTF-8-safe btoa, and the legal HTML contains
// non-ASCII characters (em dashes, middle dots) — so encode the UTF-8 bytes
// directly instead of pulling in a dependency for this one call site.
function utf8ToBase64(str) {
  const bytes = []
  for (let i = 0; i < str.length; i++) {
    let code = str.codePointAt(i)
    if (code > 0xffff) i++ // consumed a surrogate pair
    if (code < 0x80) {
      bytes.push(code)
    } else if (code < 0x800) {
      bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f))
    } else if (code < 0x10000) {
      bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f))
    } else {
      bytes.push(
        0xf0 | (code >> 18),
        0x80 | ((code >> 12) & 0x3f),
        0x80 | ((code >> 6) & 0x3f),
        0x80 | (code & 0x3f)
      )
    }
  }
  let out = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i], b1 = bytes[i + 1], b2 = bytes[i + 2]
    out += BASE64_CHARS[b0 >> 2]
    out += BASE64_CHARS[((b0 & 3) << 4) | (b1 === undefined ? 0 : b1 >> 4)]
    out += b1 === undefined ? '=' : BASE64_CHARS[((b1 & 15) << 2) | (b2 === undefined ? 0 : b2 >> 6)]
    out += b2 === undefined ? '=' : BASE64_CHARS[b2 & 63]
  }
  return out
}

// Opens privacy/terms as a data: URL in a Chrome Custom Tab instead of an
// embedded WebView. react-native-webview's native ViewManager gets eagerly
// constructed by React Native's New Architecture component registry at app
// process start (Fabric registers all autolinked ViewManagers up front, not
// lazily per-screen) — measured triggering Android's WebViewFactory/Chromium
// init and blocking the JS thread for ~4s on cold launch, even though this
// screen is only ever reached by tapping a link on login/settings. Custom
// Tabs use the system browser process instead, so there's no ViewManager to
// register and nothing on the launch path to block.
export async function openLegalDoc(type) {
  const html = type === 'privacy' ? PRIVACY_POLICY_HTML : TERMS_HTML
  const url = `data:text/html;base64,${utf8ToBase64(html)}`
  await WebBrowser.openBrowserAsync(url)
}
