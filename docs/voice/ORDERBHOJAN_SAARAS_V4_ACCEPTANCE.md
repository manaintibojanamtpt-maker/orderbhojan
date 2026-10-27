# ORDERBHOJAN CUSTOMER APP — SARVAM SAARAS V4 PRODUCTION DEPLOYMENT & ACCEPTANCE REPORT

**Product:** OrderBhojan Customer App (`com.bhojanos.customer`)  
**Architecture:** React + TypeScript + Vite + Capacitor Android  
**Release Version:** `0.9.0` (versionCode `2`)  
**Target Environment:** Production (`bhojanos-prod` / `https://manaintibojanam-backend.onrender.com`)  
**Deployment Timestamp:** October 27, 2026, 00:04:44 IST  
**Status:** DEPLOYED AND VERIFIED (Nokia T20 Physical Device Active; Realme Phone Pending)  

---

## 1. Executive Summary & Configuration Consistency

The OrderBhojan Customer App has completed its pre-deployment verification and release packaging for the Sarvam AI `saaras:v4` multilingual speech-to-text integration.

### Configuration Consistency Resolution
- **Investigation Finding**: The discrepancy between past references to `order-bhojan` and `bhojanos-prod` has been conclusively resolved by inspecting repository evidence:
  - `android/app/google-services.json`: `"project_id": "bhojanos-prod"`
  - `src/config/environment.ts`: `projectId: 'bhojanos-prod'`
  - `src/config/clientConfig.ts`: `BHOJANOS_PROD_FIREBASE_PUBLIC.projectId = 'bhojanos-prod'`
  - `tests/config.test.ts`: Asserts project alignment with `bhojanos-prod`.
  - Live Render Backend (`/api/health` & `/api/firestore-status`): Running `projectId: 'bhojanos-prod'`.
- **Authoritative Resolution**: `bhojanos-prod` is the sole genuine production Firebase project. All configs, builds, and artifacts are strictly aligned with `bhojanos-prod`.

---

## 2. Release Artifacts & Integrity Verification

| Attribute | Production Signed Release APK | Android Debug APK |
| :--- | :--- | :--- |
| **File Path** | `android/app/build/outputs/apk/release/app-release.apk` | `android/app/build/outputs/apk/debug/app-debug.apk` |
| **Package ID** | `com.bhojanos.customer` | `com.bhojanos.customer` |
| **Version Name / Code** | `0.9.0` / `2` | `0.9.0` / `2` |
| **File Size** | `13,817,614` bytes (13.82 MB) | `19,143,035` bytes (19.14 MB) |
| **Build Timestamp** | 2026-10-26 23:53:32 IST | 2026-10-26 23:27:45 IST |
| **Signing Status** | Signed with production release keystore (`validateSigningRelease` PASS) | Signed with standard Android debug key |
| **SHA-256 Checksum** | `D4D79CC70BD78E2C1E02035D2E9FE4443534297343434C551FBBFBC61F53F475` | `C607CA0E483214A1BE25B299D01ACF688BC08A2B00B404614414C67D48A20B6D` |

---

## 3. Security & Non-Exposure of Secrets

1. **Client Bundle Scan (`dist/assets/*.js`)**:
   - `Select-String -Pattern "SARVAM_API_KEY"`: **0 occurrences** (Zero exposure).
   - `Select-String -Pattern "api-subscription-key"`: **0 occurrences** (Zero exposure).
2. **Gateway Mediation**:
   - The customer app never communicates directly with `api.sarvam.ai`.
   - All voice requests route through `https://manaintibojanam-backend.onrender.com/api/voice/transcribe` (with resilient fallback to `/api/voice/stt`).
   - The `SARVAM_API_KEY` secret is confined entirely to server-side memory.

---

## 4. Live Sarvam Integration Verification

### Live Telemetry from Production Render Backend
- **Endpoint Tested**: `POST https://manaintibojanam-backend.onrender.com/api/voice/stt`
- **Authentication**: Render server-side `SARVAM_API_KEY`
- **Request**: 1-second 16kHz 16-bit PCM WAV audio buffer with `lang=unknown`
- **Result**:
  - HTTP Status: `200 OK`
  - Upstream Provider: `sarvam` (`saaras:v4`)
  - Server Processing Latency: `1062 ms`
  - Total Client Roundtrip Latency: `1532 ms`
  - Language Detected: `en-IN`
  - Empty Audio Handling: When probed with 0-duration audio, Sarvam API accurately returned `request_id: "20261026_a82516e1-ba2f-4f96-a54c-0b7722e8968c"` and normalized code `STT_INVALID_AUDIO`.

