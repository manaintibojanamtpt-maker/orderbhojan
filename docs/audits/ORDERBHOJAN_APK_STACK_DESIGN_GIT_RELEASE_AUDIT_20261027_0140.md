# ORDERBHOJAN CUSTOMER APP — FORENSIC APK STACK, UI/DESIGN & GIT AUDIT REPORT

**Date:** October 27, 2026, 01:40 IST  
**Repository:** `F:\Manaintibojanam_final2\orderbhojan`  
**Git Remote:** `https://github.com/manaintibojanamtpt-maker/orderbhojan.git` (`origin`)  
**Active Branch:** `review/phaseb-realtime-tracking`  
**HEAD Commit:** `51e72c0` (*fix(android): keep domStorage enabled to prevent localStorage crash*)  
**Merge Base with `origin/main` (`02bfe27`):** `79353ab`  
**Audit Scope:** OrderBhojan Customer Android App (`com.bhojanos.customer`). Read-only forensic analysis.  

---

## 1. Executive Summary

A comprehensive, read-only forensic audit was performed on the OrderBhojan Customer Android application.

### Key Audit Findings:
1. **Actual Technology Stack**: The app is built on **React 19.0.0 + TypeScript 5.8.2 + Vite 6.4.3**, wrapped for Android via **Capacitor 8.5.3**, with optional Android Jetpack Compose native activities (`TrackActivity`). It is **not** a Flutter or React Native application (`libflutter.so`, `libhermes.so`, and Dart runtimes are absent).
2. **Current APK Provenance**: The inspected signed release APK (`app-release.apk`, 13.82 MB, SHA-256: `D4D79CC70BD78E2C1E02035D2E9FE4443534297343434C551FBBFBC61F53F475`) was built at `2026-10-26 23:53:31 IST`. Forensic inspection confirms that all 39 compiled web assets in `dist/assets` match the files inside `assets/public/assets/` of `app-release.apk` with identical content hashes.
3. **Local Working-Tree Divergence**: The current APK includes the latest local source files (including the P0 production database recovery, the Sarvam Saaras v4 STT integration, and the Warm Charcoal UI tokens). However, **265 tracked files remain modified and uncommitted**, **37 files/directories are untracked**, and **7 local commits (or 9 relative to `origin/review/phaseb-realtime-tracking`) have NOT been pushed to Git**.
4. **Physical Device State**: The app (`v0.9.0`, versionCode `2`) is verified installed and active on a physical **Nokia T20 tablet** (`4000TA13921A1402579`). Saved addresses, live kitchens, cart items, and the Sarvam Voice Agent bottom sheet are directly verified via screenshots. A second targeted device (Realme RMX5131) is currently unattached.
5. **Security & Secrets**: Scans of `dist/assets/*.js` and native assets revealed **0 leaked secrets**. `SARVAM_API_KEY` is completely absent from client bundles and mediated exclusively by the Render backend.

---

## 2. Confirmed Technology Stack

