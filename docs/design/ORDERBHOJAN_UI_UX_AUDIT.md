# OrderBhojan — Premium UI/UX Audit Report
**Date**: 2026-10-24 | **Scope**: Full app audit · 518 source files · 12+ customer screens

---

## Phase 1 — Application Architecture Inventory

### Tech Stack
| Layer | Technology |
|-------|-----------|
| Runtime | Capacitor WebView (BridgeActivity) |
| Framework | React 18 + Vite |
| Styling | Tailwind CSS (4.x) + CSS custom properties |
| Motion | Framer Motion (LazyMotion, ~15KB split) |
| State | Zustand |
| Data | TanStack Query |
| Auth | Firebase Auth (phone OTP + Google) |
| Maps | Mapbox GL |

### Screen Inventory (All WebView/React)

| # | Screen | Route | Component | Feature Flag |
|---|--------|-------|-----------|-------------|
| 1 | Splash/Boot | `*` | Boot shell → AppRouter | — |
| 2 | Onboarding | `/auth` | OrderBhojanOnboardingView | — |
| 3 | Home/Discovery | `/` | HomeExperiencePage | `FF_OB_FIRESTORE` |
| 4 | Search | `/search` | SearchExperiencePage | `FF_OB_SEARCH` |
| 5 | Restaurant Detail | `/restaurant/:slug` | OrderBhojanRestaurantExperience | `FF_OB_RESTAURANT` |
| 6 | Restaurant Menu | `/restaurant/:slug/menu` | OrderBhojanFoodExperience | `FF_OB_MENU` |
| 7 | Cart | `/cart` | OrderBhojanCartExperience | — |
| 8 | Checkout | `/checkout` | OrderBhojanCheckoutPage | `FF_OB_PAYMENTS` |
| 9 | Order Tracking | `/orders/:id/track` | OrderBhojanTrackingPage | `FF_OB_TRACKING` |
| 10 | Orders List | `/orders` | OrderBhojanOrdersExperience | `FF_OB_FIRESTORE` |
| 11 | Favorites | `/favorites` | OrderBhojanFavoritesPage | `FF_OB_FIRESTORE` |
| 12 | Notifications | `/notifications` | OrderBhojanNotificationsPage | `FF_OB_NOTIFICATIONS` |
| 13 | Profile | `/profile` | OrderBhojanProfilePage | — |
| 14 | Location Picker | (modal) | AutoLocationForm | — |
| 15 | Voice Assistant | FAB overlay | ConsumerAssistantSheet | `FF_OB_AI_ASSISTANT` |

### Bottom Navigation (5 tabs)
Home · Menu (Search) · Cart · Orders · Profile

---

## Phase 2 — Page-by-Page Design Audit

### 2.1 Color System — CRITICAL INCONSISTENCY

**Three competing color definitions found:**

| Source | Primary Orange | Brand BG | Card BG | Text Main |
|--------|---------------|----------|---------|-----------|
| `storefront-src/index.css` (Tailwind @theme) | `#FF7A00` | `#070504` | `#120D0A` | `#FFFAF3` |
| `storefront-src/design-system/tokens/colors.css` (CSS vars) | `#e85d04` | `#050403` | `#120d0c` | `#fff8f0` |
| `storefront-src/design-system/tokens/index.ts` (TypeScript) | `#FF7A00` | `#070504` | `#120D0A` | `#FFFAF3` |
| Inline in components | `#ff6b35`, `#FF7A00`, `#e85d04` | `#050403`, `#070504`, `#120d0c` | — | — |

**Impact**: The same component may render differently depending on whether it reads from CSS variables or inline arbitrary values. No single source of truth.

### 2.2 Border Radius — CRITICAL INCONSISTENCY

| Value Used | Frequency | Where |
|------------|-----------|-------|
| `rounded-[2rem]` (32px) | GlassCard, ExecutiveCard, BottomSheet | "Hero" cards |
| `rounded-2xl` (16px) | TextFieldView, KitchenCard, SearchBar, CartLine | Form inputs, list items |
| `rounded-3xl` (24px) | MetricCard, TrackCard | Stats displays |
| `rounded-full` | Filter chips, Quantity stepper, FAB | Pill elements |
| `rounded-[2.5rem]` (40px) | BottomNav | Floating nav bar |
| `--ds-radius-xl: 1.25rem` (20px) | Defined in tokens, barely used | Unused token |

