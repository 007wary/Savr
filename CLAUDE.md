# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Working relationship

Treat me as the product head, lead dev, engineer, design head, and analyst rolled into one — I switch hats constantly, so calibrate your response to the hat the request implies. When I ask for a feature, weigh product impact and UX, not just the diff. When I report a bug, find the root cause before patching a symptom. When I ask for numbers, be precise about where they come from and what they exclude. Give a recommendation, not a menu of options; I'll push back if I disagree. Match the existing code's density and idiom — this codebase favors terse, comment-explained-why code over defensive boilerplate.

## Commands

```bash
npm install --legacy-peer-deps   # REQUIRED flag — peer deps don't resolve cleanly without it
npm start                        # Expo dev server
npm test                         # Jest (all tests)
npm run lint                     # ESLint (eslint-config-expo, flat config)
npx jest src/lib/recurring.test.js          # single test file
npx jest -t "calculates next due"            # single test by name
```

Native Android builds do **not** work on native Windows (NDK 27 `ld.lld` linker bug on RN 0.81). Build inside **WSL2** for local device testing — see [LOCAL_DEV.md](LOCAL_DEV.md).

**Release builds are produced by GitHub Actions**, not locally — [.github/workflows/build.yml](.github/workflows/build.yml) runs on push to `main` (Linux runner, unaffected by the Windows NDK bug) and builds **both a signed APK and a signed AAB**, uploaded as artifacts (`savr-release-apk`, `savr-release-aab`). The APK is for direct install/sideload testing; the AAB is the Play Store upload format. The workflow is gated by `npm run lint` + `npm test`, injects `google-services.json` and Supabase env from repo secrets, and verifies the signed APK actually embeds the Supabase config before uploading. To ship a release: bump `app.json` `version`/`android.versionCode`, push to `main`, and grab the artifacts.

JS-only changes still require a rebuilt APK to test on device — a release build does not hot-reload. Use Metro (`npm start`) + a dev build for fast iteration, or rebuild for a true release check.

## Architecture

### Local-first data, three tiers

The app is **offline-first**. The source of truth on-device is **local SQLite** (`expo-sqlite`), not Supabase.

