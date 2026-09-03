# MyNaai web portal guide

This document describes the responsive MyNaai customer and salon-partner web portal, the mobile-app compatibility decisions, and the current notification/time-update workflows.

## 1. What the portal is

The portal is a Vite/React single-page PWA for the two roles already present in the mobile app:

- **Customer**: discover salons, view services and specialists, choose a slot, create booking requests, view bookings, respond to a salon delay request, browse products, update the profile and read notifications.
- **Salon partner**: view the live customer queue, open a booking request, accept or reject it, ask the customer to accept a small time delay, mark a service complete, review history, manage products, edit salon details, manage open/closed status and manage a subscription.

The UI uses the same REST endpoint names and payload conventions as `rightserveinfotechsystems/my_naai_app`. The production API default is `https://backend.mynaai.in`. In Vite development, `/api`, `/getFiles` and `/socket.io` use the configured proxy. The image path deliberately keeps the mobile app’s case-sensitive spelling: `/getFiles/<path>`.

## 2. Run and build

```bash
npm install
npm run dev
```

For a production build:

```bash
npm run lint
npm run build
npm run preview
```

A deployed production site should use HTTPS, serve the SPA fallback for hash routes, and expose the generated `dist` directory. Copy `.env.example` to `.env.local` and fill only the values needed by the deployment. Do not commit `.env.local`.

## 3. Startup and authentication

There is deliberately no multi-second web splash screen. The app reads its session synchronously from `localStorage` and renders the authenticated shell immediately. First-time visitors see the onboarding slides; returning visitors go directly to the login form or their saved workspace.

The web session uses these keys:

| Key | Purpose |
| --- | --- |
| `mynaai` | JSON-wrapped bearer access token, matching the mobile storage shape |
| `mynaaiUser` | Last authenticated user/salon object |
| `userType` | `USER` or `SALON` |
| `isLoggedIn` | Boolean-like string used to restore the session |
| `isNewSalon` | Salon registration state |
| `FCM_TOKEN` | Browser-only Firebase registration token, when push is configured |
| `hasSeenOnboarding` | Local onboarding preference |

A successful OTP verification/onboarding stores the token and role. A browser restart therefore preserves the login until the API token expires or the user signs out. If the API returns `JWT_FAILED` or another JWT failure response, `src/lib/api.js` clears the stored session and dispatches `mynaai:session-expired`, which immediately returns the React app to authentication. A manual logout also deletes the browser FCM token.

The app listens for relevant `localStorage` changes, so signing out or changing the session in another tab updates the open tab as well.

### Required browser notifications

The first-load onboarding/login experience offers a visible **Enable alerts** action only when notification permission or token setup needs attention. Authenticated pages stay focused on their work; a retry action is available from the Account screen when permission is missing or blocked. Technical Firebase configuration details are never shown to users. The action can be retried after the user changes the site permission in browser settings.

Real customer and salon authentication is blocked until Firebase Web Push returns a non-empty registration token. That token is sent as `deviceToken` in the OTP verification/onboarding contract and is cached as `FCM_TOKEN`.

### Incomplete salon profile guard

After salon login, `isNewSalon` or `profileCompleted: false` routes to **Complete salon profile** before the queue/dashboard is rendered. The editor requires owner/salon/contact/type/address information, valid services and specialists, browser coordinates, and valid hours. A successful update clears the incomplete flag and moves the partner to the subscription choice before normal salon navigation.

## 4. Salon queue changes

### Walk-in customer is disabled

The walk-in customer flow is not exposed in the web portal. The legacy `walkInBooking` API method remains only because the REST client must preserve the mobile API surface; no screen calls it.

### Token number is no longer displayed

Queue token numbers are not shown in the portal. The queue now focuses on the customer name, appointment date/time, services, specialist and phone action. The summary card shows the next appointment time and customer instead of a token number. The API may still return `queueNumber`; it is simply not rendered by the web UI.

## 5. Salon profile update contract

