# MyNaai Web Portal — Test & Mobile-Parity Report

This document records how the web portal was verified against the MyNaai mobile app
(`rightserveinfotechsystems/my_naai_app`) and what was tested automatically.

> **What was actually exercised in this environment**
> - `npm run build` (production) — passes
> - `npm run lint` (ESLint) — passes
> - `npm test` (Vitest + jsdom) — 26 unit tests pass
> - Live `vite` preview: served the app, all source modules, and the buzzer
>   WAV assets with HTTP 200.
>
> **What cannot be exercised from this sandbox** (needs a real device / the live
> `https://backend.mynaai.in` API and Firebase web-push config, which are not
> committed):
> - End-to-end push delivery via FCM (background, installed-PWA, closed).
> - Live API calls against the real backend (OTP, booking, owner-action, etc.).
> - Rendering on a physical Android/iOS browser (notification action buttons
>   and vibration are device/browser+version dependent).

---

## 1. Automated test suite

Added a Vitest setup to the web portal (previously there were no tests).

Run with:

```bash
npm test
```

| File | Covers |
| --- | --- |
| `src/lib/push.test.js` (17) | `isPushConfigured`, `bookingRequestActions` (Accept/Reject/Delay), `normalizePushPayload` (notification+data merge, data-only, defaults, click_action), `isActionableNotification` (salon vs customer), `getNotificationRoute` (all types/roles, delay modal, unknown fallback), `formatPushDiagnostics`. |
| `src/lib/buzzer.test.js` (5) | `vibrate` (available / unavailable), `isBuzzerSupported`, `playBuzzer` (returns + vibrates), `unlockBuzzer`. |
| `src/lib/api.test.js` (4) | `getToken`/`setToken` JSON round-trip, raw-string tolerance, `getServerUrl`. |

Test doubles: `src/test/setup.js` stubs `Notification`, `navigator.vibrate`,
`AudioContext`, and `indexedDB`; the Firebase browser SDK is mocked at module
boundary so the lib can be imported under jsdom.

---

## 2. Mobile → Web feature map

### Customer (USER)

| Mobile screen | Web route | Status |
| --- | --- | --- |
| SplashLogo → SplashScreen (onboarding) | `#/` (`AuthFlow`) | ✅ Black logo + "Let's Start" on last slide |
| UserLogin / UserSignup / OtpScreen | `AuthFlow` phone/OTP/new-user | ✅ same OTP + `deviceToken` flow |
| NaaiDashboard (discover) | `#/home` | ✅ distance-sorted salon list, location retry |
| ServicesScreen (booked salons) | `#/bookings` | ✅ bookings + live socket updates |
| UserProduct | `#/products` | ✅ |
| SalonDetailScreen | `#/detail` | ✅ |
| SalonServicesScreen | `#/services` | ✅ |
| BookingSchedule | `#/schedule` | ✅ available-slot picker (past, booked, overlapping, and too-late slots hidden) |
| AccountScreen | `#/account` | ✅ profile + Notification status card |
| UserNotifications | `#/notifications` | ✅ |
| DelayRequestScreen | `#/delay` | ✅ accept/reject via `customer-delay-response` |
| About / FAQ / Terms | `#/about`, `#/faq`, `#/terms` | ✅ |

### Salon partner (SALON)

| Mobile screen | Web route | Status |
| --- | --- | --- |
| SalonDashboard (queue) | `#/queue` | ✅ live socket, mark done, call customer |
| SalonBookingHistory | `#/history` | ✅ |
| SalonProduct | `#/salonProducts` | ✅ |
| SalonAccountScreen | `#/account` | ✅ profile, plan, toggle open/closed |
| AddOfflineCustomer (walk-in) | — | ⬜ commented out in mobile, not a live flow |
| BookingRequestScreen | `#/bookingRequest` | ✅ Accept/Reject/Delay + 60s timer |
| EditSalonProfileScreen | `#/editProfile` | ✅ full profile editor + payment step |
| SalonNotifications | `#/notifications` | ✅ |
| SalonAbout / FAQ / Terms | `#/salonAbout`, `#/salonFAQ`, `#/salonTerms` | ✅ |
| SubscriptionsPlan / Renewal | `#/subscription` | ✅ plan list + Razorpay |

### Notification parity (background & foreground)

- `BOOKING_REQUEST` → **Accept / Reject / Delay** action buttons + 60-second
  response timer. Worker calls the owner-action API for Accept/Reject, opens the
  delay modal for Delay. ✅
- All other notification types → **no** action buttons; clicking opens the
  app/browser on its route (`#/bookings`, `#/delay`, `#/bookingRequest`, or
  `#/`). ✅
- Buzzer: real mobile WAV (`buzzer_old` for booking, `buzzer` for default) with a
  synthetic fallback, plus device vibration on foreground and background alerts.
  The audible background sound is the OS notification sound (a closed service
  worker cannot synthesize a custom tone). ✅

---

## 3. Verified parity decisions

- **API surface**: the web `src/lib/api.js` mirrors every endpoint the mobile
  `communication.js` uses (auth, salon list, booking, booking-request, owner
  action, customer delay response, notifications, products, image upload,
  subscription, open/close). ✅
- **Auth/session storage keys**: `mynaai`, `mynaaiUser`, `userType`,
  `isLoggedIn`, `isNewSalon` — same as mobile. The browser FCM token lives in
  `FCM_TOKEN`; the session token is additionally mirrored into IndexedDB so the
  service worker can act on a notification from a closed app. ✅
- **Delay options**: +20 / +40 / +60 minutes, matching the mobile
  `BookingRequestScreen` delay modal. ✅
- **Route deep-links**: hash-based, so a notification click survives a cold
  start / browser restart. ✅

---

## 4. Behavioral notes & limits

- **Buzzer when the app is closed**: browsers only play the OS notification
  sound for web push and cannot synthesize a custom tone from a closed service
  worker. The real buzzer reliably plays whenever the app is open (Web Audio),
  and the alert carries `vibrate` + a best-effort `sound` for supporting
  browsers. A backend `sound` field is not required for the web client.
- **Notification action buttons**: Chrome caps them at two, so Accept + Reject
  are the visible buttons and Delay is reached by tapping the body or via the
  app. The in-app Booking request screen always offers all three actions, so
  browsers that don't render action buttons still work.
- **Push payload shape**: action buttons render only for **data-only**
  booking-request pushes; if the server sends a `notification` block the FCM SDK
  displays it and suppresses the buttons (the in-app screen still covers it).