| Category | Actual Implementation | Evidence File | Confidence |
|---|---|---|---|
| **UI Framework** | React 19.0.0 (`react`, `react-dom`) | `package.json#L92-L93` | Verified Fact |
| **Programming Language** | TypeScript 5.8.2 (`typescript`) | `package.json#L118`, `tsconfig.json` | Verified Fact |
| **Android Wrapper** | Capacitor Android 8.5.3 (`@capacitor/android`, `@capacitor/core`) | `package.json#L72,L75`, `android/` | Verified Fact |
| **Native Components** | Jetpack Compose (`androidx.compose:compose-bom:2024.02.00`) for `TrackActivity` | `android/app/build.gradle#L100-L106`, `AndroidManifest.xml#L48` | Verified Fact |
| **Build System** | Vite 6.4.3 (`vite`, `@vitejs/plugin-react` 5.0.4) | `package.json#L109,L120`, `vite.config.ts` | Verified Fact |
| **Routing** | React Router DOM 7.18.4 (`react-router-dom`) | `src/app/routes/AppRouter.tsx`, `package.json#L95` | Verified Fact |
| **State Management** | Zustand 5.0.8 & TanStack React Query 5.90.2 | `package.json#L85,L99` | Verified Fact |
| **Styling System** | Tailwind CSS v4 (`@tailwindcss/vite` 4.1.14) + CSS Custom Properties | `package.json#L105`, `src/styles/ob-tokens.css` | Verified Fact |
| **Design System** | Bhojan Design System (BDS) & OrderBhojan Unified Warm Tokens | `src/styles/bds.css`, `src/styles/ob-tokens.css` | Verified Fact |
| **Motion & Animation** | Framer Motion 12.42.2 (`framer-motion`) | `package.json#L89` | Verified Fact |
| **Iconography** | Lucide React 0.546.0 (`lucide-react`) | `package.json#L90` | Verified Fact |
| **Typography** | Plus Jakarta Sans / Outfit / Fraunces Variable Fonts | `package.json#L82-L83`, `src/styles/ob-tokens.css` | Verified Fact |
| **API / Backend** | REST over HTTPS (`https://manaintibojanam-backend.onrender.com`) | `src/config/environment.ts#L36`, `dist/assets/index-Dr2gp-_-.js` | Verified Fact |
| **Authentication** | Firebase Auth 12.11.0 & Capacitor Firebase Auth 8.3.0 (`bhojanos-prod`) | `capacitor.config.ts#L47-L53`, `src/config/clientConfig.ts` | Verified Fact |
| **Voice / STT** | Sarvam Saaras v4 via Backend Gateway + Native Android STT Bridge | `src/features/assistant/infrastructure/voiceSttGatewayClient.ts` | Verified Fact |
| **Local Cache** | Dexie 4.4.6 (IndexedDB) & LocalStorage | `package.json#L87`, `src/features/theme/themeService.ts` | Verified Fact |

---

## 3. APK Inspection & Metadata

### Artifact Comparison Table

| Attribute | Production Signed Release APK | Android Debug APK |
| :--- | :--- | :--- |
| **File Path** | `android/app/build/outputs/apk/release/app-release.apk` | `android/app/build/outputs/apk/debug/app-debug.apk` |
| **File Size** | `13,817,614` bytes (13.82 MB) | `19,143,035` bytes (19.14 MB) |
| **Last Modified** | `2026-10-26 23:53:31 IST` | `2026-10-26 23:27:45 IST` |
| **SHA-256 Checksum** | `D4D79CC70BD78E2C1E02035D2E9FE4443534297343434C551FBBFBC61F53F475` | `C607CA0E483214A1BE25B299D01ACF688BC08A2B00B404614414C67D48A20B6D` |
| **Application ID** | `com.bhojanos.customer` | `com.bhojanos.customer` |
| **Version Name / Code**| `0.9.0` / `2` | `0.9.0` / `2` |
| **Min / Target SDK** | Min SDK `24` (Android 7.0) / Target SDK `36` (Android 16) | Min SDK `24` / Target SDK `36` |
| **Signing Scheme** | APK Signature Scheme v2 | APK Signature Scheme v2 |
| **Signer Certificate** | `CN=OrderBhojan, OU=BhojanOS, O=BhojanOS, L=Bengaluru, ST=Karnataka, C=IN` | `CN=Android Debug, O=Android, C=US` |
| **Cert SHA-256** | `2d508953a04a3c70a3b9e25bcb73a32d0e95a012854428e41855287d367dfd5a` | `d4a644f9992638bf4416790d8dbac44a5ecc6510a7164f658a0db928606084aa` |
| **Debuggable** | `false` (no `application-debuggable` flag) | `true` (`application-debuggable` present) |
| **Native Libraries** | `libdatastore_shared_counter.so` (arm64-v8a, armeabi-v7a, x86, x86_64) | `libdatastore_shared_counter.so` |
| **Web Assets Count** | 39 assets in `assets/public/assets/` | 39 assets in `assets/public/assets/` |

---

## 4. Visual Design System & Color Palette

The app implements a **Warm Culinary Minimal** visual direction through CSS custom properties defined in `src/styles/ob-tokens.css` and `src/styles/bds.css`, compiled into `index-BaPK7fLK.css` in the APK.

### Color Tokens Table

