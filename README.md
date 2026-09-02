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

Enable the **Web Push certificates** API in Firebase Cloud Messaging and copy the public VAPID key. The existing backend should persist a non-empty `deviceToken` sent with OTP verification/onboarding, just as the mobile app does, but it must allow the field to be omitted when a browser denies permission or does not support push. Without these values, the portal continues to work with in-app notifications and live Socket.IO refreshes, but the browser will not receive push notifications.

## API compatibility

`src/lib/api.js` preserves the mobile app's endpoint names and payload conventions, including OTP login, salon discovery, bookings, queue actions, services, products, notifications, image upload and subscription flows. Auth state uses the same storage keys (`mynaai`, `mynaaiUser`, `userType`, `isLoggedIn`, and `isNewSalon`) so a migrated web session follows the same shape. The browser FCM token is kept in `FCM_TOKEN` and removed on logout.

For a quick review without SMS or payment credentials, the login screen includes customer and salon workspace previews. Preview data is intentionally isolated behind `mynaaiDemo` and never sent to the API.

The complete portal behavior and operational notes are in [`docs/MY-NAAI-WEB-PORTAL.md`](docs/MY-NAAI-WEB-PORTAL.md). Firebase setup, browser token generation and notification payload processing are documented in [`docs/FIREBASE-WEB-PUSH.md`](docs/FIREBASE-WEB-PUSH.md).

## PWA

- Startup is intentionally immediate: session state is restored synchronously from local storage instead of showing a timed splash screen.
- `public/manifest.webmanifest` defines the installable app shell and uses the MyNaai logo.
- `public/sw.js` caches the shell and falls back to the cached app when offline.
- `public/firebase-messaging-sw.js` receives Firebase background messages and maps notification clicks to the matching hash route (`#/bookings`, `#/delay`, or `#/bookingRequest`).
- Foreground Firebase messages use the same route mapping without reloading the app.
- Salon booking requests offer +10/+20 minute time updates; the mobile-compatible owner-action API sends the delay notification to the customer.
- The install action appears in the desktop partner sidebar when the browser exposes the install prompt.