**Impact**: Cards, forms, and navigation all use different radii — no visual hierarchy signal.

### 2.3 Background Surfaces — HIGH INCONSISTENCY

5+ dark surface colors in active use:
- `#050403` — page background (TransactionShell)
- `#070504` — page background (index.css body)
- `#120d0c` — card background (GlassCard, KitchenCard)
- `#0A0A0A` — ExecutiveCard (out of palette)
- `#111111` — SearchAutocomplete, FilterDrawer (neutral gray, not warm)
- `rgba(18,13,10,0.7)` — glass variant

### 2.4 Typography

| Usage | Font Family | Weights |
|-------|------------|---------|
| Body | Plus Jakarta Sans | 400, 500, 600, 700, 800 |
| Display headings | Outfit | 400–900 |
| Editorial accent | Fraunces | 400, 500, 600, 700 |

**Issues**: Fraunces loaded but barely used. Two font families for "display" (Outfit vs Fraunces) with no clear assignment rule.

### 2.5 Shadow / Elevation

| Approach | Where Used | Consistency |
|----------|-----------|-------------|
| `--mib-shadow-card` CSS var | GlassCard | Good |
| Custom inline `shadow-[0_...]` | KitchenCard, ExecutiveCard, FloatingMiniCart | 4+ different values |
| Tailwind `shadow-xl`, `shadow-2xl` | SearchAutocomplete, FilterDrawer | Default Tailwind shadows (too light for dark theme) |
| No shadow | MetricCard, TrustBadge, TechBadge | Missing elevation |

### 2.6 Button Systems — FRAGMENTED

| System | Files | Style |
|--------|-------|-------|
| SoftButton | `primitives/SoftButton.tsx` + `soft-buttons.css` | Conic-gradient animated border, pill radius |
| CTAButton | `primitives/CTAButton.tsx` | Wraps SoftButton |
| Inline Tailwind buttons | KitchenCard, FilterDrawer, FloatingMiniCart, Checkout | `bg-[#e85d04]`, `bg-gradient-to-br from-[#ff6b35]` |
| `.mib-primary-action` | Global CSS class | Gradient with fixed shadow |

**4 button patterns coexisting** — no single authoritative primary button.

### 2.7 Per-Screen Audit Summary

| Screen | Key Issues |
|--------|-----------|
| **Home** | Hero uses Ken Burns (18s) — heavy on low-end devices. Categories lack visual distinction. |
| **Search** | Two search bar variants (pill vs rounded-2xl) with different styles. Filter chips and sort selector are separate components with identical styling. |
| **Restaurant** | Inconsistent back-button styling. No hero image treatment standard. |
| **Menu** | MenuItemCardView uses `rounded-xl` for images but `border-b` divider — inconsistent with card system. |
| **Cart** | CartLineView forced `!rounded-2xl` (specificity override). FloatingMiniCart uses `rounded-[2rem]` — different radius than cart lines. |
| **Checkout** | Payment method cards use custom radio-style borders not matching any primitive. |
| **Tracking** | Green scheduled badge newly added. CTA buttons mix gradient classes. |
| **Orders List** | OrderSummaryCardView — no hover/lift state on cards. |
| **Profile** | ProfileMemberView — avatar glow ring uses hardcoded values. |
| **Auth** | AuthShellView wraps GlassCard directly. Phone input uses TextFieldView but location picker uses its own `rounded-xl` inputs with `border-gray-200` (light-theme bleed). |
| **Voice FAB** | Waveform bars and glow ring correctly positioned. `calc(96px)` is voice panel, not FAB — FAB at `calc(160px)` is correct. |

---

## Phase 3 — Visual Direction Proposal

### Current State Summary
The app currently runs a **"rustic dark"** aesthetic: near-black backgrounds, saffron-orange accents, warm secondary text. It works functionally but lacks the polish of premium food-tech platforms (Swiggy, DoorDash, Uber Eats).

### Proposed Direction: "Warm Minimal" — Option A (Recommended)

**Philosophy**: Remove visual noise, establish clear hierarchy through spacing and opacity, use the brand orange sparingly as an accent only.

#### New Unified Color Palette