| Token Usage | Source-Defined Value | Packaged APK Value | Theme Mode | Evidence / Component |
|---|---|---|---|---|
| **Page Background** | `#0E0C0A` | `#0E0C0A` | Dark (Default) | `ob-tokens.css#L12`, `index-BaPK7fLK.css` |
| **Card / Surface** | `#171310` | `#171310` | Dark (Default) | `ob-tokens.css#L13`, `index-BaPK7fLK.css` |
| **Surface Strong** | `#201A15` | `#201A15` | Dark (Default) | `ob-tokens.css#L14`, `index-BaPK7fLK.css` |
| **Surface Elevated** | `#2A221C` | `#2A221C` | Dark (Default) | `ob-tokens.css#L15`, `index-BaPK7fLK.css` |
| **Primary Brand** | `#F27A1A` | `#F27A1A` | Dark (Default) | `ob-tokens.css#L24` (Culinary Amber) |
| **Brand Glow** | `rgba(242, 122, 26, 0.30)`| `rgba(242, 122, 26, 0.30)`| Dark (Default) | `ob-tokens.css#L26` |
| **Text Primary** | `#FFF9F2` | `#FFF9F2` | Dark (Default) | `ob-tokens.css#L30` (Warm Ivory) |
| **Text Secondary** | `#B5A594` | `#B5A594` | Dark (Default) | `ob-tokens.css#L31` (Warm Muted) |
| **Text Tertiary** | `#7D6F60` | `#7D6F60` | Dark (Default) | `ob-tokens.css#L32` |
| **Borders** | `rgba(255, 248, 240, 0.08)`| `rgba(255, 248, 240, 0.08)`| Dark (Default) | `ob-tokens.css#L18` |
| **Success / Veg** | `#34D399` / `#22C55E` | `#34D399` / `#22C55E` | Dark (Default) | `ob-tokens.css#L36`, `bds.css#L26` |
| **Warning** | `#FBBF24` / `#F59E0B` | `#FBBF24` / `#F59E0B` | Dark (Default) | `ob-tokens.css#L38`, `bds.css#L27` |
| **Error / Non-Veg**| `#F87171` / `#EF4444` | `#F87171` / `#EF4444` | Dark (Default) | `ob-tokens.css#L40`, `bds.css#L28` |
| **Info / Delivery**| `#60A5FA` / `#38BDF8` | `#60A5FA` / `#38BDF8` | Dark (Default) | `ob-tokens.css#L42`, `bds.css#L41` |
| **Glass Background**| `rgba(19, 16, 13, 0.82)`| `rgba(19, 16, 13, 0.82)`| Dark (Default) | `ob-tokens.css#L45` (Blur: 20px) |
| **Page Background** | `#FAF7F2` | `#FAF7F2` | Light Theme | `ob-tokens.css#L59` (Warm Cream) |
| **Surface** | `#FFFFFF` | `#FFFFFF` | Light Theme | `ob-tokens.css#L60` |
| **Primary Brand** | `#E96F12` | `#E96F12` | Light Theme | `ob-tokens.css#L71` (Saffron Orange) |
| **Text Primary** | `#211A15` | `#211A15` | Light Theme | `ob-tokens.css#L77` |

### Typography Scale
- **Primary Body Font:** `"Plus Jakarta Sans", ui-sans-serif, system-ui, sans-serif`
- **Display Headings:** `"Outfit", var(--ob-font-sans)`
- **Editorial / Story Titles:** `"Fraunces", var(--ob-font-sans)`
- **Packaged Font Files:** Embedded in APK as WOFF2 (`figtree-latin-wght-normal-D_ZTVpCC.woff2`, `fraunces-latin-wght-normal-ukD16Tqj.woff2`, etc.).

---

## 5. Screen & Component Inventory

