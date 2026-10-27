# OrderBhojan — Premium UI/UX Design Specification

**Document Version**: 1.0.0  
**Status**: Active Specification  
**Design Philosophy**: *Warm Minimal Indian Culinary Aesthetic* — quiet, layered obsidian surfaces with restrained saffron/terracotta accents, compact typography hierarchy, rich food photography, and clear content clearance.

---

## 1. Core Principles

1. **Quiet, Layered Surfaces**: Never outline every container in bright orange or create zebra stripes of contrasting darks. Use warm obsidian (`#080706`) as base, subtly elevated surfaces (`#13100D`) for cards, and micro-borders (`rgba(255, 248, 240, 0.07)`).
2. **Restrained Brand Accents**: Saffron (`#E8720C`) is reserved for primary actions, active indicators, ratings, and crucial status callouts. Secondary accent (`#F4A05C`) is used for warm text/badges.
3. **Mobile-First Content Hierarchy**: Section headers must never shout at hero scale. Category titles in menus, search chips, and settings cards belong at `text-base` (16px) to `text-lg` (18px) font-bold with compact margins (`mb-2` to `mb-3`), leaving vertical real estate for food items.
4. **Uncluttered Chrome & Non-Compete Floating Controls**: Floating AI assistant orb and bottom navigation must maintain harmonious elevation and z-indexes without occluding critical CTAs, order history items, or search results.
5. **Safe-Area Awareness & Generous Bottom Clearance**: Dynamic viewport insets (`env(safe-area-inset-top)`, `env(safe-area-inset-bottom)`) ensure that notches, status bars, and navigation pills never collide with top headers or bottom content.

---

## 2. Token System (Single Source of Truth)

All active components read from the `--ob-*` tokens defined in `src/styles/ob-tokens.css`:

### 2.1 Color Palette
| Token | Value | Purpose |
| :--- | :--- | :--- |
| `--ob-bg` | `#080706` | Universal warm dark background (replaces hardcoded `#030303`, `#050403`) |
| `--ob-surface` | `#13100D` | Primary card and drawer surface |
| `--ob-surface-strong` | `#1C1712` | Elevated controls, search inputs, modal sheets |
| `--ob-surface-elevated`| `#221C16` | Active chips, interactive state containers |
| `--ob-border` | `rgba(255, 248, 240, 0.07)` | Standard subtle card/divider border |
| `--ob-border-subtle` | `rgba(255, 248, 240, 0.04)` | Ultra-fine dividers inside lists |
| `--ob-border-strong` | `rgba(232, 114, 12, 0.30)` | Focus ring and active selection border |
| `--ob-brand` | `#E8720C` | Primary brand saffron (actions, cart CTA, active tabs) |
| `--ob-brand-light` | `#F4A05C` | Secondary accent (sublines, discounts, rating stars) |
| `--ob-brand-subtle` | `rgba(232, 114, 12, 0.12)` | Badge and chip background tint |
| `--ob-text-primary` | `#FFF8F0` | Headings, card titles, prices (high contrast) |
| `--ob-text-secondary` | `#A89B8C` | Subtitles, delivery meta, descriptions |
| `--ob-text-tertiary` | `#6B5F52` | Footnotes, disabled labels, timestamps |

### 2.2 Typography Scale
| Role | Classes | Size / Weight | Application |
| :--- | :--- | :--- | :--- |
| **Hero Page Title** | `text-xl sm:text-2xl font-extrabold tracking-tight` | 20px–24px / 800 | Top of screen hero / Onboarding |
| **Section Heading** | `text-base sm:text-lg font-bold tracking-tight text-[#FFF8F0]` | 16px–18px / 700 | "Recent searches", "Trending", "Menu Categories", "Preferences" |
| **Sub-section / Group**| `text-sm sm:text-base font-semibold text-[#FFF8F0]` | 14px–16px / 600 | Card headers, chip group titles |
| **Item Title** | `text-sm font-bold text-[#FFF8F0]` | 14px / 700 | Kitchen names, dish names |
| **Body / Description** | `text-xs sm:text-sm text-[#A89B8C] leading-snug` | 12px–14px / 400 | Dish descriptions, delivery hints |
| **Meta / Badges** | `text-[10px] sm:text-[11px] font-bold uppercase tracking-wider` | 10px–11px / 700 | Dietary tags, ETA, distance, order status |