1. **SQLite** ([src/services/sqliteService.js](src/services/sqliteService.js)) — all expense/income/transfer/budget/account/recurring reads and writes go here. Any mutation that moves an account balance is an `...Atomic` function wrapped in a transaction so the balance and its ledger row can't drift: `addExpenseAtomic`/`deleteExpenseAtomic`, `addIncomeAtomic`/`deleteIncomeAtomic`, `addTransferAtomic`/`deleteTransferAtomic`, and `processRecurring{Expense,Income}ItemAtomic`. Use these — never hand-rolled multi-statement writes. `initializeDatabase()` runs idempotent `ALTER TABLE`/`CREATE TABLE IF NOT EXISTS` migrations on every launch; add schema changes there as new guarded blocks (never a destructive migration — this DB is the user's only local copy until the next Drive backup).
2. **Supabase** ([src/lib/supabase.js](src/lib/supabase.js)) — auth (Google Sign-In via PKCE), user profiles, edge functions, and admin/analytics. It is **not** the transaction ledger. The client throws at import time if `EXPO_PUBLIC_SUPABASE_*` env vars are missing — that surfaces as a blank screen (the throw happens before React mounts, so the ErrorBoundary can't catch it). The CI build verifies the config is actually embedded in the signed APK.
3. **Google Drive backup** ([src/services/driveBackupService.js](src/services/driveBackupService.js)) — the SQLite DB is snapshotted to the user's Drive `drive.file` scope. `hasDataChanged()` hashes the data so unchanged state isn't re-uploaded; `backupOnAppOpen()` ([src/services/backgroundBackup.js](src/services/backgroundBackup.js)) runs on launch and foreground.

Data flows **SQLite → Drive** (backup) and **Drive → SQLite** (restore). Supabase is a parallel concern (identity + server features), not a sync layer between them.

### Navigation & the launch gate

File-based routing via **expo-router** under [app/](app/). Route groups: `(auth)` (login/webview), `(tabs)` (dashboard, add, history, budgets, reports, accounts), plus modal-style top-level screens (settings, recurring, backup, onboarding, manage-data).

[app/_layout.jsx](app/_layout.jsx) is the critical, load-bearing file. It owns:

- The **launch gate**: renders a blank `View` (color = `COLORS.bg`, which is white in light mode) until `session` and `onboardingDone` resolve. A slow path here = "blank screen on launch." Do **not** add blocking `await`s (e.g. DB init) in front of the session decision — the session/login-vs-dashboard call must not wait on anything it doesn't strictly need.
- A **startup watchdog** that force-resolves the gate to a logged-out state after a timeout, so a hung init can never freeze the app forever. Keep the watchdog timeout *above* the `getSession()` network-race timeout, or it trips first and spuriously logs the user out on a slow network.
- Auth state changes, cold-start notification-tap routing (stashed in a ref and drained only after the gate resolves — never navigate directly from the notification effect), and redirect logic between auth/onboarding/tabs.

### Business logic lives in `src/lib/`, not in screens

Screens stay thin. Domain logic — recurring processing, category detection, currency, forecasting, anomaly detection, budget recommendations, report insights — lives in [src/lib/](src/lib/) as pure-ish modules, most with a colocated `*.test.js`. Prefer adding logic there (and a test) over inlining it in a `.jsx` screen.

**Testing convention** (`jest-expo` preset): tests exercise `src/lib/` logic in isolation by mocking the native boundary — `jest.mock('../services/sqliteService', ...)` — so pure functions like `calculateNextDue` run without a real DB or device. Write new lib logic as functions that take data in and return data out (keep the SQLite call at the edge) so it stays unit-testable the same way. `jest.setup.js` already stubs AsyncStorage and localization globally.

**Dates**: derive day/month keys through `localDateKey`/`monthKey` in [src/lib/dateUtils.js](src/lib/dateUtils.js), never `toISOString().slice(0,10)` — the latter is UTC and silently shifts an expense into the wrong day/month near midnight. In a spend tracker that's a real correctness bug, not a nitpick.

### Cross-cutting conventions

- **Theming**: never hardcode colors. Use `useTheme()` → `COLORS` from [src/lib/themeContext.js](src/lib/themeContext.js); palettes are in [src/constants/theme.js](src/constants/theme.js) (`DARK_COLORS`/`LIGHT_COLORS`). Light-mode `bg` is `#FFFFFF`.
- **Error handling**: swallow background/best-effort failures with `.catch(() => {})`; for anything worth diagnosing, use `logError(context, err)` from [src/lib/errorLog.js](src/lib/errorLog.js) (routes to Crashlytics). Errors in module-eval or async init won't hit the React `ErrorBoundary` — handle those explicitly.
- **Caching**: transient view data goes through [src/lib/cache.js](src/lib/cache.js) (`saveCache`/`loadCache` with expiry). Auth/session persists in `expo-secure-store` (chunked, see `SecureChunkStore`). Small flags/prefs use AsyncStorage.
- **Startup cost**: [app/_layout.jsx](app/_layout.jsx) defers heavy/non-critical work (ads, FCM token, recurring processing, profile sync) behind staggered `setTimeout`s so nothing competes with first paint. Keep new startup work off the critical path the same way.

### Backend (Supabase)

Schema in `supabase/migrations/` (timestamped SQL; RLS policies are explicit and hardened). Server logic is Deno edge functions in `supabase/functions/` (analytics-proxy, google-token-refresh, send-backup-reminder, welcome-email). Edge functions are **excluded from ESLint** (`supabase/functions/**` is ignored) — they're Deno, not RN.

## Analytics (analyst hat)

Every product/behavioral event is centralized in the `Analytics` object in [src/lib/analytics.js](src/lib/analytics.js) — define new events there, never call `logEvent` ad hoc from screens, so the event catalog stays in one place. Events go to Firebase Analytics; `analytics.js` is the source of truth for event names and params, and the inline comments explain what each event is *for* as a metric (they're not decoration — read them before changing an event).

Deliberate measurement conventions to preserve:

- **No spend amounts on algorithm signals.** Categorization, anomaly, and forecast events log categorical fields only (category, source, from/to) — never amounts — so we can measure whether the smart features work without logging users' spend data. Keep that boundary.
- **Accuracy is measured by correction rate.** `category_autodetected` vs. `category_corrected` is the categorizer's accuracy proxy; `learned_category_hit` shows per-user learning is kicking in (`source` = `keyword` | `learned`).
- **Anomaly threshold tuning** comes from `anomaly_confirmed` (kept = true positive) vs. `anomaly_dismissed` (cancelled = likely false positive).
- **Forecast nudge funnel**: `forecast_nudge_sent` → `forecast_nudge_opened`. Judge the nudge by subsequent spend pace, not opens alone.

The underlying algorithms these events measure live in [src/lib/](src/lib/): `categoryDetector.js`, `anomalyDetector.js`, `spendingForecast.js`, `reportInsights.js`, `budgetRecommendations.js` (each with a `*.test.js`). When tuning an algorithm, check that its paired analytics signal still lets you measure the change.

## Design system (design hat)

All design tokens live in [src/constants/theme.js](src/constants/theme.js) — do not hardcode colors, spacing, or category styling in screens.

- **Colors**: `DARK_COLORS` / `LIGHT_COLORS` (accessed via `useTheme()`, never imported raw except the back-compat `COLORS` alias, which is dark-only — avoid it in new code). Accent `#6C63FF` is constant across themes; the semantic accents (`accentGreen`/`accentRed`/`accentYellow`) are deliberately *darker* in light mode for contrast — keep that when adding shades.
- **Layout**: use the `SCREEN` object for responsive values — `paddingHorizontal` (16 under 380px wide, else 20), `maxWidth: 500` (content is centered/capped, this is not an edge-to-edge app), `isSmall` (<360), `isTablet` (≥600), and `paddingTop` which already accounts for the status bar. Don't recompute these per screen.
- **Categories** are a fixed design set in `CATEGORIES` (label + Ionicons `*-outline` icon + color). Category color and icon come from here — a new category means editing this array, and its color should stay distinct from the existing eight.
- **Currencies**: `CURRENCIES` is the supported list (code/symbol/name/flag). Formatting logic is in [src/lib/currency.js](src/lib/currency.js) — add a currency here, format it there.

## Gotchas

- `package.json` `version` is vestigial — `app.json` (`version` + `android.versionCode`) is what actually ships. Bump `app.json` for releases; ignore the mismatch.
- `google-services.json` and `.env` are gitignored; CI injects them from repo secrets. A local checkout needs both present or the app won't build/run — and the Supabase client throws at import if the env is missing (blank screen, see the SQLite/Supabase tier note).
- `--legacy-peer-deps` is mandatory everywhere (local install, EAS, CI) — it's set in `.npmrc`, `eas.json`, and the workflow. Don't drop it.
- Verify claims against the code before acting on them — this file is maintained by hand and can lag. If something here contradicts what's in the repo, the repo wins; fix the line.
