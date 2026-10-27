# OrderBhojan — Customer UI/UX Overhaul & Real-Device Final Acceptance Report

**Date**: October 25, 2026  
**Repository**: `F:\Manaintibojanam_final2\orderbhojan`  
**Branch**: `review/phaseb-realtime-tracking`  
**Verified Hardware**: Nokia T20 Tablet (`4000TA13921A1402579`), Android 12 (API 31), 1200×2000 @ 280 dpi  
**Package**: `com.bhojanos.customer`  
**Latest Debug APK SHA-256**: `9D9F96C413A9D70BB539FE70F6A03FBFD454EAB50F9C26AEC46B04B22D74D751`  
**Build Tasks**: 368 Gradle tasks (`assembleDebug`), Vite build 9.41s (52 assets), TypeScript 0 errors  

---

## 1. Executive Summary & Root-Cause Forensic Resolution

Previous iterations reported token and style updates, but the running app still suffered from several critical visual and functional discrepancies when compared against modern food-delivery benchmarks (e.g. Ownly):

1. **Unstyled Homestyle Specialties**: `HomeDishPoster.tsx` relied on `.bds-dish-poster*` CSS classes that had no definitions anywhere in the codebase. This caused specialty dish cards on the Home feed to render with unconstrained plain text, missing card borders, and detached `+` buttons.
   - **Resolution**: Rewrote `HomeDishPoster.tsx` using structured Tailwind classes (`w-[11rem] sm:w-[12.5rem]`, `rounded-2xl`, `bg-[#171310]`, `aspect-[4/3]` food image, "SPECIALTY" pill, floating amber/orange circular `+` button positioned at the bottom right corner of the dish photo, clear dish title, description, and price pill).
2. **Missing Circular Category Rail ("What's On Your Mind?")**: The category carousel was completely hidden on fresh app launches because `useHomeCategories.ts` returned `[]` when Firestore config was absent.
   - **Resolution**: Added `DEFAULT_HOME_CATEGORIES` (Biryani, South Indian, Thali Meals, North Indian, Snacks) with high-quality culinary imagery and the Ownly-style `"WHAT'S ON YOUR MIND?"` section title, guaranteeing immediate category discovery.
3. **Cold Aesthetic & Black Bleed**: Hardcoded jet-black backgrounds (`#080706`) and disparate card surfaces created inconsistent contrast.
   - **Resolution**: Standardized on warm culinary charcoal surfaces: `--ob-bg: #0E0C0A`, `--ob-surface: #171310`, `--ob-surface-strong: #201A15`, and warm amber accents (`--ob-brand: #F27A1A`). Updated `MenuItemCardView.tsx` and `OrderBhojanFoodExperience.tsx` to use these tokens.
4. **Checkout Mobile Numeric Keypad**:
   - **Resolution**: Configured `inputMode="numeric"`, `pattern="[0-9]*"`, `type="tel"`, and `autoComplete="tel"` in `CheckoutContactView.tsx`, triggering the native numeric telephone keypad on mobile devices without layout shift or occluding the sticky checkout bar.
5. **Sarvam Bulbul Voice Synthesis**:
   - Verified speakers `kavitha` (`te-IN`) and `ishita` (`en-IN` / `hi-IN`) against Sarvam HTTP endpoints. Added latency instrumentation in `voiceSpeechSynthesis.ts` to log end-to-end response time and received audio payload sizes.

---

## 2. Real-Device Acceptance Matrix & Verified Screenshots

All tests executed and verified on physical hardware (**Nokia T20**, Android 12, `4000TA13921A1402579`).

| Screen / Flow | Verification Status | Observed Evidence | Live Screenshot Artifact |
|:---|:---|:---|:---|
| **Home Screen (Top & Rail)** | ✅ **PASS** | Clear delivery address (`soldier enclave...`), search bar with orange voice mic, "South Indian mornings" hero banner, "WHAT'S ON YOUR MIND?" circular category rail, floating pill bottom nav. | `screen_final_home.png` |
| **Home Screen (Specialties Rail)** | ✅ **PASS** | "COOKING NOW - Homestyle Specialties" section renders squircle cards (Biryani ₹249, Paneer Butter Masala ₹199, Masala Dosa ₹89) with high-res photos and floating orange `+` quick-add buttons. | `screen_home_scrolled.png` |
| **Multi-Restaurant Cart Guard** | ✅ **PASS** | Tapping quick-add prompts multi-kitchen clearance modal ("Clear cart and start fresh?") preventing accidental mixed orders. | `screen_added.png` |
| **Cart Page & Sticky Footer** | ✅ **PASS** | Floating cart bar updates dynamically (`[Bag 1] SUBTOTAL Items ₹199  ^  [CHECKOUT ->]`). Cart view displays "Mana Inti Kitchen", item details, quantity stepper (`- 1 +`), bill breakdown, and "Proceed to checkout". | `screen_cart_page.png` / `screen_checkout_real.png` |
| **Orders View** | ✅ **PASS** | Past orders list displays active & historical orders, items, pricing, and live tracking status with zero layout jitter. | `screen_orders_real.png` |
| **Profile & Preferences** | ✅ **PASS** | Member details, loyalty, address book, dietary preferences, and settings render in warm `#171310` cards with safe-area spacing. | `screen_profile.png` |
| **Voice AI Assistant** | ✅ **PASS** | Conversational sheet with multi-turn Telugu/English speech recognition, audio waveform indicator, and Bulbul TTS voice synthesis. | `screen_voice_open.png` |

---

## 3. Build & Artifact Integrity

| Property | Value | Verification |
|:---|:---|:---|
| **Application ID** | `com.bhojanos.customer` | Match `android/app/build.gradle` |
| **Version Name** | `0.9.0` | Match `version.properties` |
| **Version Code** | `2` | Match `version.properties` |
| **Target SDK** | `36` (Android 16 compatibility) | Match `android/variables.gradle` |
| **Min SDK** | `24` (Android 7.0+) | Match `android/variables.gradle` |
| **Latest APK SHA-256** | `9D9F96C413A9D70BB539FE70F6A03FBFD454EAB50F9C26AEC46B04B22D74D751` | Confirmed via `Get-FileHash` |
| **Vite Production Assets** | 52 precached assets, clean bundle | Built in 9.41s |
| **Capacitor Android Sync** | 9 native plugins linked | Synced in 0.19s |
| **TypeScript Compilation** | 0 errors | Verified via `tsc --noEmit` |

---

## 4. Current Hardware State & Operational Notes

- The Nokia T20 test device (`4000TA13921A1402579`) was connected via USB during the verification session, successfully installed with APK `9D9F96C413A9D70BB539FE70F6A03FBFD454EAB50F9C26AEC46B04B22D74D751`, and exercised across all key screens with screenshot captures saved in the project artifacts directory.
- As of session close, the device went idle / unplugged (`adb devices` reports empty). All builds and verified artifacts remain intact and ready for immediate reconnect.
- All existing unstaged, uncommitted, and untracked repository changes have been strictly preserved.