### 2.3 Spacing & Section Geometry
- **Default Section Spacing**: `space-y-4` (16px) or `py-3` to `py-4` (12px–16px).
- **Section Bottom Margin**: `mb-2` to `mb-3` on section headers. No default `mb-8 sm:mb-12`.
- **Card Padding**: `p-3.5` to `p-4` (14px–16px).
- **Container Inline Padding**: `px-4 sm:px-6`.
- **Bottom Chrome Clearance**:
  - Standalone/Focus routes: `pb-[calc(5rem+env(safe-area-inset-bottom,0px))]`
  - Marketplace routes with BottomNav: `pb-[calc(6.5rem+env(safe-area-inset-bottom,0px))]`
  - Kitchen Menu with View Cart stripe: `pb-[calc(7.5rem+env(safe-area-inset-bottom,0px))]`

---

## 3. Screen-by-Screen Specification

### 3.1 Home (`/`)
- **Brand & Header**: Compact discovery header with unified brand mark (`Order` in `#FFF8F0`, `Bhojan` in `#F4A05C`), location chip, search trigger, and profile avatar.
- **Hero Carousel**: 140px min-height card with warm food imagery, clean typography, and subtle bottom scene dots.
- **AI Voice Ordering Card**: Integrated calm card (`border border-white/10 bg-[#13100D]`) with single primary "Tap to speak" pill. Eliminate heavy glowing multi-color blur halos.
- **Categories Rail**: Horizontal circular category chips with clear active states.
- **Kitchen Listings ("Popular Near You")**: `text-base font-bold text-[#FFF8F0]` header with `View all` link; cards feature 16:9 or 5:4 food photography, clear star rating badge, distance in km, ETA, and cuisine tags.

### 3.2 Search (`/search`)
- **Header**: Single unified header. Do NOT double-stack a ScreenHeader and an in-page "← Back" button.
- **Surface**: Seamless `#080706` background without alternating white/black bands.
- **Chips & Browse Suggestions**:
  - "Recent searches", "Trending searches", "Popular searches", "Popular Categories":
  - Heading: `text-sm sm:text-base font-bold text-[#FFF8F0] mb-2`
  - Chips: Compact pill badges `rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/80 transition hover:border-[#E8720C]/40`
  - Spacing: Tight 12px vertical gaps between chip groups.

### 3.3 Menu & Restaurant Detail (`/restaurant/:slug` & `/restaurant/:slug/menu`)
- **Restaurant Hero**: Rich cover photo, verified kitchen badge, rating, hours, and cuisine tags.
- **Sticky Filter Bar**: Dietary filters (`All`, `Veg`, `Non-Veg`) and category anchor pill rail in backdrop-blurred `#080706`/95.
- **Category Headings**: Render category titles ("Breakfast", "Biryani", "Combos") at `text-base sm:text-lg font-bold text-[#FFF8F0]` with `mb-2`.
- **Dish Cards**: Clean white/10 border on `#13100D` card, crisp dish title, dietary indicator dot (green/red), price in INR, customizable tag, and compact `Add` button.
- **Floating Cart Stripe**: Fixed at bottom with safe-area bottom offset; displays item count, subtotal, and "View Cart" CTA.

### 3.4 Profile (`/profile`)
- **Identity Card**: User avatar, verified phone / email, and loyalty/membership status badge.
- **Preferences Section**: Clean `text-base font-bold text-[#FFF8F0] mb-2` heading. Individual rows for Spice level, Dietary preference, and Notifications with clean chevron indicators.
- **Account Actions**: Order history, Address book, Help center, and subtle red-accented Sign out action.

### 3.5 Orders & Tracking (`/orders` & `/orders/:orderId/track`)
- **Orders List**: Card rows with `#13100D` background, order ID, restaurant name, item count, date, status pill (`active`: amber/orange, `complete`: emerald, `cancelled`: red), and "Track" chevron.
- **Tracking Experience**: Visual progress timeline with courier / kitchen status, live ETA, map preview, and driver contact button.
- **Chrome Balance**: On `/orders`, hide redundant floating cart or assistant FAB overlaps so cards have full touch surface without clutter.

### 3.6 Floating Assistant Orb (FAB)
- **Geometry**: Compact 52px circle positioned at `right: 16px`, `bottom: calc(88px + var(--ob-safe-bottom, 0px))`.
- **Styling**: `#13100D` surface, clean border `border-white/15`, subtle amber accent icon. Remove excessive multi-layer glowing halos (`shadow-[0_12px_36px_-10px_rgba(255,122,0,0.65)]`) and ping animations during idle state.

---

## 4. Acceptance Criteria

1. Headings on Search and Profile never exceed `text-lg` (18px) or overpower food items.
2. Background color is uniform `--ob-bg` (`#080706`) without disconnected `#030303` black holes.
3. No dual back buttons on Search.
4. Food dishes and kitchen cards are the visual heroes; borders are subtle (`border-white/[0.08]`) rather than glowing neon orange.
5. Content at the bottom of long menus and orders is fully visible and scrollable above all navigation bars.
