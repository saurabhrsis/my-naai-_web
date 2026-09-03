/*
 * Firebase Messaging service worker for My Naai web push.
 * The main app adds the public Firebase config as query parameters when it
 * registers this worker, so no environment values need to be committed here.
 *
 * LISTENER ORDER MATTERS. `firebase.messaging()` (below) makes the Firebase SDK
 * register its own `push` and `notificationclick` handlers, and its click
 * handler calls `event.stopImmediatePropagation()` for every notification the
 * SDK displayed itself — i.e. any message that carried a `notification` block.
 * It then only opens `webpush.fcm_options.link` / `notification.click_action`
 * and does nothing at all when no link is set, which is why such notifications
 * used to be un-clickable on the web. Registering My Naai's click handler FIRST
 * keeps deep links working for both payload shapes:
 *   - data-only message  -> onBackgroundMessage below builds it, we route it
 *   - notification block -> the SDK builds it, we unwrap data.FCM_MSG and route
 * and still defers to the SDK when the backend does configure a link.
 *
 * BOOKING ACTION BUTTONS. A booking-request notification carries Accept /
 * Reject / Delay buttons (mirroring the My Naai mobile app). The worker calls the
 * owner-action API directly for Accept/Reject so it works even when the PWA is
 * closed, and opens the request screen with the delay modal for Delay. The
 * session token is mirrored into IndexedDB by the app (src/lib/api.js) so the
 * worker can authenticate; the audible background sound comes from the server's
 * push payload, and vibration/buzzer is best-effort.
 */

importScripts('https://www.gstatic.com/firebasejs/11.10.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/11.10.0/firebase-messaging-compat.js');

const params = new URL(self.location.href).searchParams;
const firebaseConfig = {
  apiKey: params.get('apiKey') || '',
  authDomain: params.get('authDomain') || '',
  projectId: params.get('projectId') || '',
  storageBucket: params.get('storageBucket') || '',
  messagingSenderId: params.get('messagingSenderId') || '',
  appId: params.get('appId') || '',
};

const ACTION_ACCEPT = 'ACCEPT_BOOKING';
const ACTION_REJECT = 'REJECT_BOOKING';
const ACTION_DELAY = 'DELAY_BOOKING';

const AUTH_DB_NAME = 'mynaai-notification-actions';
const AUTH_DB_STORE = 'auth';
const AUTH_DB_ID = 'auth';
const DEFAULT_API_BASE = 'https://backend.mynaai.in';

function openAuthDb() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable.'));
      return;
    }
    const request = indexedDB.open(AUTH_DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(AUTH_DB_STORE)) db.createObjectStore(AUTH_DB_STORE, { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function readNotificationAuth() {
  return openAuthDb()
    .then(db => new Promise(resolve => {
      const tx = db.transaction(AUTH_DB_STORE, 'readonly');
      const req = tx.objectStore(AUTH_DB_STORE).get(AUTH_DB_ID);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    }))
    .catch(() => null);
}

// Reuse/focus an existing window, or open a new one at `destination`.
function openOrFocus(destination) {
  return self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
    const windows = clientList.filter(client => 'navigate' in client && client.url.startsWith(self.location.origin));
    const current = windows.find(client => client.visibilityState === 'visible')
      || windows.find(client => client.focused)
      || windows[0];
    if (current) return current.navigate(destination).then(client => client.focus());
    if (self.clients.openWindow) return self.clients.openWindow(destination);
    return undefined;
  });
}

// Calls the mobile owner-action endpoint so Accept/Reject work from the
// notification without the app being open.
async function ownerAction(bookingRequestId, action, delayMinutes) {
  const auth = await readNotificationAuth();
  const apiBase = (auth?.apiBaseUrl || DEFAULT_API_BASE).replace(/\/$/, '');
  const url = `${apiBase}/api/bookingRequest/owner-action/${encodeURIComponent(bookingRequestId)}/`;
  const payload = action === 'DELAY' ? { action, delayMinutes: String(delayMinutes) } : { action };
  const headers = { 'Content-Type': 'application/json' };
  if (auth?.token) headers.Authorization = `Bearer ${auth.token}`;
  try {
    const response = await fetch(url, { method: 'POST', headers, body: JSON.stringify(payload) });
    const data = await response.json().catch(() => null);
    const ok = response.ok && (!data || data.status === 'SUCCESS');
    return { ok, data };
  } catch (error) {
    return { ok: false, error };
  }
}

