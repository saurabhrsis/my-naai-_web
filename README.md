# MyNaai web portal

A mobile-first, responsive PWA for the MyNaai customer and salon partner experiences. The portal mirrors the REST contract used by `rightserveinfotechsystems/my_naai_app` and defaults to the production API at `https://backend.mynaai.in`.

## Run locally

```bash
npm install
npm run dev
```

Build a production bundle with `npm run build` and serve the generated `dist` directory from a host that supports SPA fallbacks and HTTPS for installable PWA behaviour.

## Environment

Create `.env.local` when pointing to another environment:

```bash
VITE_API_BASE_URL=https://your-api.example.com
VITE_RAZORPAY_KEY_ID=rzp_live_your_public_key_id
```

`VITE_RAZORPAY_KEY_ID` is a public Razorpay key ID, never a secret. The Razorpay checkout script is loaded in `index.html`; payment order creation and subscription completion still go through the existing MyNaai APIs.

For browser push, create a Firebase Web app and add its public config plus the Web Push certificate key to `.env.local` (the complete list is in `.env.example`):

```bash
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project
VITE_FIREBASE_STORAGE_BUCKET=your-project.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
VITE_FIREBASE_VAPID_KEY=...
```

Enable the **Web Push certificates** API in Firebase Cloud Messaging and copy the public VAPID key. Because push notifications are a core MyNaai feature, the portal requires a non-empty browser `deviceToken` before OTP verification/onboarding, and the backend can keep the field required. Without these values or browser permission, authentication is intentionally blocked until Web Push is configured.

## API compatibility

`src/lib/api.js` preserves the mobile app's endpoint names and payload conventions, including OTP login, salon discovery, bookings, queue actions, services, products, notifications, image upload and subscription flows. Auth state uses the same storage keys (`mynaai`, `mynaaiUser`, `userType`, `isLoggedIn`, and `isNewSalon`) so a migrated web session follows the same shape. The browser FCM token is kept in `FCM_TOKEN` and removed on logout.

The complete portal behavior and operational notes are in [`docs/MY-NAAI-WEB-PORTAL.md`](docs/MY-NAAI-WEB-PORTAL.md). Firebase setup, browser token generation and notification payload processing are documented in [`docs/FIREBASE-WEB-PUSH.md`](docs/FIREBASE-WEB-PUSH.md).

## PWA

- Startup is intentionally immediate: session state is restored synchronously from local storage instead of showing a timed splash screen.
- `public/manifest.webmanifest` defines the installable app shell and uses the MyNaai logo.
- `public/sw.js` caches the shell and falls back to the cached app when offline.
- `public/firebase-messaging-sw.js` receives Firebase background messages and maps notification clicks to the matching hash route (`#/bookings`, `#/delay`, or `#/bookingRequest`). Its `notificationclick` listener is registered before `firebase.messaging()` because the SDK's own click handler calls `stopImmediatePropagation()` and opens only `fcmOptions.link`, which made alert-bearing messages un-clickable; the worker also unwraps the SDK's `data.FCM_MSG` and skips its own `showNotification()` when the payload already carried a `notification` block, so each message produces exactly one clickable alert.
- Foreground Firebase messages use the same route mapping without reloading the app.
- Both Account screens carry a collapsible **Notification status** card that reports nine web-push checks (HTTPS, browser APIs, Firebase web config, permission, messaging client, service worker, push subscription, masked FCM token, last foreground message) with **Run again**, **Allow notifications** and **Copy report** for support, so "notifications are not working" is pinned to a specific layer on the device itself.
- Salon booking requests offer +10/+20 minute time updates; the mobile-compatible owner-action API sends the delay notification to the customer.
- Foreground push is rendered by the app (browser notification + toast) and only time-critical types auto-navigate, so an informational message cannot pull a customer out of the booking flow.
- Customer discovery sends browser latitude/longitude to `userSalonList`, sorts known distances nearest-first (while keeping the API list when location is unavailable), and offers a location retry.
- An incomplete salon login is locked to the full profile editor until the mobile-compatible `edit-salon-profile` body succeeds with valid contact, address, coordinates, hours, services and specialists. Every editor section is collapsed by default with its sub heading, live summary and a `N required` chip visible; required fields carry a red `*`; a failed save opens and scrolls to the offending section.
- Saving a new/incomplete profile continues to the payment screen (20-day free onboarding plan first); saving a routine edit — or any profile that already has an active plan — returns to the salon account screen instead of asking for a second payment.
- Razorpay Checkout reports every outcome explicitly: cancellation, gateway/bank failure (retry inside the sheet), a UPI app hand-off on mobile (Google Pay, PhonePe, Paytm, BHIM) with *Confirming your payment…* on return, redirect returns read from the URL, and a recovery card with the order ID plus support number if the tab was killed mid-payment.
- The install action appears during onboarding/authentication and in the desktop workspace sidebar when the browser exposes the install prompt.