The web editor mirrors the mobile app's `EditSalonProfileScreen`: the same collapsible groups (**Owner Information**, **Salon Information**, **Address & Location**, **Salon Images**, **Business Hours**, **Salon Services**, **Barbers**) and the same field labels (Salon Owner Name, Mobile Number, Email Address, Salon Name, Salon Type, Agent Code, Complete Address, Landmark / Address Line 2, City, State, Pincode, Opening Time, Closing Time, Weekly Off, Service Name, Price, Duration, Description, Barber Name, Availability). **Every group is collapsed by default** (including during onboarding) and each collapsed card still carries three readable lines: the group title, the mobile app's sub heading (for example *Name, phone number and email*) and a live summary of what is inside it, plus a red `N required` chip when something mandatory is missing. Required fields are marked with a red `*` exactly like the mobile `FieldLabel`, inputs use a larger 15px body size with a lighter border and placeholder, and a status bar above the form counts the outstanding required details with an **Expand all / Collapse all** control. A failed save opens the offending group, scrolls it into view and focuses its first input. Individual service and barber cards expand exactly like the mobile editor, and an incomplete service or barber is flagged while collapsed. The web editor sends the same complete body shape used by the mobile salon editor to `POST /api/salons/edit-salon-profile`. It includes profile/contact/address fields, numeric `latitude` and `longitude`, `imageUrl`, `imagesArray`, a detailed `businessHours` array, `isActive`, `profileCompleted`, and separate service/specialist collections:

```json
{
  "salonId": "...",
  "ownerName": "...",
  "salonName": "...",
  "phoneNumber": "...",
  "email": "...",
  "genderType": "UNISEX",
  "agentCode": null,
  "addressLine1": "...",
  "addressLine2": null,
  "city": "...",
  "state": "...",
  "pincode": "...",
  "latitude": 21.1458,
  "longitude": 79.0882,
  "existingServices": [{ "serviceId": "...", "serviceName": "Haircut", "durationMinutes": 30, "price": "299", "description": "..." }],
  "newServices": [],
  "existingBarbers": [{ "barberId": "...", "fullName": "...", "profileImageUrl": null, "ratingAverage": "4.8", "isAvailable": true }],
  "newBarbers": [],
  "businessHours": [{ "scheduleId": "...", "openingTime": "09:00:00", "closingTime": "22:00:00", "breakStartTime": null, "breakEndTime": null, "holidayDays": [] }],
  "isActive": true,
  "profileCompleted": true
}
```

New services and specialists intentionally omit their IDs; existing records retain `serviceId`/`barberId`. The editor preserves the schedule ID and break times, and refuses to submit missing/invalid coordinates or malformed contact, service, barber and time values.

Coordinates that already exist on the profile are kept as-is; the browser location prompt only runs automatically when the salon has **no** saved pin, so an existing partner editing their menu from home never has the salon location silently replaced. **Detect current location** remains available on demand.

### Where a save takes the partner

| Profile state when the editor opened | Active plan | After a successful save |
| --- | --- | --- |
| New salon / profile not completed | none or expired | **Payment screen** (`#/subscription`) — free 20-day onboarding plan first, then the paid plans |
| New salon / profile not completed | already active | **Salon account** (`#/account`) — never a second payment for the same save |
| Complete profile (routine edit) | any | **Salon account** (`#/account`) |

Sign-in, session restore and the salon account screen all force an incomplete profile back into this editor (`isNewSalon` / `profileCompleted === false`, or a profile missing owner name, salon name, address, salon type, coordinates, services or business hours), so a new salon always reaches the editor first and the payment screen second.

### Live updates socket

Both realtime screens (salon **Customer queue** and customer **My bookings**) share one socket.io connection managed by `src/lib/socket.js`. It mirrors the mobile app's global socket approach: it joins the `join_salon`/`join_user` room for the signed-in identity, re-joins rooms after every reconnect, listens for `queue_updated`/`booking_status_updated`, and starts with polling before upgrading to WebSocket so a blocked `wss` upgrade degrades to polling instead of failing (the earlier websocket-only connections produced "WebSocket is closed before the connection is established" during React StrictMode remounts and never recovered behind proxies without an upgrade path). Local development connects same-origin through the Vite `/socket.io` ws proxy; production uses `VITE_API_BASE_URL`. The connection is rebuilt on logout and session expiry.

