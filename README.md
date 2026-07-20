# Savr

Track expenses, set budgets, get insights. A React Native / Expo app backed by Supabase.

## Stack

- [Expo](https://expo.dev) (React Native 0.81, React 19) with [expo-router](https://docs.expo.dev/router/introduction/) for file-based navigation
- [Supabase](https://supabase.com) for auth, Postgres, and edge functions
- Local SQLite (`expo-sqlite`) for offline data + Google Drive backup
- Firebase (Analytics, Crashlytics, Messaging) and Google Sign-In
- AdMob (`react-native-google-mobile-ads`)

## Getting started

### Prerequisites

- Node.js 20
- npm
- Expo CLI (`npx expo`, no global install needed)
- For native Android builds: see [LOCAL_DEV.md](LOCAL_DEV.md) (native builds require WSL2 on Windows)

### Setup

1. Install dependencies:
   ```
   npm install --legacy-peer-deps
   ```
2. Copy the environment template and fill in real values:
   ```
   cp .env.example .env
   ```
   - `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY` — from your Supabase project settings.
   - `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` — the **Web** OAuth client ID from Google Cloud Console, used by `@react-native-google-signin/google-signin`.
3. Place your own `google-services.json` at the project root (required for Firebase/Google Sign-In; gitignored).
4. Start the dev server:
   ```
   npm start
   ```

### Scripts

| Command | Description |
| --- | --- |
| `npm start` | Start the Expo dev server |
| `npm run android` | Build and run on Android (see [LOCAL_DEV.md](LOCAL_DEV.md) for Windows caveats) |
| `npm run ios` | Build and run on iOS |
| `npm run web` | Run in a web browser |
| `npm test` | Run Jest tests |
| `npm run lint` | Run ESLint |

## Project structure

```
app/            Expo Router routes (screens, layouts, tab navigation)
src/
  components/   Shared UI components
  constants/     Theme and legal text
  hooks/         Shared React hooks
  lib/           Business logic, Supabase client, auth, currency, etc.
  services/      SQLite and background backup services
supabase/
  migrations/    Postgres schema migrations
  functions/     Supabase Edge Functions (Deno)
android/         Native Android project (generated via `expo prebuild`)
```

## Backend

Supabase project config lives in `supabase/config.toml`. Schema changes go in `supabase/migrations/`; server-side logic lives in `supabase/functions/`.

## Deployment

Android release builds run via GitHub Actions (`.github/workflows/build.yml`) on pushes to `main`, producing a signed APK/AAB. EAS build profiles are defined in `eas.json`.
