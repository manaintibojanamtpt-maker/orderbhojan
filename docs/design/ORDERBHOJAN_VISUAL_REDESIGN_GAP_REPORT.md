# ORDERBHOJAN — VISUAL REDESIGN GAP REPORT & STARTUP CRASH RESOLUTION

**Document ID:** `docs/design/ORDERBHOJAN_VISUAL_REDESIGN_GAP_REPORT.md`  
**Date:** October 26, 2026  
**Application:** OrderBhojan Customer App (`com.bhojanos.customer`)  
**Architecture:** React 18 + TypeScript + Vite + Capacitor 8 + Android Gradle  
**Target Hardware Context:** Nokia T20 Tablet (Android 12) & Realme RMX5131 (Android 14)  
**Verified Output APK:** `android/app/build/outputs/apk/debug/app-debug.apk` (19,396,812 bytes, built 26-10-2026 12:44:35)

---

## 1. Executive Summary & Root Cause Analysis

### 1.1 The Reported Failure
When installing and launching the latest APK, the app displayed a black crash screen with the error:
```text
OrderBhojan failed to start
firebase.apiKey is required in production; firebase.appId is required in production
```

### 1.2 Root Cause Investigation
1. **Empty `.env` Keys:** In `.env`, `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_APP_ID`, and `VITE_FIREBASE_MESSAGING_SENDER_ID` were empty strings.
2. **Missing Fallbacks in `applyFirebaseDefaults`:** `src/config/clientConfig.ts` had fallback logic only for `projectId`, `authDomain`, and `storageBucket`, omitting `apiKey`, `appId`, and `messagingSenderId`.
3. **Startup Remote Hydration Failure:** At startup in `src/main.tsx`, `ensureAppConfig()` called `hydrateFirebaseConfig()`, which attempted to fetch `https://manaintibojanam-backend.onrender.com/api/client-config` with a 2500ms timeout. When Render spun down or had high cold-start latency, the network call timed out.
4. **Conditional Guard Failure:** The fallback branch `else if (wrongProdFirebaseProject || (usesLiveBackend && import.meta.env?.PROD))` failed to execute because `wrongProdFirebaseProject` was false (`projectId` was already `bhojanos-prod`), leaving `apiKey` and `appId` as empty strings.
5. **Strict Production Validation:** `src/config/validation.ts` strictly validates that `apiKey`, `authDomain`, `projectId`, and `appId` are non-empty in production. When missing, it threw `ConfigValidationError`, causing `bootstrap().catch()` to render the error screen.

### 1.3 Implemented Fix
- **Direct Fallback Integration:** In `src/config/environment.ts`, `loadAppConfig()` now falls back directly to `BHOJANOS_PROD_FIREBASE_PUBLIC` for `apiKey`, `authDomain`, `storageBucket`, `messagingSenderId`, and `appId`.
- **Zero-Latency Fallback in `clientConfig.ts`:** `applyFirebaseDefaults()` and `hydrateFirebaseConfig()` now guarantee complete Firebase configuration even if remote config is unreachable.
- **`.env` Alignment:** Populated `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_APP_ID`, and `VITE_FIREBASE_MESSAGING_SENDER_ID` with the public Firebase Web SDK credentials for `bhojanos-prod`.
- **Compiled Bundle Verification:** Verified that `AIzaSyC6kCJwsEWuwLVPGmJsVDDxTyWlayp2yLQ` is statically baked into `dist/assets/index-CV-ojP_Z.js`.

---

## 2. Visual Redesign Gap Analysis

| Component / Screen | Baseline State | Flutter-Style Visual Standard | Implementation Status |
|---|---|---|:---:|
| **Splash Screen & Bootstrap** | App stuck on splash screen or crash screen. | Smooth 2000ms splash fadeout into Warm Cream / Culinary Warm canvas; zero reload loops. | **Resolved** (`launchAutoHide: true`, reload guard in `vite.config.ts`, `SplashScreen.hide()`) |
| **Home Hero & Header** | Flat web banner with generic text styling. | Food-first squircle carousel with Ken Burns micro-motion, location bar, quick search pill. | **Implemented** (`MarketplaceDiscoveryHeroView.tsx`, `OrderBhojanHomeHero.tsx`) |
| **Category Discovery** | Text-heavy or unstyled category chips. | Circular "What's on your mind?" visual category carousel with smooth horizontal scroll and active border glow. | **Implemented** (`OrderBhojanHomeCategories.tsx`) |
| **Kitchen & Food Cards** | High-contrast dark cards with hardcoded backgrounds leaking into light theme. | Responsive squircle cards (`rounded-2xl`) using semantic `--ob-*` tokens, badge chips (rating, ETA, delivery fee, distance), satin controls. | **Implemented** (`MarketplaceKitchenCard.tsx`, `OrderBhojanKitchenCard.tsx`) |
| **Floating Navigation** | Edge-to-edge navbar colliding with safe areas and FAB. | Floating capsule bottom bar with backdrop blur, inset padding, and decoupled Voice Assistant FAB. | **Implemented** (`OrderBhojanBottomNav.tsx`, `ConsumerAssistantFab.tsx`) |
| **Sarvam AI Voice Assistant** | Misaligned mic panel, poor transcript contrast in light mode. | High-readability transcript bubbles in both themes, animated listening wave, multilingual Telugu/Hindi/English cues, stop controls. | **Implemented** (`ConsumerAssistantSheet.tsx`) |
| **Transactional Flows** | Inconsistent margins, jarring theme contrast across Cart/Checkout/Orders. | Unified `TransactionalPageShell` with squircle summary cards, numeric keyboard handling, and clear trust badges. | **Implemented** (`CartPageView.tsx`, `CheckoutPageView.tsx`, `OrdersListPageView.tsx`) |

---

## 3. Test & Verification Matrix

| Verification Step | Command | Result | Notes |
|---|---|---|---|
| **TypeScript Typecheck** | `npm run typecheck` | **PASS (0 errors)** | Strict types verified across all modules |
| **BDS Design System Tests** | `npm run test:bds` | **PASS (27/27)** | Theme consistency, token isolation, pre-hydration check |
| **AI & Voice Test Suite** | `npm run test:ai` | **PASS (149/149)** | Sarvam AI, multilingual ASR/TTS, cart-plan gates |
| **Production Web Build** | `npm run build` | **PASS (15.24s)** | Built production assets with baked Firebase config |
| **Capacitor Android Sync** | `npx cap sync android` | **PASS (0.43s)** | Web assets copied to `android/app/src/main/assets/public` |
| **Android Gradle Build** | `node scripts/android-gradle.mjs assembleDebug` | **PASS (47s)** | APK generated at `android/app/build/outputs/apk/debug/app-debug.apk` (19,396,812 bytes) |
| **Physical Hardware Check** | `adb devices -l` | **0 devices attached** | Hardware is currently detached; reported transparently |

---

## 4. Hardware Deployment Instructions

To install the verified APK on the Nokia T20 or Realme physical device:
1. Connect device via USB with USB Debugging enabled:
   ```powershell
   adb devices -l
   ```
2. Install the new debug build:
   ```powershell
   adb install -r android/app/build/outputs/apk/debug/app-debug.apk
   ```
3. Launch the application:
   ```powershell
   adb shell am start -n com.bhojanos.customer/com.bhojanos.customer.MainActivity
   ```