| Screen / Flow | Source Entry Point | Key UI Components | Status in APK | Verified on Device? |
|---|---|---|:---:|:---:|
| **Home Discovery** | `src/app/pages/HomePage.tsx` | `OrderBhojanHomeHero`, `DiscoveryCollectionRail`, `OrderBhojanKitchenCard`, `TrendingFoodsSection` | Present | **YES (Nokia T20)** |
| **Search & Discovery** | `src/features/experience/ui/search/` | `MarketplaceSearchBar`, `MarketplaceSearchFilterChips`, `MarketplaceSearchResults` | Present | Present in APK bundle |
| **Restaurant Storefront**| `src/presentation/restaurant/` | `OrderBhojanRestaurantHero`, `OrderBhojanFoodMenuSection`, `OrderBhojanRestaurantMeta` | Present | Present in APK bundle |
| **Food & Customization**| `src/features/food/` | `OrderBhojanFoodCardItem`, `OrderBhojanFoodCustomizeSheet`, `OrderBhojanFoodStoryPanel` | Present | Present in APK bundle |
| **Cart & Mini-Cart** | `src/presentation/cart/` | `OrderBhojanCartExperience`, `OrderBhojanFoodFloatingCart`, `ContextualRecommendations` | Present | **YES (Cart badge 1 verified)** |
| **Checkout Flow** | `src/features/checkout/` | `OrderBhojanCheckoutSuccessView`, `OrderBhojanOrderTrustPanel`, `UpiPaymentPendingView` | Present | Present in APK bundle |
| **Voice Assistant** | `src/features/assistant/` | `ConsumerAssistantSheet`, `ConsumerAssistantFab`, `HomeVoiceHeroCard` | Present | **YES (Bottom sheet verified)** |
| **Order Tracking** | `src/features/tracking/` | `TrackingHeroView`, `CourierTrackingTimelineView`, `TrackActivity` (native) | Present | Present in APK bundle |
| **Order History** | `src/presentation/orders/` | `OrderBhojanOrdersExperience`, `OrderBhojanOrderSummaryCard` | Present | Present in APK bundle |
| **Profile & Settings** | `src/presentation/profile/` | `OrderBhojanProfilePage`, `SettingsPreferencesView` | Present | Present in APK bundle |
| **Auth Shell** | `src/presentation/auth/` | `OrderBhojanAuthShellPage`, `OrderBhojanPhoneOtpForm`, `AuthReturnNavigator` | Present | Present in APK bundle |

---

## 6. Git Working-Tree Audit

### Current Branch & Commit Hierarchy
- **Current Branch:** `review/phaseb-realtime-tracking`
- **Local HEAD:** `51e72c0` (*fix(android): keep domStorage enabled to prevent localStorage crash*)
- **Remote Tracking Reference:** Untracked directly; remote branch `origin/review/phaseb-realtime-tracking` is at commit `63c9953`.
- **Merge-Base with `origin/main` (`02bfe27`):** `79353ab`

### Unpushed Local Commits (Ahead of `origin/main`):
1. `43be015` - *fix(types): add deliveryType and scheduledFor to OrderTrackingResponse, add scheduledForLabel to TrackingHeroViewModel*
2. `2ea8ba9` - *fix(web): improve Capacitor detection and PWA cache cleanup for native runtime*
3. `4143584` - *fix(pwa): bump cacheId from v15 to v16 to force Service Worker cache invalidation*
4. `da0e5a0` - *fix(pwa): block stale Service Worker cache across APK installs*
5. `08c41ca` - *fix(android): disable WebView caching to prevent stale asset delivery*
6. `ca0e060` - *fix(pwa): guard version-check against null localStorage in Capacitor WebView*
7. `51e72c0` - *fix(android): keep domStorage enabled to prevent localStorage crash*