### Active plan display

`src/lib/planDetails.js` keeps the plan catalog (same ids, titles, prices and durations as the mobile `SubscriptionsPlan`/`RenewalSubscriptionsPlan` screens) and normalizes the subscription fields returned by `get-salon` (root fields such as `planType`/`planExpiryDate` or nested `subscription`/`plan` objects). The salon account screen shows an active-plan card (plan title, price, start/expiry dates, days remaining, status, manage/renew action) and the profile editor shows a compact plan strip. When the backend response carries no plan fields, the account screen falls back to a "Plan details unavailable" card that deep-links to the subscription picker instead of guessing.

## 6. Salon subscriptions and onboarding

The subscription route follows the mobile `SubscriptionsPlan` contract:

- An incomplete, already-created salon is sent to the profile editor first. After a successful profile save, the partner sees the default **20-day free trial** choice and can start it without opening Razorpay. The editor clears the incomplete-session flag while keeping the partner on the subscription route; the free-plan action then refreshes the authenticated hash route into the salon queue.
- A new salon reaches the same route after registration OTP, with the temporary token returned by `verify-otp-register`. Paid plans first call `POST /api/salons/create-payment-order` with the plan amount in INR, open Razorpay Checkout with the returned order ID, and send the payment ID, order ID and signature to `POST /api/salons/create-salon-with-plan` with the temporary bearer authorization. The response must contain both a salon ID and a permanent session token; otherwise the portal does not mark registration as complete.
- A logged-in partner can choose a renewal plan from the account subscription entry. The browser creates the Razorpay order and sends `{ planType, paymentId, totalAmount }` to `POST /api/salons/renew-salon-plan` with the persisted salon session. A successful renewal returns to the partner account without replacing the session with a temporary token.

