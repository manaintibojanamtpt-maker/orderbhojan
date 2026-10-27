# OrderBhojan — Customer UI/UX Overhaul Gap Analysis & Screen Matrix

**Date**: October 25, 2026  
**Repository Root**: `F:\Manaintibojanam_final2\orderbhojan`  
**Branch**: `review/phaseb-realtime-tracking`  
**Verified APK**: `9D9F96C413A9D70BB539FE70F6A03FBFD454EAB50F9C26AEC46B04B22D74D751`  
**Reference Benchmark**: Ownly (Food-first hierarchy, squircle cards, category rail, subtle warm surfaces)  

---

## 1. Executive Summary

This document establishes the definitive classification and gap analysis of every primary customer-facing screen in the OrderBhojan mobile app. It reconciles historical reports with the actual rendered components in the active React/Capacitor bundle on the physical Nokia T20 tablet (`4000TA13921A1402579`).

### Screen Classification Taxonomy
- **Class A**: Clean, native-feeling, production-ready screens strictly complying with the Warm Minimal design system (`--ob-bg: #0E0C0A`, `--ob-surface: #171310`, `--ob-brand: #F27A1A`, `--ob-text-primary: #FFF8F0`).
- **Class B**: Functionally solid screens with minor remaining polish opportunities.
- **Class C**: Screens requiring layout or structural adjustments.
- **Class D**: Broken or legacy screens.

---

## 2. Comprehensive Screen Audit & Gap Analysis

| Route / Screen | Rendered Components | Historical Deviation / Defect | Remediation Implemented | Current Classification |
|---|---|---|---|:---:|
| **Home (`/`)** | `HomeExperiencePage.tsx`<br>`OrderBhojanHomeCategories.tsx`<br>`HomeDishPoster.tsx`<br>`TrendingFoodsSection.tsx`<br>`OrderBhojanHomeHero.tsx`<br>`LocationChip.tsx` | 1. Specialties cards rendered unstyled text due to missing `.bds-dish-poster` CSS.<br>2. Category rail was hidden when Firestore returned empty array.<br>3. Oversized voice card took 240px; food hero obscured by black scrim. | 1. Rewrote `HomeDishPoster` with Tailwind squircle cards (`bg-[#171310]`, rounded-2xl, aspect 4/3 image, specialty tag, bottom-right floating quick-add `+` button).<br>2. Added `DEFAULT_HOME_CATEGORIES` ("WHAT'S ON YOUR MIND?") with high-res culinary icons.<br>3. Removed voice card; replaced heavy scrim with feather border. | **Class A** |
| **Search (`/search`)** | `OrderBhojanSearchExperience.tsx`<br>`OrderBhojanSearchBar.tsx`<br>`OrderBhojanSearchBrowsePanel.tsx` | Headings rendered at 40-48px hero size; jet-black `#030303` zebra bands; redundant nested back button. | 1. Downsized `SectionHeader` to 16px section titles.<br>2. Swapped `#030303` to `--ob-bg: #0E0C0A`.<br>3. Removed redundant in-page back button.<br>4. Replaced heavy Section blocks with compact `py-2.5` sections. | **Class A** |
| **Restaurant / Menu (`/restaurant/:id`)** | `OrderBhojanFoodExperience.tsx`<br>`OrderBhojanFoodCardItem.tsx`<br>`MenuItemCardView.tsx` | Giant 44px neon orange ADD button covered 50% of food photos; sticky header collision; hardcoded `#13100D` card palette. | 1. Refined ADD button and quantity selector to sleek 32px (`h-8`) satin controls.<br>2. Decoupled sticky headers.<br>3. Updated card background to `bg-[var(--ob-surface,#171310)]`. | **Class A** |
| **Cart (`/cart`)** | `OrderBhojanCartExperience.tsx`<br>`CartPageView.tsx`<br>`CartSummaryView.tsx` | White-mode bleed on bottom sheets; oversized card margins; floating cart stayed visible on child screens. | 1. BottomSheet rewritten with `#1C1712` warm surface.<br>2. Cart card radii unified to `rounded-2xl`.<br>3. Floating cart suppressed on Cart/Checkout routes. | **Class A** |
| **Checkout (`/checkout`)** | `CheckoutPageView.tsx`<br>`CheckoutContactView.tsx`<br>`CheckoutBillSummaryView.tsx`<br>`CheckoutDeliveryAddressView.tsx` | Fixed CTA bar collided with open keyboard; telephone input lacked numeric keyboard attribute; address form background washed out. | 1. Set `android:windowSoftInputMode="adjustResize"` on MainActivity.<br>2. Added `inputMode="numeric"`, `pattern="[0-9]*"`, `type="tel"`, and `autoComplete="tel"` on telephone input.<br>3. Dynamic CSS adjusts sticky bar when keyboard is active. | **Class A** |
| **Orders (`/orders`)** | `OrderBhojanOrdersExperience.tsx`<br>`OrdersListPageView.tsx`<br>`OrderSummaryCardView.tsx` | Past orders list cluttered; floating cart overlapped past orders; typography overly heavy. | 1. Floating cart hidden on `/orders`.<br>2. Refined typography to balanced semibold.<br>3. Card surfaces aligned to `#171310`. | **Class A** |
| **Tracking (`/orders/:id/track`)** | `TrackingPageView.tsx`<br>`TrackingHeroView.tsx`<br>`CourierTrackingTimelineView.tsx` | Status bar clock overlapped header; timeline connector contrast issues. | 1. Added safe-area padding top dynamically.<br>2. Unified canvas to `#0E0C0A` and cards to `#171310`.<br>3. Calibrated timeline contrast to `#FFF8F0` / `#A89B8C`. | **Class A** |
| **Profile (`/profile`)** | `OrderBhojanProfilePage.tsx`<br>`ProfileMemberView.tsx`<br>`SettingsPreferencesView.tsx` | Oversized 44px hero title dominating entire screen; uneven card padding. | 1. Replaced with semantic compact `h3` (`text-base font-bold`).<br>2. Standardized padding to `p-4` with `#171310` surface.<br>3. Applied inset-safe header. | **Class A** |

---

## 3. Typography & Hierarchy System

| Role | Previous Defect State | Modernized Specification | CSS / Tailwind Implementation |
|---|---|---|---|
| **Hero Headers** | 48–60px text-4xl/5xl across compact forms | 24–28px, reserved for onboarding | `text-2xl sm:text-3xl font-extrabold tracking-tight` |
| **Section Headers** | 36–48px hero default in `SectionHeader.tsx` | 16–18px compact section titles | `text-base sm:text-lg font-bold leading-snug text-[#FFF8F0]` |
| **Card / Group Titles** | 18–22px font-black | 14–16px structured semibold | `text-sm sm:text-base font-semibold text-[#FFF8F0]` |
| **Body & Metadata** | 14px inconsistent opacity | 13–14px calibrated secondary text | `text-xs sm:text-sm text-[#A89B8C]` |
| **Labels & Badges** | Heavy orange backgrounds | Subtle satin hairline badges | `text-xs font-medium tracking-wide uppercase text-[#F27A1A]` |