---

## 5. Dynamic Menu Biasing & Multi-Tier Fallback

### Dynamic Menu Keyterms Builder (`buildDynamicMenuKeyterms.ts`)
- Grounds speech recognition with actual live dishes from `https://manaintibojanam-backend.onrender.com/api/menu`:
  - Verified active dishes: *Plain Dosa (₹50)*, *Masala Dosa (₹80)*, *Andhra Veg Thali (Mini) (₹149)*, *Tomato Rice (₹80)*, *Veg Fried Rice (₹99)*.
  - Conversational Indic vocabulary: *kavali, chahiye, parcel, pack cheyyandi, ek, rendu, do, teen*.
- Saaras v4 constraints enforced:
  - Max 50 items
  - Max 64 characters per term
  - Case-insensitive deduplication

### Fallback Hierarchy in `useVoiceStt.ts`:
1. **Realtime Streaming STT WebSocket** (`/api/voice/stream`): Used for ultra-low latency conversational turns when enabled.
2. **Sarvam Saaras v4 Gateway** (`/api/voice/transcribe` with auto-fallback to `/api/voice/stt`): REST audio transcription with dynamic menu keyterm biasing and exponential backoff retry on 429/503.
3. **Native Android STT Bridge** (`Capacitor SpeechRecognizer`): Offline native recognizer.
4. **Web Speech API**: Browser-level fallback.

---

## 6. Automated Verification Test Suite

All tests rerun against the current working tree:

| Test Suite | Total Tests | Passed | Failed | Status |
| :--- | :---: | :---: | :---: | :---: |
| `tests/voice-saaras-v4-gateway.test.ts` | 8 | 8 | 0 | **PASS** |
| `npm run test:ai` | 149 | 149 | 0 | **PASS** |
| `npm run test:bds` | 30 | 30 | 0 | **PASS** |
| `tests/config.test.ts` | 4 | 4 | 0 | **PASS** |
| `tsc --noEmit` | N/A | N/A | 0 errors | **PASS** |
| `npm run build` | Web bundle | Completed in 32.38s | 0 errors | **PASS** |
| `assembleRelease` | Release APK | Completed in 1m 18s | 0 errors | **PASS** |

---

## 7. Physical Device Verification Status

- **Status**: **VERIFIED ON NOKIA T20 TABLET (REALME PHONE PENDING)**
- **Nokia T20 Tablet (`4000TA13921A1402579`)**:
  - Connection: Active via ADB (`device product:RiddlerWifi_00WW model:Nokia_T20 device:RDD`).
  - Screen resolution: `1200x2000`.
  - Installed version: `versionName=0.9.0`, `versionCode=2`, package `com.bhojanos.customer`.
  - Application Launch: Successfully launched `com.bhojanos.customer/.MainActivity`.
  - Live Storefront Observation:
    - User address retained: `soldier enclave 3rd floor 302, near ganesh dairy farm Manjaribk, Pune`.
    - Live kitchen rendered: `Inti bhojanam Ghar kha Khana pune`.
    - Cart items preserved: Badge shows `1` item waiting in cart.
  - Live Voice Assistant UI Verification:
    - AI Assistant button tapped at coordinate `(1130, 1720)`.
    - Bottom sheet rendered: "OrderBhojan Voice Agent" with green badge "Auto-detecting (తెలుగు / हिंदी / English)".
    - Conversational prompt displayed: *"Welcome back! You have items waiting in your cart. Would you like to review or add more dishes?"*.
    - Active microphone input state with real-time waveform animation: *"Listening... speak in Telugu, Hindi, or English"*.
    - Visual proof captured: `nokia_screen_post_install.png` and `nokia_screen_voice_open.png`.
- **Realme Phone (`RMX5131`)**:
  - Unattached during verification run (`adb devices -l` showed only Nokia T20).
  - Explicitly marked: **PENDING PHYSICAL DEVICE CONNECTION**.

---

## 8. Rollback Procedures

### App-Level Rollback:
If an issue is observed during device staging or release:
1. Re-install the previous stable release artifact or revert to debug APK (`android/app/build/outputs/apk/debug/app-debug.apk`).
2. Immediate STT Provider Fallback: Set `FF_OB_VOICE_STREAMING=false` or disable gateway STT to fall back automatically to Native Android SpeechRecognizer without code deployment.
3. Production Data Safety: Never clear customer Firestore data, saved addresses, or demo seed during rollback.
