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

## API compatibility

`src/lib/api.js` preserves the mobile app's endpoint names and payload conventions, including OTP login, salon discovery, bookings, queue actions, services, products, notifications, image upload and subscription flows. Auth state uses the same storage keys (`mynaai`, `mynaaiUser`, `userType`, `isLoggedIn`, and `isNewSalon`) so a migrated web session follows the same shape.

For a quick review without SMS or payment credentials, the login screen includes customer and salon workspace previews. Preview data is intentionally isolated behind `mynaaiDemo` and never sent to the API.

## PWA

- `public/manifest.webmanifest` defines the installable app shell and uses the MyNaai logo.
- `public/sw.js` caches the shell and falls back to the cached app when offline.
- The install action appears in the desktop partner sidebar when the browser exposes the install prompt.
