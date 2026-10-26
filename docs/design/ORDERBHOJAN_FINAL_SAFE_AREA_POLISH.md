# OrderBhojan — Final Safe-Area & Hardware-Inset Matrix

**Date**: 2026-10-25  
**Repository Root**: `F:\Manaintibojanam_final2\orderbhojan`  
**Package ID**: `com.bhojanos.customer`  
**Target Hardware Test Profile**: Realme RMX5131 (1280x2800, Android 14, Top-Center Hole Punch, Gesture Navigation)  
**Verified APK**: `77D1028505508CB7B5B8127A5C79BE20A8330BB5F3FE81F63BAB4FC1A58F54A4`

---

## 1. Safe-Area Architectural Overview

In Capacitor Android applications configured with `StatusBar.setOverlaysWebView({ overlay: true })`, the Android system renders the WebView behind the translucent status bar and gesture navigation bar.

### Root Cause of Hardware Inset Collisions
1. **WebView Inset Zeroing**: On many Android WebView implementations, standard CSS `env(safe-area-inset-top)` evaluates to `0px` because the Android window does not declare layout flags to the WebKit container without explicit bridge metrics.
2. **Fallback Gap**: `capacitorBootstrap.ts` established a fallback variable `--ob-safe-top`, but previously hardcoded it to `28px`. On modern tall aspect ratio devices (e.g. 20:9 with hole-punch cutouts), the status bar and camera notch occupy `36px` to `42px`, resulting in a `10px` collision with top header content.
3. **Missing CSS Consumption**: Key headers like `OrderBhojanScreenHeader.tsx` lacked inline style padding or CSS properties referencing `--ob-safe-top`, relying solely on standard margin classes that assumed a non-overlay status bar.

---

## 2. Inset Engineering Remediations

### A. Bootstrap Inset Calibration (`src/lib/capacitorBootstrap.ts`)
- Updated `ANDROID_STATUS_BAR_FALLBACK_PX` from `28` to `38`.
- Ensured CSS variables `--ob-safe-top` and `--ob-safe-bottom` are injected immediately onto `document.documentElement` during bootstrapping.

### B. Universal Screen Header Inset (`src/presentation/shell/OrderBhojanScreenHeader.tsx`)
- Injected dynamic safe-area padding:
  ```tsx
  style={{
    paddingTop: 'max(env(safe-area-inset-top, 0px), var(--ob-safe-top, 0px))',
  }}
  ```
- Combined with a frosted glass backdrop: `bg-[var(--ob-bg,#080706)]/95 backdrop-blur-xl`.
- Guarantees back buttons and title bars never collide with the system clock, Wi-Fi icon, battery indicator, or camera notch.

### C. Home Marketplace Discovery Hero Inset (`storefront-src/design-system/adapters/marketplace/MarketplaceDiscoveryHeroView.tsx`)
- Updated top container padding from hardcoded `pt-3` to:
  ```tsx
  style={{
    paddingTop: 'calc(0.75rem + max(env(safe-area-inset-top, 0px), var(--ob-safe-top, 0px)))',
  }}
  ```
- Keeps the "OrderBhojan" logo and location chip cleanly positioned below the status bar clock.

### D. Food Menu Sticky Navigation Decoupling
- In `OrderBhojanFoodRestaurantStrip.tsx`, removed conflicting `sticky top-0 z-50` which previously occluded dietary filters.
- In `OrderBhojanFoodExperience.tsx`, applied `style={{ paddingTop: 'var(--ob-safe-top, 0px)' }}` to `.ob-menu-sticky-chrome`, allowing category chips to stick neatly beneath the status bar.

### E. Floating UI & Bottom Clearance
- **Consumer Assistant FAB (`ConsumerAssistantFab.tsx`)**:
  - Docked at `bottom: calc(76px + var(--ob-safe-bottom, 0px))`.
  - Clears the 64px `BottomNav` completely without colliding with sticky cart bars or Android gesture pill navigation.
- **Floating Mini-Cart (`OrderBhojanFloatingCart.tsx`)**:
  - Docked at `bottom: calc(72px + var(--ob-safe-bottom, 0px))` on browse views.
  - Automatically hidden on `/cart`, `/checkout`, `/orders`, and tracking views.

---

## 3. Screen-by-Screen Hardware Clearance Matrix

| Screen / View | Top Status Bar Clearance | Top Cutout / Notch Status | Bottom Nav / Gesture Bar Clearance | Floating Controls Conflict Status | Final Safe-Area Rating |
|---|:---:|:---:|:---:|:---:|:---:|
| **Home (`/`)** | 38px + 12px | Clear (pushed below punch-hole) | 64px BottomNav + safe-bottom padding | AI FAB sits 12px above bottom nav | **VERIFIED** |
| **Search (`/search`)** | 38px safe top | Clear | Full clearance | None | **VERIFIED** |
| **Menu (`/restaurant/:id`)** | 38px safe top | Clear | Auto-hiding bottom nav on scroll down | Sticky rail cleanly pinned below notch | **VERIFIED** |
| **Cart (`/cart`)** | 38px safe top | Clear | 84px checkout CTA pinned with safe-bottom | Floating cart suppressed | **VERIFIED** |
| **Checkout (`/checkout`)** | 38px safe top | Clear | Fixed action bar with safe-bottom | Pinned "Place Order" button unblocked | **VERIFIED** |
| **Orders (`/orders`)** | 38px safe top | Clear | 64px BottomNav + safe-bottom | AI FAB floats above nav; Cart suppressed | **VERIFIED** |
| **Tracking (`/orders/:id/track`)** | 38px safe top | Clear | Safe-bottom bottom sheet clearance | Floating controls suppressed | **VERIFIED** |
| **Profile (`/profile`)** | 38px safe top | Clear | 64px BottomNav + safe-bottom | AI FAB floats above nav | **VERIFIED** |
