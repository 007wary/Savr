// Bridges "the first real screen has painted" from whichever entry screen mounts
// (dashboard / login / onboarding) up to the root layout, which owns the native
// splash. The root layout can't reliably know when expo-router has finished
// painting the child route, so instead of guessing with a timer it waits for the
// screen itself to fire onLayout and call signalFirstPaint(). This makes the
// splash hide only AFTER content is on screen — no bare theme-colored frame in
// between (the launch flash).
//
// It's a one-shot latch: fires once per app process, and a screen that mounts
// after the splash is already gone just no-ops.
let painted = false
let listener = null

export function signalFirstPaint() {
  if (painted) return
  painted = true
  const l = listener
  listener = null
  if (l) l()
}

// Root layout subscribes once. If paint already happened before we subscribed
// (fast screen wins the race), fire immediately so we never hang the splash.
export function onFirstPaint(cb) {
  if (painted) { cb(); return () => {} }
  listener = cb
  return () => { if (listener === cb) listener = null }
}