*(Note: Commits `7535ba9` and `79353ab` were previously merged into `origin/main` via PR #4 `02bfe27`).*

### Working-Tree Status Breakdown
- **Tracked modified files (unstaged):** 265 files
- **Staged files in index:** 0 files
- **Untracked files / directories:** 37 files / folders
- **Stashed changes:** 1 stash (`stash@{0}: On main: local assistant UPI firebase changes before main reconciliation`)

### Major Uncommitted Mobile-App Changes Breakdown
1. **Critical Production Recovery (P0)**:
   - `src/config/environment.ts` & `src/config/clientConfig.ts`: Locks native Capacitor runtime to live Render origin (`https://manaintibojanam-backend.onrender.com`), suppresses localhost fallback, ensures `bhojanos-prod` Firebase config.
   - `src/featureFlags/flags.ts`: Enforces `FF_OB_FIRESTORE = true` in production and Capacitor native.
   - `android/app/google-services.json`: Fixed to `bhojanos-prod`.
2. **Sarvam Saaras v4 STT Voice Assistant**:
   - `src/features/assistant/domain/buildDynamicMenuKeyterms.ts` (*untracked*): 50-item Saaras v4 dynamic dish keyterm generator.
   - `src/features/assistant/infrastructure/audioBlobRecorder.ts` (*untracked*): 16kHz mono audio recording wrapper.
   - `src/features/assistant/infrastructure/voiceSttGatewayClient.ts` (*untracked*): Client calling `/api/voice/transcribe` with auto-fallback to `/api/voice/stt`.
   - `src/features/assistant/hooks/useVoiceStt.ts`: Integration into voice pipeline.
3. **Design System & Presentation Updates**:
   - `src/styles/ob-tokens.css` & `src/styles/bds.css` (*untracked*): Central theme tokens.
   - `src/features/theme/themeService.ts` (*untracked*): Theme persistence & native status bar control.
   - 100+ components in `src/presentation/` modernized to Warm Charcoal tokens.

---

## 7. APK vs. Source Provenance Comparison

| Comparison Category | Finding | Evidence & Confidence |
|---|---|---|
| **1. Source changes missing from APK** | **NONE FOUND** | All 39 files in `dist/assets` match `assets/public/assets/` inside `app-release.apk`. All source modifications are older than the build timestamp `2026-10-26 23:51:11`. |
| **2. APK content not in current source** | **NONE FOUND** | All packaged JS/CSS/asset hashes match the current `dist/` directory. |
| **3. Working tree vs. Git history mismatch** | **SIGNIFICANT GAP** | The current APK reflects local uncommitted modifications across 265 files + 37 untracked files. If the working tree were checked out clean, the APK could NOT be reproduced from Git HEAD (`51e72c0`). |

---

## 8. Security & Release Integrity Audit

1. **Zero Secret Leakage in Client Assets**:
   - `Select-String` scan across all JS chunks in `dist/assets/*.js`: **0 occurrences** of `SARVAM_API_KEY`, `api-subscription-key`, private keys, or keystore passwords.
2. **Safe Credential Handling**:
   - Firebase web config values (`apiKey`, `appId`, etc.) in `index-Dr2gp-_-.js` are public client identifiers domain-restricted in Google Cloud.
   - Keystore passwords and private signing keys are confined to `android/keystore.properties` (properly ignored in `android/.gitignore`).
3. **Environment & Origin Validation**:
   - Release bundle hardcodes `VITE_API_URL: "https://manaintibojanam-backend.onrender.com"`.
   - No references to `localhost`, `10.0.2.2`, or demo mocking in release configuration.
4. **Android Permissions**:
   - Standard food delivery & voice permissions: `INTERNET`, `ACCESS_FINE_LOCATION`, `RECORD_AUDIO`, `POST_NOTIFICATIONS`. No hazardous or excessive permissions.

---

## 9. Audit Totals Summary

- **Modified tracked mobile-app files:** 265
- **Staged mobile-app files:** 0
- **Untracked mobile-app files / folders:** 37
- **Relevant ignored build artifacts:** 2 (`app-release.apk`, `app-debug.apk`)
- **Local commits not on `origin/main`:** 7 (`43be015`, `2ea8ba9`, `4143584`, `da0e5a0`, `08c41ca`, `ca0e060`, `51e72c0`)
- **Changes proven present in the inspected APK:** 100% of current local source modifications
- **Changes proven absent from the inspected APK:** 0
- **Changes with unknown APK inclusion:** 0
- **Changes proven released / installed on device:** Verified active on Nokia T20 (`4000TA13921A1402579`)
- **Changes with unknown release status:** Realme phone installation status is `PENDING` (unattached)
- **Security findings requiring attention:** 0 critical leaks; `.env.production` should be evaluated for `.gitignore` inclusion.

---

## 10. Prioritized Next Steps (Upon User Authorization)

1. **Working Tree Safety Preservation**: DO NOT execute `git clean` or `git reset`. The 265 uncommitted files contain the production recovery and design system.
2. **Atomic Git Staging & Commit**:
   - Commit 1: Production config, Firebase `bhojanos-prod`, and environment fixes.
   - Commit 2: Sarvam Saaras v4 STT voice upgrade (`voiceSttGatewayClient`, `audioBlobRecorder`, `buildDynamicMenuKeyterms`).
   - Commit 3: OrderBhojan BDS tokens, theme service, and presentation component updates.
3. **Branch Reconciliation & Push**:
   - Push commits to an authoritative remote branch (e.g., `review/phaseb-realtime-tracking` or feature branch) and raise PR to `main`.
4. **Device Testing on Realme**:
   - When Realme device is connected, install `app-release.apk` via `adb install -r` and run identical UI/voice smoke verification.