// ACTION BUTTONS: Accept / Reject / Delay are handled first so a closed app can
// still act. Body clicks fall through to the deep-link routing below.
self.addEventListener('notificationclick', event => {
  const action = event.action || '';

  if (action === ACTION_ACCEPT || action === ACTION_REJECT || action === ACTION_DELAY) {
    event.stopImmediatePropagation();

    const notificationData = event.notification?.data || {};
    const internal = event.notification?.data?.FCM_MSG || null;
    const data = notificationData.target ? notificationData : (internal?.data || notificationData);
    const bookingRequestId = data.bookingRequestId || data.bookingId || '';

    if (action === ACTION_DELAY) {
      // Let the app open the request screen with the delay modal (no cancel,
      // matching the mobile handler).
      const destination = new URL(`/#/bookingRequest?bookingRequestId=${encodeURIComponent(bookingRequestId)}&openDelayModal=true`, self.location.origin).href;
      event.waitUntil(openOrFocus(destination));
      return;
    }

    // ACCEPT / REJECT: hit the API, close the alert, then surface the queue.
    const value = action === ACTION_ACCEPT ? 'ACCEPT' : 'REJECT';
    event.notification.close();
    event.waitUntil(ownerAction(bookingRequestId, value).then(result => {
      if (!result.ok) return openOrFocus(new URL('/#/queue', self.location.origin).href);
      return openOrFocus(new URL('/#/queue', self.location.origin).href);
    }));
    return;
  }

  // Plain body click on a notification the SDK displayed (notification block):
  // defer to the SDK when it configured a link, otherwise route ourselves.
  const internal = event.notification?.data?.FCM_MSG || null;
  const configuredLink = internal?.fcmOptions?.link || internal?.notification?.click_action || '';
  if (internal && configuredLink) return;

  event.stopImmediatePropagation();
  event.notification.close();

  const notificationData = event.notification?.data || {};
  const data = notificationData.target ? notificationData : (internal?.data || notificationData);
  const target = data.target || notificationRoute(data);
  const destination = new URL(target, self.location.origin).href;
  event.waitUntil(openOrFocus(destination));
});

// Lets the open app close a notification once its countdown expires (the web
// Notification API cannot render a live chronometer like Notifee's, so the app
// owns the timer and asks the worker to clear the alert).
self.addEventListener('message', event => {
  const data = event.data || {};
  if (data.type === 'MYNAAI_CLOSE_NOTIFICATION' && data.tag) {
    event.waitUntil(self.registration.getNotifications({ tag: String(data.tag) }).then(notifications => {
      notifications.forEach(notification => notification.close());
    }));
  }
});

if (firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.messagingSenderId && firebaseConfig.appId) {
  firebase.initializeApp(firebaseConfig);
  const messaging = firebase.messaging();

  // The SDK calls this handler for *every* background message, but when the
  // payload carries a `notification` block it has already displayed that
  // notification itself (wrapped as data.FCM_MSG). Building a second one here
  // produced duplicate alerts, so only data-only messages are rendered by us —
  // the click handler above routes both shapes.
  messaging.onBackgroundMessage(payload => {
    if (payload.notification?.title || payload.notification?.body) return;
    const data = payload.data || {};
    const title = data.title || 'My Naai update';
    const body = data.body || 'You have a new update from My Naai.';
    const target = notificationRoute(data);
    const type = String(data.type || data.notificationType || '').toUpperCase();
    // Time-critical alerts vibrate like the mobile app's buzzer. The OS decides
    // the audible notification sound (set on the server's push payload); a
    // closed service worker cannot synthesize a custom tone.
    const buzzer = type === 'BOOKING_REQUEST' || type === 'DELAY_BOOKING' || type === 'DELAY_TIME_PROPOSAL';
    const isBookingRequest = type === 'BOOKING_REQUEST';
    // Best-effort background sound: the worker passes the buzzer file to the
    // browser so it can play it when the PWA is closed. Web notification sound
    // support is inconsistent (Android largely uses the OS/channel sound and
    // ignores a custom URL), so this is the same limit the mobile-vs-web split
    // imposes — the real buzzer always plays via Web Audio while the app is open.
    const sound = buzzer ? new URL('/assets/audio/buzzer_old.wav', self.location.origin).href : 'default';

    // Returning the promise matters: the SDK awaits this handler inside the
    // push event's waitUntil(), so the worker stays alive long enough to show
    // the alert (an unreturned promise can be killed mid-display).
    return self.registration.showNotification(title, {
      body,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      tag: data.bookingRequestId || data.type || 'mynaai-notification',
      data: { ...data, target },
      requireInteraction: isBookingRequest,
      // "Buzzer" vibration for booking alerts on supporting Android browsers.
      vibrate: buzzer ? [260, 120, 260, 120, 520] : undefined,
      sound,
      // Accept / Reject / Delay buttons ONLY on booking requests. Every other
      // notification type carries no action buttons and just opens the app.
      actions: isBookingRequest
        ? [
            { action: ACTION_ACCEPT, title: 'Accept' },
            { action: ACTION_REJECT, title: 'Reject' },
            { action: ACTION_DELAY, title: 'Delay' },
          ]
        : undefined,
    });
  });
}

function notificationRoute(data) {
  const type = String(data.type || data.notificationType || '').toUpperCase();
  const id = encodeURIComponent(data.bookingRequestId || data.bookingId || '');
  if (type === 'DELAY_TIME_PROPOSAL') {
    return `/#/delay?bookingRequestId=${id}&delayMinutes=${encodeURIComponent(data.delayMinutes || '')}&proposedTime=${encodeURIComponent(data.proposedTime || '')}`;
  }
  if (type === 'BOOKING_CONFIRMED' || type === 'BOOKING_REJECTED' || type === 'DELAY_RESPONSE') return '/#/bookings';
  if (type === 'BOOKING_REQUEST' || type === 'DELAY_BOOKING') return `/#/bookingRequest?bookingRequestId=${id}${type === 'DELAY_BOOKING' ? '&openDelayModal=true' : ''}`;
  return '/#/';
}
