import { View } from 'react-native'

// Never redirects to a hardcoded route — _layout.jsx's redirect effect owns
// that decision and sends session-aware users straight to dashboard or login
// in one hop. This just needs to not flash anything different from the
// native splash for the one frame before that effect fires. #0F0F0F matches
// the splash/gate color intentionally (see the gate's own comment in
// _layout.jsx), not COLORS.bg, which is theme-dependent and would be a
// launch flash in light mode.
export default function Index() {
  return <View style={{ flex: 1, backgroundColor: '#0F0F0F' }} />
}
