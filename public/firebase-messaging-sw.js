/*
 * Firebase Messaging service worker for MyNaai web push.
 * The main app adds the public Firebase config as query parameters when it
 * registers this worker, so no environment values need to be committed here.
 *
 * LISTENER ORDER MATTERS. `firebase.messaging()` (below) makes the Firebase SDK
 * register its own `push` and `notificationclick` handlers, and its click
 * handler calls `event.stopImmediatePropagation()` for every notification the
 * SDK displayed itself — i.e. any message that carried a `notification` block.
 * It then only opens `webpush.fcm_options.link` / `notification.click_action`
 * and does nothing at all when no link is set, which is why such notifications
 * used to be un-clickable on the web. Registering MyNaai's click handler FIRST
 * keeps deep links working for both payload shapes:
 *   - data-only message  -> onBackgroundMessage below builds it, we route it
 *   - notification block -> the SDK builds it, we unwrap data.FCM_MSG and route
 * and still defers to the SDK when the backend does configure a link.
 */

self.addEventListener('notificationclick', event => {
  // Action buttons belong to the app/SDK, not to plain click routing.
  if (event.action) return;
  const internal = event.notification?.data?.FCM_MSG || null;
  const configuredLink = internal?.fcmOptions?.link || internal?.notification?.click_action || '';
  if (internal && configuredLink) return;

  event.stopImmediatePropagation();
  event.notification.close();

  const notificationData = event.notification?.data || {};
  const data = notificationData.target ? notificationData : (internal?.data || notificationData);
  const target = data.target || notificationRoute(data);
  const destination = new URL(target, self.location.origin).href;

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      const windows = clientList.filter(client => 'navigate' in client && client.url.startsWith(self.location.origin));
      // Reuse a visible tab first, then any focused one, then whatever exists.
      const current = windows.find(client => client.visibilityState === 'visible')
        || windows.find(client => client.focused)
        || windows[0];
      if (current) return current.navigate(destination).then(client => client.focus());
      if (self.clients.openWindow) return self.clients.openWindow(destination);
      return undefined;
    })
  );
});

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
    const title = data.title || 'MyNaai update';
    const body = data.body || 'You have a new update from MyNaai.';
    const target = notificationRoute(data);

    // Returning the promise matters: the SDK awaits this handler inside the
    // push event's waitUntil(), so the worker stays alive long enough to show
    // the alert (an unreturned promise can be killed mid-display).
    return self.registration.showNotification(title, {
      body,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      tag: data.bookingRequestId || data.type || 'mynaai-notification',
      data: { ...data, target },
      requireInteraction: data.type === 'BOOKING_REQUEST',
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