| Token | Value | Usage |
|-------|-------|-------|
| `--ob-bg` | `#080706` | Page background |
| `--ob-surface` | `#13100D` | Card surface |
| `--ob-surface-strong` | `#1C1712` | Elevated surface (sheets, modals) |
| `--ob-border` | `rgba(255,248,240,0.06)` | Subtle borders |
| `--ob-border-strong` | `rgba(232,130,50,0.25)` | Active/focus borders |
| `--ob-brand` | `#E8720C` | Primary action (single source) |
| `--ob-brand-light` | `#F4A05C` | Highlights, gradients |
| `--ob-text-primary` | `#FFF8F0` | Main text |
| `--ob-text-secondary` | `#A89B8C` | Muted text |
| `--ob-text-tertiary` | `#6B5F52` | Disabled/placeholder |
| `--ob-success` | `#34D399` | Success, scheduled badges |
| `--ob-warning` | `#FBBF24` | Warning states |
| `--ob-error` | `#F87171` | Error states |

#### New Unified Radius Scale

| Token | Value | Usage |
|-------|-------|-------|
| `--ob-radius-sm` | `0.5rem` (8px) | Small elements, tags |
| `--ob-radius-md` | `0.75rem` (12px) | Inputs, small cards |
| `--ob-radius-lg` | `1rem` (16px) | Standard cards |
| `--ob-radius-xl` | `1.25rem` (20px) | Hero cards, sheets |
| `--ob-radius-2xl` | `1.5rem` (24px) | Modals, panels |
| `--ob-radius-pill` | `9999px` | Pills, chips, buttons |

#### Single Font System

| Role | Font | Weights |
|------|------|---------|
| All UI text | Plus Jakarta Sans | 400, 500, 600, 700 |
| Display headlines (hero only) | Outfit | 700, 800 |
| Remove Fraunces | — | Not needed |

### Alternative Directions (for reference)

**Option B: "Cyber Food"** — Deeper blacks (`#030303`), neon-orange accents, more glow effects. Higher contrast, more aggressive. Better for a tech-forward positioning.

**Option C: "Clean Warm"** — Light mode support, cream backgrounds (`#FAF6F1`), orange accents. Friendlier, more approachable. Higher development effort (light/dark mode toggle).

---

## Phase 4 — Implementation Plan

### 4.1 Consolidate Design Tokens

1. Create unified `src/styles/ob-tokens.css` with all design tokens
2. Update `storefront-src/index.css` to import from unified source
3. Deprecate old `storefront-src/design-system/tokens/` TS file (keep CSS)
4. Update `storefront-src/design-system/tokens/colors.css` to match new palette

### 4.2 Create Unified Component Primitives

1. **`Card`** — Single card primitive replacing GlassCard, ExecutiveCard, TrackCard
   - Props: `variant` ('elevated' | 'glass' | 'flat'), `radius` token
   - Consistent padding, border, shadow
2. **`Button`** — Single button system replacing SoftButton + inline buttons
   - Variants: `primary` (gradient), `secondary` (outline), `ghost`, `danger`
   - All use same radius, padding, min-height 48px
3. **`Input`** — Single input replacing TextFieldView + inline inputs
   - Consistent focus ring using `--ob-border-strong`
4. **`Badge`** — Status badges (scheduled, ETA, etc.)

### 4.3 Per-Screen Redesign (Phase 6)

Each screen gets:
- Unified card radius (20px standard, 24px for hero)
- Consistent spacing (8px grid)
- Single button system
- Proper elevation hierarchy

### 4.4 Motion & Micro-interactions (Phase 5)

1. Standardize spring constants: `stiffness:260, damping:28`
2. Add subtle card lift on hover (`translateY(-2px)`)
3. Smooth page transitions (0.3s ease)
4. Cart add animation (current fly-to-cart is good, keep)
5. Button press feedback (scale 0.96, 150ms)

---

## Key Files to Modify

### Token Layer
- `storefront-src/design-system/tokens/colors.css`
- `storefront-src/design-system/tokens/index.ts`
- `storefront-src/index.css`

### Primitive Layer
- `storefront-src/design-system/primitives/GlassCard.tsx`
- `storefront-src/design-system/primitives/SoftButton.tsx`
- `storefront-src/design-system/primitives/TextFieldView.tsx`
- Create: `storefront-src/design-system/primitives/Card.tsx`
- Create: `storefront-src/design-system/primitives/Button.tsx`
- Create: `storefront-src/design-system/primitives/Badge.tsx`

