/*
 * Firebase Messaging service worker for MyNaai web push.
 * The main app adds the public Firebase config as query parameters when it
 * registers this worker, so no environment values need to be committed here.
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

if (firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.messagingSenderId && firebaseConfig.appId) {
  firebase.initializeApp(firebaseConfig);
  const messaging = firebase.messaging();

  messaging.onBackgroundMessage(payload => {
    const data = payload.data || {};
    const notification = payload.notification || {};
    const title = notification.title || data.title || 'MyNaai update';
    const body = notification.body || data.body || 'You have a new update from MyNaai.';
    const target = notificationRoute(data);

    self.registration.showNotification(title, {
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

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const target = event.notification.data?.target || notificationRoute(event.notification.data || {});
  const destination = new URL(target, self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      const current = clientList.find(client => 'focus' in client);
      if (current) return current.navigate(destination).then(client => client.focus());
      if (self.clients.openWindow) return self.clients.openWindow(destination);
      return undefined;
    })
  );
});
