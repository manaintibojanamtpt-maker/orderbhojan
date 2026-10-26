# ORDERBHOJAN — UI/UX OVERHAUL, FLUTTER MIGRATION AUDIT & SAFE GIT RECONCILIATION

**Date:** October 27, 2026, 01:50 IST  
**Repository:** `F:\Manaintibojanam_final2\orderbhojan`  
**Current Branch:** `review/phaseb-realtime-tracking`  
**Current HEAD:** `51e72c0` (*fix(android): keep domStorage enabled to prevent localStorage crash*)  
**Verified Merge-Base with `origin/main` (`02bfe27`):** `79353ab`  
**Target Package:** `com.bhojanos.customer`  
**Inspected Release APK:** `android/app/build/outputs/apk/release/app-release.apk` (13.82 MB, SHA-256: `D4D79CC70BD78E2C1E02035D2E9FE4443534297343434C551FBBFBC61F53F475`)  
**Audit Purpose:** Comprehensive forensic audit of UI/UX overhaul, Flutter migration reality, uncommitted Git working-tree changes, and safe reconciliation planning.  

---

## 1. Executive Summary

This forensic audit resolves the relationship between the OrderBhojan Customer App codebase, its reported "Flutter migration", the signed Android release APK, and the Git working tree.

### Core Discoveries:
1. **Flutter Migration Reality (Possibility A & D)**:
   - **No Dart or Flutter files exist anywhere** in `orderbhojan` or `manaintibojanam-backend`.
   - `pubspec.yaml`, `lib/main.dart`, `io.flutter` Gradle plugins, and `libflutter.so` are **completely absent**.
   - The application architecture is confirmed as **React 19 + TypeScript + Vite + Capacitor 8.5.3 + Jetpack Compose Activity overlays**.
   - "Flutter migration" in past directives was a design goal: transforming the webview UX into a high-performance, native-feeling mobile experience with 60fps animations, warm culinary dark theme, bottom sheets, and micro-interactions.
2. **UI/UX Overhaul Presence in the Release APK**:
   - The UI/UX overhaul **is already compiled and packaged inside the current release APK** (`app-release.apk`, built at `2026-10-26 23:53:31 IST`).
   - Forensic byte matching confirms all 39 compiled assets in `dist/assets` (built at `23:51:11`) match the packaged assets in `assets/public/assets/` within the APK.
   - The Warm Charcoal culinary palette (`#0E0C0A`, `#171310`, `#F27A1A`, `#FFF9F2`), the Sarvam Saaras v4 voice assistant, and the dynamic carousel are verified running live on the physical **Nokia T20 tablet** (`4000TA13921A1402579`).
3. **The Git Discrepancy & Preservation Warning**:
   - The working tree is **diverged from Git history**.
   - There are **265 modified tracked files** and **37 untracked files/folders** that are **uncommitted**.
   - There are **7 local commits ahead of `origin/main`** (and 9 commits ahead of `origin/review/phaseb-realtime-tracking`).
   - **CRITICAL**: A `git reset --hard` or `git clean -fd` would destroy the P0 production database recovery, the Sarvam Saaras v4 STT integration, and the Warm Charcoal design tokens.

---

## 2. Actual Technology Stack

| Component | Verified Technology | Evidence Location | Confidence |
|---|---|---|---|
| **Core Architecture** | Hybrid Native via Capacitor Android 8.5.3 | `package.json#L72,L75`, `android/` | Verified Fact |
| **Web Runtime** | React 19.0.0 & React DOM 19.0.0 | `package.json#L92-L93` | Verified Fact |
| **Language** | TypeScript 5.8.2 | `package.json#L118` | Verified Fact |
| **Build Tooling** | Vite 6.4.3 & Android Gradle 8.14.3 | `package.json#L120`, `android/build.gradle` | Verified Fact |
| **Native Overlay** | Android Jetpack Compose (`2024.02.00`) for `TrackActivity` | `android/app/build.gradle#L100-L107` | Verified Fact |
| **Flutter Runtime** | **NONE** (`libflutter.so`, `pubspec.yaml`, `Dart` = Absent) | Entire workspace & APK scan | Verified Fact |
| **Routing** | React Router DOM 7.18.4 (`react-router-dom`) | `src/app/routes/AppRouter.tsx` | Verified Fact |
| **State Management** | Zustand 5.0.8 & TanStack React Query 5.90.2 | `package.json#L85,L99` | Verified Fact |
| **Design Tokens** | BDS (Bhojan Design System) & OrderBhojan Warm Minimal | `src/styles/ob-tokens.css`, `src/styles/bds.css` | Verified Fact |
| **Animation / Motion** | Framer Motion 12.42.2 (`framer-motion`) | `package.json#L89` | Verified Fact |
| **Voice / STT** | Sarvam Saaras v4 via Backend Gateway (`/api/voice/transcribe`) | `voiceSttGatewayClient.ts` | Verified Fact |
| **Backend Integration** | REST API (`https://manaintibojanam-backend.onrender.com`) | `src/config/environment.ts#L36` | Verified Fact |
| **Authentication** | Firebase Auth 12.11.0 / `@capacitor-firebase/authentication` (`bhojanos-prod`) | `capacitor.config.ts#L47-L53` | Verified Fact |

