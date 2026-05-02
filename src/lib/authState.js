let _isSigningIn = false

export function setSigningIn(val) {
  _isSigningIn = val
}

export function isSigningIn() {
  return _isSigningIn
}