The public Razorpay key is read from `VITE_RAZORPAY_KEY_ID` (with the mobile app's configured live key as the production fallback); no secret is placed in the browser. The payment order and subscription endpoints remain in `src/lib/api.js` with the mobile method names and bearer/body contracts.

### Payment outcomes, cancellation and UPI app hand-off

`src/lib/razorpay.js` wraps Checkout so every outcome is explicit instead of a silent `null`:

- **Amount** — the order is created in rupees (`{ amount, currency: 'INR' }`) and Checkout is opened with the order's own amount in paise; a ₹0 plan falls back to 100 paise, matching `paymentForMembership` in the mobile app so the gateway never rejects a zero-amount order.
- **Cancelled** — closing the sheet (back button, `Esc`, dismiss) reports *"Payment cancelled. No amount was charged."* and keeps the partner on the plan picker with the order ID for support. `modal.confirm_close` is on so an accidental back-tap while a UPI app is opening does not silently abandon the subscription.
- **Failed** — `payment.failed` shows the bank/gateway reason but leaves the sheet open so the partner can retry with another method; only a terminal validation failure resolves immediately. A failed attempt is never treated as success, and a retry that succeeds still activates the plan.
- **UPI app redirect (GPay / PhonePe / Paytm / BHIM)** — the sheet is kept alive while the tab is hidden (`visibilitychange` / `pagehide`), the UI switches to *"Waiting for your payment app…"* and then *"Confirming your payment… — please do not pay again"* when the partner returns. If Checkout hands the result back through a redirect instead, `razorpay_payment_id` / `razorpay_order_id` / `razorpay_signature` are read from the URL (search **or** hash query), matched to the stored order, used to finish `create-salon-with-plan` / `renew-salon-plan`, and then stripped from the address bar so a refresh cannot replay them.
- **Interrupted / killed tab** — the order, plan and (for registration) the registration payload are persisted before the sheet opens. On return the portal shows a recovery card with the order ID, **Try again** and a `tel:` link to 8380017393; a stale record (over 30 minutes) is discarded. If a payment succeeded but activation failed, the card switches to *"Payment received, plan not activated"*, hides **Try again** and shows the payment ID, so a partner is never invited to pay twice.
- **Gateway availability** — `checkout.js` is loaded on demand if the async tag in `index.html` was blocked, and the screen shows a live status line (`Secure payments powered by Razorpay` / `Preparing…` / `could not load` with **Retry**) instead of failing only when the partner taps pay.
- **Registration token** — the temporary `verify-otp-register` token is sent only as an `Authorization` header on `create-salon-with-plan`; it is no longer written into the session before payment, so a cancelled payment cannot leave the portal holding a temporary token.

## 7. Salon time update and customer notification

When a salon cannot start a booking at the selected time, the salon can open the booking request and choose **Update time**. The web flow offers the same delay options as the mobile app:

- **+20 minutes**
- **+40 minutes**
- **+60 minutes**

The salon sees that the customer will receive a delay request. Selecting an option calls the mobile-compatible endpoint:

```http
POST /api/bookingRequest/owner-action/{bookingRequestId}/
Content-Type: application/json
Authorization: Bearer <salon-access-token>

{
  "action": "DELAY",
  "delayMinutes": "10"
}
```

The web wrapper is `api.salonDelayBooking()`. The server-side `owner-action` implementation is responsible for saving the new delay state and sending the customer notification through the stored `deviceToken`, exactly like the mobile owner-action flow. The browser does not contain Firebase server credentials and does not send FCM messages directly.

The customer can receive the delay notification in the background or while the portal is open:

1. A notification click opens `#/delay?bookingRequestId=...&delayMinutes=...&proposedTime=...`.
2. The `DelayRequestScreen` lets the customer accept or reject the proposed delay.
3. The response calls `POST /api/bookingRequest/customer-delay-response/{bookingRequestId}/` with `{ "action": "ACCEPT" }` or `{ "action": "REJECT" }`.
4. The customer is returned to `#/bookings`.

## 8. Notification destinations

The notification route mapping is shared by foreground JavaScript and the Firebase messaging service worker:

| Mobile notification type | Web destination | Role |
| --- | --- | --- |
| `DELAY_TIME_PROPOSAL` | `#/delay` with booking ID, delay minutes and proposed time | Customer |
| `BOOKING_CONFIRMED` | `#/bookings` | Customer |
| `BOOKING_REJECTED` | `#/bookings` | Customer |
| `DELAY_RESPONSE` | `#/bookings` | Customer |
| `BOOKING_REQUEST` | `#/bookingRequest?bookingRequestId=...` | Salon |
| `DELAY_BOOKING` | `#/bookingRequest?bookingRequestId=...&openDelayModal=true` | Salon |

Foreground messages are rendered by the app itself (browser notification + in-app toast) and only time-critical types auto-navigate, so an informational message cannot pull a customer out of the booking flow; see [FIREBASE-WEB-PUSH.md](./FIREBASE-WEB-PUSH.md#foreground-delivery).

### Booking-request action buttons & response timer

A `BOOKING_REQUEST` notification carries the mobile app's **Accept / Reject / Delay** action buttons. `firebase-messaging-sw.js` handles them in `notificationclick`: Accept and Reject call `POST /api/bookingRequest/owner-action/{bookingRequestId}/` directly from the worker (the salon token is mirrored into IndexedDB by `src/lib/api.js`, so this works even when the PWA is closed) and then close the alert; Delay opens `#/bookingRequest?bookingRequestId=...&openDelayModal=true`. Browsers cap notification actions at two (Chrome), so Accept + Reject are the visible buttons while Delay stays reachable by tapping the notification body — and every action is always available in the booking-request screen as a fallback for browsers that do not render action buttons.

The mobile app shows a 60-second countdown on a booking-request alert and auto-cancels it after 70 seconds. The web Notification API cannot render a live chronometer, so the countdown is mirrored in the **Booking request** screen («Respond in m:ss», red in the final 15 seconds). When the timer expires, the app asks the worker (via a `MYNAAI_CLOSE_NOTIFICATION` message) to clear the matching notification and re-checks the request status.

Hash query parameters are parsed by `App.jsx`, so a notification click remains actionable after a cold start or browser restart. See [FIREBASE-WEB-PUSH.md](./FIREBASE-WEB-PUSH.md) for Firebase setup and payload details.

## 9. PWA service workers

Two workers have separate responsibilities and scopes:

- `public/sw.js` owns the root app scope and caches the offline shell.
- `public/firebase-messaging-sw.js` is registered only when Firebase push is configured, with scope `/firebase-cloud-messaging-push-scope`. It receives background FCM messages, shows a browser notification and handles click-through routing.

They must not be merged into one worker or registered with the same scope. The PWA install prompt is captured by the app and offered during onboarding/authentication and from the workspace sidebar when the browser supports it.

## 10. Important source locations

| File | Responsibility |
| --- | --- |
| `src/App.jsx` | Auth, session restoration, logout/expiry state, hash routes and push startup |
| `src/lib/api.js` | Mobile-compatible REST client, bearer token and JWT cleanup |
| `src/lib/socket.js` | Shared salon/user live-update socket (room joins, polling→WebSocket) |
| `src/lib/planDetails.js` | Plan catalog and active-subscription normalization |
| `src/lib/devtoolsShield.js` | Swallows the known Chrome DevTools Performance-panel crash (also inlined in `index.html` so it runs before the bundle) |
| `src/lib/razorpay.js` | Checkout loader, amount rules, payment outcomes, UPI hand-off tracking and pending-payment recovery |
| `src/components/SubscriptionScreen.jsx` | Plan picker, Razorpay flow, cancellation/failure copy and payment recovery |
| `src/lib/push.js` | Firebase initialization, permission/token flow and notification route mapping |
| `public/assets/brand/naai-mark.svg` | Official MyNaai mark (inherits `currentColor`) used by the in-app brand chip |
| `public/assets/brand/naai-logo-dark.svg` | Official logo on the dark app tile; the default image fallback everywhere |
| `public/firebase-messaging-sw.js` | Background push display and notification click routing |
| `src/components/UserScreens.jsx` | Customer screens, bookings and delay response |
| `src/components/SalonScreens.jsx` | Salon queue, booking request, delay action and partner screens |
| `src/main.jsx` | Root offline shell worker registration |
| `src/styles.css` | Responsive mobile-first layout through large desktop widths |

## 11. Validation checklist

Before deployment:

```bash
npm run lint
npm run build
node --check public/firebase-messaging-sw.js
git diff --check
```

Then test on an HTTPS deployment with a real customer and salon account:

- Sign in, reload, close the browser and reopen it.
- Let an expired JWT make an API request and confirm the UI returns to login.
- Sign out and confirm the local session is removed.
- Send a `BOOKING_REQUEST` notification to a salon and click it.
- Send a `DELAY_TIME_PROPOSAL` notification to a customer and test both responses.
- Test push permission denied, browser refresh, foreground delivery and background delivery.
- Confirm the existing offline shell worker still works independently of Firebase Messaging.
- Open **Edit salon profile**: every card starts collapsed with its sub heading visible, `*` marks the required fields, and a failed save opens and scrolls to the offending card.
- Save a new/incomplete profile and confirm it lands on the payment screen; save a complete profile and confirm it returns to **Salon account**.
- On a phone, start a payment, choose UPI, switch to Google Pay/PhonePe, come back and confirm the portal shows *Confirming your payment…* and activates the plan.
- Open Checkout and press back/close: confirm the *Payment cancelled — no amount was charged* notice and that **Continue** starts a fresh order.

## 12. Known console noise (not a MyNaai bug)

While Chrome DevTools is open, its Performance panel injects an anonymous helper script that can throw:

```text
Uncaught TypeError: Cannot read properties of undefined (reading 'startTime')
    at et.reportAllChanges (<anonymous>:2:19429)
```

This comes from DevTools itself (the same signature is reported in `angular/angular#70464`), not from the portal — the only `startTime` read in this codebase is `details?.startTime` in `BookingRequestScreen`, which is optional-chained. `index.html` installs a capture-phase guard before the bundle loads and `src/lib/devtoolsShield.js` keeps it active afterwards; both suppress **only** that exact signature (`reading 'startTime'` plus `reportAllChanges`/anonymous source) so real errors still surface. It only appears with DevTools open and never reaches users who do not open DevTools.