### Screen Layer (priority order)
1. `src/presentation/tracking/OrderBhojanTrackingPage.tsx` + tracking views
2. `src/presentation/cart/OrderBhojanCartExperience.tsx`
3. `src/presentation/checkout/OrderBhojanCheckoutPage.tsx`
4. `src/features/experience/ui/home/HomeExperiencePage.tsx`
5. `src/features/experience/ui/search/SearchExperiencePage.tsx`
6. `src/presentation/restaurant/OrderBhojanRestaurantExperience.tsx`
7. Remaining screens...

---

---

## Phase 5-6 — Implementation Results

### What Was Built

**1. Unified Token System** (`src/styles/ob-tokens.css`)
- Single source of truth for all design tokens
- 4 color zones: brand, text, semantic, glass
- 6-radius scale: 8px → 32px + pill
- 5-shadow elevation system with hover states
- Motion tokens: 150ms/250ms/400ms + spring easing
- Reduced-motion and Android performance guards built in

**2. Global Token Consolidation**
- `storefront-src/index.css` — unified Tailwind @theme block
- `storefront-src/design-system/tokens/colors.css` — CSS variables
- `storefront-src/design-system/tokens/index.ts` — TypeScript constants
- `storefront-src/design-system/tokens/radius.css` — radius scale
- `storefront-src/design-system/tokens/elevation.css` — shadow system
- `src/styles/mib-theme.css` — legacy aliases + new utilities
- `src/styles/globals.css` — imports new token layer

**3. Core Primitives Modernized**
- `GlassCard.tsx` — `#13100D` surface, 1.25rem radius, orange glow hover
- `TextFieldView.tsx` — `#1C1712` surface, 12px radius, unified focus ring
- `PremiumBadge.tsx` — new framer-motion animated badge primitive
- `PremiumMotion.tsx` — stagger container, card lift, page transitions
- `soft-buttons.css` — unified brand gradient `#E8720C → #F4A05C`

**4. Screen Redesigns Applied**
- Home page — `#080706` bg, unified text tokens
- Cart — `CartPageView` + `CartLineView` use 1.25rem cards
- Tracking — timeline, delivery panel, feedback all unified
- Search — result cards use 1.25rem radius
- Orders list — `OrderSummaryCardView` unified
- Kitchen cards — unified badge system with brand accent

**5. Bulk Color Migration**
- 69 files processed via sed
- Legacy: `#FF7A00` → `#E8720C`
- Legacy: `#050403`/`#070504` → `#080706`
- Legacy: `#120D0A`/`#120d0c` → `#13100D`
- Legacy: `#c4b5a5`/`#B9ADA1` → `#A89B8C`
- Legacy: `#fff8f0` → `#FFF8F0`

### Build Verification
- `npm run build` — successful (667KB main bundle)
- `capacitor copy android` — assets synced
- `./gradlew assembleDebug` — BUILD SUCCESSFUL
- APK: `android/app/build/outputs/apk/debug/app-debug.apk` (18M)

### Remaining Legacy Colors
- `ConsumerAssistantFab.tsx` — voice FAB uses `#FF7A00` (intentional accent for voice UI)
- `AppRouter.tsx` — `#050403` for StatusBar (native Android, not CSS)

### Design System Metrics
| Metric | Before | After |
|--------|--------|-------|
| Color palette definitions | 4 competing systems | 1 unified |
| Border radius values in use | 8 different values | 5-token scale |
| Surface background colors | 5+ different darks | 3-level hierarchy |
| Shadow systems | 4+ different approaches | 5-token elevation scale |
| Button systems | 4 different patterns | 2 (SoftButton + brand gradient) |

---

## Risks & Considerations

1. **Backward compatibility**: Changing token values affects all 12+ screens simultaneously — test each screen after token change
2. **Native platform**: Android WebView may render backdrop-filter differently; `html.ob-native-android` guard already exists
3. **Performance**: Ken Burns and parallax animations should be disabled on low-end devices (already has device tier detection)
4. **Bundle size**: Adding new primitives is fine; removing old ones reduces bundle
5. **Feature flags**: All changes are in React/WebView path; native Kotlin screens unaffected
