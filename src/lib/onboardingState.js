let _onboardingDone = null // null = not yet loaded, true/false once known
const listeners = new Set()

export function setOnboardingDone(val) {
  _onboardingDone = val
  listeners.forEach(fn => fn(val))
}

export function getOnboardingDone() {
  return _onboardingDone
}

// Lets subscribers (the root layout's navigation effect) re-run the instant
// onboarding.jsx marks itself done, since it's a plain module variable and
// mutating it doesn't trigger a re-render on its own. Without this, the root
// layout's onboardingDone React state stays stale after handleDone() writes
// AsyncStorage directly, and the redirect effect bounces the user straight
// back to /onboarding on the next segment change (session still null at that
// point, pre-login).
export function subscribeOnboardingDone(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}
