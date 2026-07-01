let _isSigningIn = false
const listeners = new Set()

export function setSigningIn(val) {
  _isSigningIn = val
  listeners.forEach(fn => fn(val))
}

export function isSigningIn() {
  return _isSigningIn
}

// Lets subscribers (e.g. the root layout's navigation effect) re-run when the
// flag flips, since it's a plain module variable and mutating it doesn't
// trigger a re-render on its own.
export function subscribeSigningIn(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}