---

## 3. UI/UX Overhaul: Screen-by-Screen Implementation Audit

| Screen / Feature | Current Implementation Path | UI/UX Overhaul Changes | Git State | APK Inclusion | Remaining Gaps |
|---|---|---|:---:|:---:|---|
| **Home Discovery** | `src/presentation/discovery/` & `src/features/experience/ui/home/` | Redesigned Warm Charcoal hero carousel, circular category rails, "Popular Near You" cards, dynamic location bar. | Modified (Uncommitted) | **PRESENT — VERIFIED** | None. Directly verified on Nokia T20 physical tablet. |
| **Search & Discovery** | `src/presentation/search/` | Pill search bar, autocomplete suggestions, sticky dietary filter chips, culinary result cards. | Modified (Uncommitted) | **PRESENT — VERIFIED** | Full search result paging telemetry verification. |
| **Restaurant Storefront** | `src/presentation/restaurant/` | Hero banner with kitchen badges, operating hours, delivery fee chips, gallery, and menu tabs. | Modified (Uncommitted) | **PRESENT — VERIFIED** | Verify subscription tab with live backend data. |
| **Food & Customization** | `src/presentation/food/` | Dish poster cards with veg/non-veg indicators, bottom sheet item customization with addon steppers. | Modified (Uncommitted) | **PRESENT — VERIFIED** | Edge-to-edge keyboard padding on smaller phone screens. |
| **Cart & Floating Bar** | `src/presentation/cart/` & `OrderBhojanFloatingCart.tsx` | Slide-up floating cart bar with badge counter, contextual recommendations, price summary. | Modified (Uncommitted) | **PRESENT — VERIFIED** | Verified on device: Badge 1 item preserved. |
| **Checkout Flow** | `src/presentation/checkout/` | Server-authoritative bill breakdown, address selector, UPI payment deep-linking, order trust panel. | Modified (Uncommitted) | **PRESENT — VERIFIED** | Production live payment confirmation probe. |
| **Voice Assistant** | `src/features/assistant/` | Floating AI button, bottom sheet modal, Sarvam Saaras v4 multilingual detection (TE/HI/EN), equalizer waves. | Untracked + Modified | **PRESENT — VERIFIED** | Verified on device: Audio capture & transcript streaming. |
| **Order History** | `src/presentation/orders/` | Order cards with live status badges, reorder CTA, items summary, digital invoice download. | Modified (Uncommitted) | **PRESENT — VERIFIED** | Historical pagination for accounts with >50 orders. |
| **Live Order Tracking** | `src/presentation/tracking/` & `TrackActivity.kt` | Interactive courier progress timeline, delivery ETA card, optional native Jetpack Compose tracking activity. | Modified (Uncommitted) | **PRESENT — VERIFIED** | Live courier GPS coordinates integration. |
| **Profile & Settings** | `src/presentation/profile/` & `src/features/theme/` | Customer account details, address book manager, theme selector (system/dark/light) with native status bar sync. | Untracked + Modified | **PRESENT — VERIFIED** | Saved payment method card management. |
| **Auth & Onboarding** | `src/presentation/auth/` | Phone OTP authentication shell, Google native sign-in via Capacitor Firebase, guest browse return navigator. | Modified (Uncommitted) | **PRESENT — VERIFIED** | SMS auto-read verification via SMS Retriever API. |

---

## 4. Flutter Migration Forensic Investigation

### Search Methodology:
1. Recursive file scan across `F:\Manaintibojanam_final2\orderbhojan` for `.dart`, `pubspec.yaml`, `pubspec.lock`.
2. Workspace-level scan across `F:\Manaintibojanam_final2` for any sibling Flutter repositories.
3. APK inspection of native binaries in `lib/` within `app-release.apk`.
4. Git commit log and stash inspection for references to Flutter.

