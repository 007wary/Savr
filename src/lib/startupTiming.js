// TEMPORARY startup profiler — grep "STARTUP" in logcat to read it, then delete
// this file and every mark() call once launch timing is understood.
//
// t0 is the moment this module is first evaluated (≈ first JS to run under
// expo-router/entry). Every mark logs ms-since-t0 and the delta from the
// previous mark, so the gaps between milestones are readable directly:
//
//   adb logcat | grep STARTUP
//
const t0 = Date.now()
let last = t0

export function mark(label) {
  const now = Date.now()
  const sinceStart = now - t0
  const delta = now - last
  last = now
  console.log(`STARTUP +${sinceStart}ms (Δ${delta}ms) ${label}`)
}

mark('startupTiming module eval')
