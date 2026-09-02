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
| `mynaaiDemo` | Marks the local preview workspace; demo data never goes to the API |
| `FCM_TOKEN` | Browser-only Firebase registration token, when push is configured |
| `hasSeenOnboarding` | Local onboarding preference |

A successful OTP verification/onboarding stores the token and role. A browser restart therefore preserves the login until the API token expires or the user signs out. If the API returns `JWT_FAILED` or another JWT failure response, `src/lib/api.js` clears the stored session and dispatches `mynaai:session-expired`, which immediately returns the React app to authentication. A manual logout also deletes the browser FCM token.

The app listens for relevant `localStorage` changes, so signing out or changing the session in another tab updates the open tab as well.

### Required browser notifications

The first-load onboarding/login experience offers a visible **Enable alerts** action. The same status card remains available at the top of the authenticated workspace whenever the browser token is missing. It distinguishes an unconfigured Firebase project, a denied permission and a token-generation failure; a blocked permission is never silently ignored. The action can be retried after the user changes the site permission in browser settings.

Real customer and salon authentication is blocked until Firebase Web Push returns a non-empty registration token. That token is sent as `deviceToken` in the OTP verification/onboarding contract and is cached as `FCM_TOKEN`. Demo workspaces are local previews and do not call the API.

### Incomplete salon profile guard

After salon login, `isNewSalon` or `profileCompleted: false` routes to **Complete salon profile** before the queue/dashboard is rendered. The editor requires owner/salon/contact/type/address information, valid services and specialists, browser coordinates, and valid hours. A successful update clears the incomplete flag and only then permits normal salon navigation.

## 4. Salon queue changes

### Walk-in customer is disabled

The walk-in customer flow has been intentionally commented out and removed from the visible salon queue UI. The old implementation remains in `src/components/SalonScreens.jsx` as a commented block for possible future re-enable; the old API method is retained only for API parity/future work.

### Token number is no longer displayed

Queue token numbers are not shown in the portal. The queue now focuses on the customer name, appointment date/time, services, specialist and phone action. The summary card shows the next appointment time and customer instead of a token number. The API may still return `queueNumber`; it is simply not rendered by the web UI.

## 5. Salon profile update contract

The web editor sends the same complete body shape used by the mobile salon editor to `POST /api/salons/update-salon`. It includes profile/contact/address fields, numeric `latitude` and `longitude`, `imageUrl`, `imagesArray`, a detailed `businessHours` array, `isActive`, `profileCompleted`, and separate service/specialist collections:

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
  "businessHours": [{ "scheduleId": "...", "openingTime": "09:00:00", "closingTime": "21:00:00", "breakStartTime": null, "breakEndTime": null, "holidayDays": [] }],
  "isActive": true,
  "profileCompleted": true
}
```

New services and specialists intentionally omit their IDs; existing records retain `serviceId`/`barberId`. The editor preserves the schedule ID and break times, and refuses to submit missing/invalid coordinates or malformed contact, service, barber and time values.

## 6. Salon time update and customer notification

When a salon cannot start a booking at the selected time, the salon can open the booking request and choose **Update time**. The web flow offers:

- **+10 minutes**
- **+20 minutes**

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

## 7. Notification destinations

The notification route mapping is shared by foreground JavaScript and the Firebase messaging service worker:

| Mobile notification type | Web destination | Role |
| --- | --- | --- |
| `DELAY_TIME_PROPOSAL` | `#/delay` with booking ID, delay minutes and proposed time | Customer |
| `BOOKING_CONFIRMED` | `#/bookings` | Customer |
| `BOOKING_REJECTED` | `#/bookings` | Customer |
| `DELAY_RESPONSE` | `#/bookings` | Customer |
| `BOOKING_REQUEST` | `#/bookingRequest?bookingRequestId=...` | Salon |
| `DELAY_BOOKING` | `#/bookingRequest?bookingRequestId=...&openDelayModal=true` | Salon |

Hash query parameters are parsed by `App.jsx`, so a notification click remains actionable after a cold start or browser restart. See [FIREBASE-WEB-PUSH.md](./FIREBASE-WEB-PUSH.md) for Firebase setup and payload details.

## 8. PWA service workers

Two workers have separate responsibilities and scopes:

- `public/sw.js` owns the root app scope and caches the offline shell.
- `public/firebase-messaging-sw.js` is registered only when Firebase push is configured, with scope `/firebase-cloud-messaging-push-scope`. It receives background FCM messages, shows a browser notification and handles click-through routing.

They must not be merged into one worker or registered with the same scope. The PWA install prompt is captured by the app and offered from the desktop partner sidebar when the browser supports it.

## 9. Important source locations

| File | Responsibility |
| --- | --- |
| `src/App.jsx` | Auth, session restoration, logout/expiry state, hash routes and push startup |
| `src/lib/api.js` | Mobile-compatible REST client, bearer token and JWT cleanup |
| `src/lib/push.js` | Firebase initialization, permission/token flow and notification route mapping |
| `public/firebase-messaging-sw.js` | Background push display and notification click routing |
| `src/components/UserScreens.jsx` | Customer screens, bookings and delay response |
| `src/components/SalonScreens.jsx` | Salon queue, booking request, delay action and partner screens |
| `src/main.jsx` | Root offline shell worker registration |
| `src/styles.css` | Responsive mobile-first layout through large desktop widths |

## 10. Validation checklist

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