### Findings:
- Total Dart files found: **0**
- Total `pubspec.yaml` files found: **0**
- Flutter engine binaries (`libflutter.so`): **0** (Only `libdatastore_shared_counter.so` is packaged)
- Historical document [`ORDERBHOJAN_vs_NATIVE_CUSTOMER_RECONCILIATION.md`](file:///f:/Manaintibojanam_final2/ORDERBHOJAN_vs_NATIVE_CUSTOMER_RECONCILIATION.md) (August 2026) explains that an experiment called "Native Customer" was scaffolded in **Kotlin + Jetpack Compose** (`manaintibojanam-backend/android/customer/`), which had only discovery view models and 0 UI screens.

### Definitive Conclusion:
**Category A & D: Native-feeling redesign only. No substantive Flutter/Dart migration was ever started.**  
The directive was to give the React + Capacitor codebase the visual polish, fluidity, and responsiveness of a premier Flutter application without migrating away from React/Capacitor.

---

## 5. Complete Git Working-Tree Audit

### Current Status Metrics
- **Current Branch:** `review/phaseb-realtime-tracking`
- **HEAD Commit:** `51e72c0`
- **Merge Base with `origin/main` (`02bfe27`):** `79353ab`
- **Local Commits Ahead of `origin/main`:** 7 commits
- **Local Commits Ahead of `origin/review/phaseb-realtime-tracking` (`63c9953`):** 9 commits
- **Tracked Modified Files (Unstaged):** 265
- **Staged Files:** 0
- **Untracked Files / Folders:** 37
- **Git Stashes:** 1 (`stash@{0}: On main: local assistant UPI firebase changes before main reconciliation`)

### Unpushed Local Commits (Ahead of `origin/main`):
1. `43be015` - *fix(types): add deliveryType and scheduledFor to OrderTrackingResponse, add scheduledForLabel to TrackingHeroViewModel*
2. `2ea8ba9` - *fix(web): improve Capacitor detection and PWA cache cleanup for native runtime*
3. `4143584` - *fix(pwa): bump cacheId from v15 to v16 to force Service Worker cache invalidation*
4. `da0e5a0` - *fix(pwa): block stale Service Worker cache across APK installs*
5. `08c41ca` - *fix(android): disable WebView caching to prevent stale asset delivery*
6. `ca0e060` - *fix(pwa): guard version-check against null localStorage in Capacitor WebView*
7. `51e72c0` - *fix(android): keep domStorage enabled to prevent localStorage crash*

### Crucial Uncommitted Files Requiring Preservation:
| File Path | Git State | Subsystem | Criticality |
| :--- | :---: | :--- | :--- |
| `src/config/environment.ts` | Modified | Core Config | **P0:** Locks native runtime to Render backend & `bhojanos-prod`. |
| `src/config/clientConfig.ts` | Modified | Core Config | Injects public `bhojanos-prod` Firebase config. |
| `src/featureFlags/flags.ts` | Modified | Feature Flags | Enforces `FF_OB_FIRESTORE = true` in native production. |
| `android/app/google-services.json` | Modified | Native Android | Canonical `bhojanos-prod` configuration. |
| `capacitor.config.ts` | Modified | Native Android | Splash screen `#070504`, dark status bar, Razorpay navigation. |
| `android/app/src/main/AndroidManifest.xml` | Modified | Native Android | Microphone permission, speech recognition service queries. |
| `src/features/assistant/domain/buildDynamicMenuKeyterms.ts` | Untracked | Voice / STT | Saaras v4 dynamic dish keyterm biasing. |
| `src/features/assistant/infrastructure/audioBlobRecorder.ts` | Untracked | Voice / STT | 16kHz mono audio recorder for Android webview. |
| `src/features/assistant/infrastructure/voiceSttGatewayClient.ts` | Untracked | Voice / STT | Gateway client calling `/api/voice/transcribe`. |
| `src/features/assistant/hooks/useVoiceStt.ts` | Modified | Voice / STT | Hook connecting recorder, client, and UI. |
| `src/styles/ob-tokens.css` | Untracked | Design System | Unified Warm Charcoal & Warm Cream CSS custom properties. |
| `src/styles/bds.css` | Untracked | Design System | BDS typography, elevation, spacing, and radius tokens. |
| `src/features/theme/themeService.ts` | Untracked | Theme | Theme manager with Capacitor StatusBar sync. |
| `tests/voice-saaras-v4-gateway.test.ts` | Untracked | Tests | 8 passing tests for Saaras v4 gateway. |
| `src/presentation/**` (100+ files) | Modified | UI/UX Overhaul | All modern customer storefront, food, and cart views. |

---

## 6. APK Inspection & Verification

- **Artifact Path:** `android/app/build/outputs/apk/release/app-release.apk`
- **File Size:** `13,817,614` bytes (13.82 MB)
- **Last Modified Timestamp:** `2026-10-26 23:53:31 IST`
- **SHA-256 Checksum:** `D4D79CC70BD78E2C1E02035D2E9FE4443534297343434C551FBBFBC61F53F475`
- **Application ID:** `com.bhojanos.customer`
- **Version Name / Code:** `0.9.0` / `2`
- **Signing Scheme:** Verified Scheme v2 (`CN=OrderBhojan, OU=BhojanOS, O=BhojanOS, L=Bengaluru, ST=Karnataka, C=IN`)
- **Signer SHA-256 Digest:** `2d508953a04a3c70a3b9e25bcb73a32d0e95a012854428e41855287d367dfd5a`
- **Debuggable:** `false`
- **Provenance Link:** All 39 files in `dist/assets` match the exact 39 files in `assets/public/assets/` within the APK.

### Changes Included vs. Absent in Inspected Release APK:
- `PRESENT — VERIFIED`: Warm Charcoal UI tokens (`--ob-bg: #0E0C0A`, `--ob-surface: #171310`, `--ob-brand: #F27A1A`).
- `PRESENT — VERIFIED`: Sarvam Saaras v4 STT voice gateway integration (`/api/voice/transcribe`, dynamic keyterms).
- `PRESENT — VERIFIED`: Production Firebase `bhojanos-prod` configuration and Render backend lock.
- `PRESENT — VERIFIED`: Razorpay WebView checkout navigation rules.
- `PRESENT — VERIFIED`: Dark status bar and splash screen configuration.
- `PRESENT — VERIFIED`: Active live on physical Nokia T20 tablet.
- `ABSENT — VERIFIED`: Flutter engine (`libflutter.so`), Dart VM.
- `UNKNOWN`: Distribution to Google Play Store (Release APK is signed locally; internal testing track upload unverified).

---

## 7. Protection & Staging Classification

To prevent data loss or broken builds, the pending work is classified into 5 logical, non-destructive commits:

### Group 1: Production System & Environment Lock
- Files: `src/config/environment.ts`, `src/config/clientConfig.ts`, `src/featureFlags/flags.ts`, `android/app/google-services.json`, `capacitor.config.ts`, `android/app/src/main/AndroidManifest.xml`
- Purpose: Preserves the P0 fix locking native mobile runtime to live Render production and `bhojanos-prod`.

### Group 2: Sarvam Saaras v4 Multilingual Voice Upgrade
- Files: `src/features/assistant/domain/buildDynamicMenuKeyterms.ts`, `src/features/assistant/infrastructure/audioBlobRecorder.ts`, `src/features/assistant/infrastructure/voiceSttGatewayClient.ts`, `src/features/assistant/hooks/useVoiceStt.ts`, `src/features/assistant/ui/useAssistantConversation.ts`, `tests/voice-saaras-v4-gateway.test.ts`
- Purpose: Packages the Saaras v4 STT upgrade, domain keyterm biasing, and voice tests.

### Group 3: Design System, Tokens & Theme Service
- Files: `src/styles/ob-tokens.css`, `src/styles/bds.css`, `src/features/theme/themeService.ts`, `tests/theme-consistency.test.ts`, `tests/bds-theme.test.ts`
- Purpose: Establishes the authoritative single source of truth for the Warm Charcoal culinary design system.

### Group 4: Mobile Presentation UI/UX Overhaul
- Files: `src/presentation/**`, `src/features/experience/**`, `src/features/food/**`, `src/features/restaurant/**`, `src/features/location/**`, `src/features/tracking/**`
- Purpose: Commits the redesigned screens, cards, carousels, bottom sheets, and micro-interactions.

### Group 5: Storefront Marketing & Documentation
- Files: `storefront-src/**`, `docs/voice/**`, `docs/audits/**`, `docs/incident/**`
- Purpose: Tracks documentation and supplementary marketing landing assets.

---

## 8. Safe Integration Plan (Awaiting Authorization)

> [!IMPORTANT]
> The following steps are an ordered, non-destructive plan for future execution. No step will be executed during this audit.

### Step 1: Pre-Flight Safety Backup
- Create an external safety snapshot branch:
  ```bash
  git branch backup/orderbhojan-pre-reconcile-20261027
  ```
- This guarantees zero loss of the 7 local commits ahead of `main`.

### Step 2: Atomic Logical Staging
- Stage and commit Group 1 (Production Config):
  ```bash
  git add src/config/ src/featureFlags/ android/app/google-services.json capacitor.config.ts android/app/src/main/AndroidManifest.xml
  git commit -m "fix(prod): lock native Capacitor runtime to live Render origin and bhojanos-prod"
  ```
- Stage and commit Group 2 (Voice Upgrade):
  ```bash
  git add src/features/assistant/ tests/voice-saaras-v4-gateway.test.ts
  git commit -m "feat(voice): implement Sarvam Saaras v4 STT gateway, keyterms biasing, and audio recorder"
  ```
- Stage and commit Group 3 (Design Tokens & Theme):
  ```bash
  git add src/styles/ob-tokens.css src/styles/bds.css src/features/theme/ tests/bds-theme.test.ts tests/theme-consistency.test.ts
  git commit -m "feat(design): introduce OrderBhojan unified Warm Charcoal design tokens and theme service"
  ```
- Stage and commit Group 4 (UI/UX Overhaul):
  ```bash
  git add src/presentation/ src/features/ src/app/
  git commit -m "feat(ui): complete mobile UI/UX overhaul across discovery, menu, cart, checkout, and tracking"
  ```
- Stage and commit Group 5 (Documentation & Audits):
  ```bash
  git add docs/
  git commit -m "docs: add Saaras v4 acceptance reports and forensic audit logs"
  ```

### Step 3: Verification Test Suite
- Run automated validation:
  ```bash
  npm run typecheck
  npm run test:ai
  npm run test:bds
  node --import tsx --test tests/voice-saaras-v4-gateway.test.ts
  ```

### Step 4: Remote Reconciliation & Pull Request
- Push the reconciled feature branch to `origin`:
  ```bash
  git push origin review/phaseb-realtime-tracking
  ```
- Open PR into `origin/main` for formal code review.

---

## 9. Answers to Executive Summary Questions

### 1. Is the UI/UX overhaul already present in the APK?
**YES.** The inspected release APK (`app-release.apk`, SHA-256: `D4D79CC70BD78E2C1E02035D2E9FE4443534297343434C551FBBFBC61F53F475`) contains all 39 compiled web assets matching the latest local source files, including the Warm Charcoal design tokens, the redesigned discovery hero, and the Saaras v4 voice agent. This was visually and functionally confirmed on the physical Nokia T20 tablet.

### 2. Which parts of the overhaul remain only in local source?
**None in terms of compilation:** The APK contains the current source code.  
**All in terms of version control:** 265 modified files and 37 untracked files remain uncommitted in the Git working tree. They exist only in local working-tree files, not in Git history.

### 3. Is a real Flutter migration underway, partially implemented, complete, or not found?
**NOT FOUND (Possibility A & D).** No Flutter or Dart codebase exists. `pubspec.yaml`, `lib/main.dart`, and `libflutter.so` are completely absent. The project is 100% React 19 + Capacitor 8.5.3, with a "Flutter-style" UI/UX design direction.

### 4. Which files and commits are not pushed?
- **Commits:** 7 local commits ahead of `origin/main`: `43be015`, `2ea8ba9`, `4143584`, `da0e5a0`, `08c41ca`, `ca0e060`, `51e72c0`.
- **Files:** 265 modified tracked files + 37 untracked files (notably `src/config/environment.ts`, `src/features/assistant/infrastructure/voiceSttGatewayClient.ts`, `src/styles/ob-tokens.css`, `src/features/theme/themeService.ts`, etc.).

### 5. Could a clean checkout reproduce the current APK?
**NO.** If the working tree were cleanly checked out to `HEAD` (`51e72c0`), the build would lack the P0 production database recovery, the Sarvam Saaras v4 STT integration, and the Warm Charcoal tokens. A clean checkout would produce an obsolete, non-working artifact.

### 6. What must be preserved before any Git reconciliation?
- `src/config/environment.ts` & `src/config/clientConfig.ts` (P0 production backend lock).
- `src/featureFlags/flags.ts` (Enforces live Firestore).
- `src/features/assistant/**` & `tests/voice-saaras-v4-gateway.test.ts` (Saaras v4 STT implementation).
- `src/styles/ob-tokens.css`, `src/styles/bds.css`, and `src/features/theme/**` (Design tokens).
- `src/presentation/**` (All 100+ redesigned mobile UI components).
- Existing release APK artifact (`android/app/build/outputs/apk/release/app-release.apk`).
- Local git stash: `stash@{0}`.

### 7. What is the safest next step?
**Do not touch or clean the working tree.** Maintain this read-only boundary. When authorized by the user, execute the 5-step atomic logical staging plan outlined in Section 8 to commit the pending files into Git, run test suites, and push to an isolated remote review branch.
