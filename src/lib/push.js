import { getApps, initializeApp } from 'firebase/app';
import { deleteToken, getMessaging, getToken, isSupported, onMessage } from 'firebase/messaging';
import { getErrorMessage } from '../components/Shared';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};
const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY;

let messagingPromise;
let registrationPromise;

export function isPushConfigured() {
  return Boolean(firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.messagingSenderId && firebaseConfig.appId && vapidKey);
}

function queryConfig() {
  return new URLSearchParams(Object.entries(firebaseConfig).filter(([, value]) => value)).toString();
}

async function getMessagingClient() {
  if (!isPushConfigured() || typeof window === 'undefined' || !('serviceWorker' in navigator)) return null;
  if (!messagingPromise) {
    messagingPromise = (async () => {
      if (!(await isSupported())) return null;
      const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
      return getMessaging(app);
    })().catch(error => {
      console.debug(getErrorMessage(error, 'Firebase Messaging is unavailable.'));
      messagingPromise = undefined;
      return null;
    });
  }
  return messagingPromise;
}

// `register()` can resolve while the worker is still installing, and FCM's
// getToken needs an active worker to attach the push subscription to. Waiting
// here removes the "no active service worker" first-visit failure that shows up
// as a silent empty token.
function waitForActiveWorker(registration, timeout = 6000) {
  return new Promise(resolve => {
    if (!registration) return resolve(null);
    const active = registration.active || registration.waiting || registration.installing;
    if (registration.active) return resolve(registration);
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(registration);
    };
    const timer = setTimeout(finish, timeout);
    [registration.installing, registration.waiting].forEach(worker => {
      if (!worker) return;
      worker.addEventListener('statechange', () => {
        if (worker.state === 'activated' || registration.active) finish();
      });
    });
    if (!active) finish();
    return undefined;
  });
}

async function getPushServiceWorker() {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return null;
  if (!registrationPromise) {
    registrationPromise = navigator.serviceWorker
      .register(`/firebase-messaging-sw.js?${queryConfig()}`, { scope: '/firebase-cloud-messaging-push-scope' })
      .then(registration => waitForActiveWorker(registration))
      .catch(error => {
        console.debug(getErrorMessage(error, 'Firebase push service worker registration failed.'));
        // Allow the authenticated retry action to recover from a transient
        // service-worker/Firebase setup failure instead of caching null forever.
        registrationPromise = undefined;
        return null;
      });
  }
  return registrationPromise;
}

// Read-only worker lookup for the diagnostics card: registering on demand can
// block for seconds while the script activates, and the health check should
// describe the current state rather than change it.
async function peekPushServiceWorker() {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return null;
  try {
    const registrations = navigator.serviceWorker.getRegistrations ? await navigator.serviceWorker.getRegistrations() : [];
    const isOurs = registration => [registration?.active, registration?.waiting, registration?.installing]
      .some(worker => String(worker?.scriptURL || '').includes('firebase-messaging-sw'));
    const match = registrations.find(isOurs);
    if (match) return match;
    return navigator.serviceWorker.getRegistration
      ? await navigator.serviceWorker.getRegistration('/firebase-cloud-messaging-push-scope')
      : null;
  } catch (error) {
    console.debug(getErrorMessage(error, 'Could not read the service-worker registrations.'));
    return null;
  }
}

// Explains *why* push is unavailable so the UI (and support) can say something
// useful instead of failing silently.
export async function getPushStatus() {
  if (typeof window === 'undefined' || !('Notification' in window)) return { state: 'unsupported', reason: 'This browser cannot show notifications.' };
  if (!('serviceWorker' in navigator)) return { state: 'unsupported', reason: 'Service workers are unavailable, so web push cannot run.' };
  if (!isPushConfigured()) return { state: 'unconfigured', reason: 'Firebase web push is not configured for this deployment (VITE_FIREBASE_* and VITE_FIREBASE_VAPID_KEY).' };
  if (Notification.permission === 'denied') return { state: 'denied', reason: 'Notifications are blocked in the browser permissions for this site.' };
  const messaging = await getMessagingClient();
  if (!messaging) {
    // iOS only exposes web push to installed PWAs (iOS 16.4+).
    const installedHint = window.matchMedia?.('(display-mode: standalone)').matches ? '' : ' On iPhone/iPad, install MyNaai to the home screen first.';
    return { state: 'unsupported', reason: `Firebase Messaging is not supported in this browser context.${installedHint}` };
  }
  if (Notification.permission === 'default') return { state: 'needs-permission', reason: 'Notification permission has not been granted yet.' };
  const token = await getPushToken({ requestPermission: false });
  return token ? { state: 'enabled', token } : { state: 'unavailable', reason: 'Firebase could not create a push token for this browser.' };
}

export async function getPushToken({ requestPermission = false } = {}) {
  if (!isPushConfigured() || typeof window === 'undefined' || !('Notification' in window)) return '';
  const messaging = await getMessagingClient();
  if (!messaging) return '';
  let permission = Notification.permission;
  if (permission === 'default' && requestPermission) {
    try { permission = await Notification.requestPermission(); } catch (error) {
      console.debug(getErrorMessage(error, 'Browser notification permission was not available.'));
      return '';
    }
  }
  if (permission !== 'granted') return '';
  const registration = await getPushServiceWorker();
  if (!registration) return '';
  try {
    const token = await getToken(messaging, { vapidKey, serviceWorkerRegistration: registration });
    if (token) localStorage.setItem('FCM_TOKEN', token);
    return token || '';
  } catch (error) {
    console.debug(getErrorMessage(error, 'Firebase could not generate a browser notification token.'));
    return '';
  }
}

// FCM delivers foreground web messages to the page instead of the OS, so the
// app has to render them. Showing them through the messaging service worker
// keeps the notificationclick deep-link routing in one place.
export async function displayNotification({ title, body, data = {} } = {}) {
  if (typeof window === 'undefined' || !('Notification' in window) || Notification.permission !== 'granted') return false;
  const type = String(data.type || data.notificationType || '').toUpperCase();
  const options = {
    body: body || 'You have a new update from MyNaai.',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    tag: data.bookingRequestId || data.type || 'mynaai-notification',
    data: { ...data, target: notificationTarget(data) },
    requireInteraction: type === 'BOOKING_REQUEST' || type === 'DELAY_TIME_PROPOSAL',
    // Buzzer-style vibration for time-critical alerts (Android browsers).
    vibrate: type === 'BOOKING_REQUEST' || type === 'DELAY_TIME_PROPOSAL' ? [260, 120, 260, 120, 520] : undefined,
  };
  try {
    const registration = await getPushServiceWorker();
    if (registration?.showNotification) {
      await registration.showNotification(title || 'MyNaai update', options);
      return true;
    }
  } catch (error) {
    console.debug(getErrorMessage(error, 'The notification service worker could not display the alert.'));
  }
  try {
    new Notification(title || 'MyNaai update', { body: options.body, icon: options.icon, tag: options.tag });
    return true;
  } catch (error) {
    console.debug(getErrorMessage(error, 'This browser blocked the in-page notification.'));
    return false;
  }
}

function notificationTarget(data = {}) {
  const type = String(data.type || data.notificationType || '').toUpperCase();
  const id = encodeURIComponent(data.bookingRequestId || data.bookingId || '');
  if (type === 'DELAY_TIME_PROPOSAL') {
    return `/#/delay?bookingRequestId=${id}&delayMinutes=${encodeURIComponent(data.delayMinutes || '')}&proposedTime=${encodeURIComponent(data.proposedTime || '')}`;
  }
  if (type === 'BOOKING_CONFIRMED' || type === 'BOOKING_REJECTED' || type === 'DELAY_RESPONSE') return '/#/bookings';
  if (type === 'BOOKING_REQUEST') return `/#/bookingRequest?bookingRequestId=${id}`;
  if (type === 'DELAY_BOOKING') return `/#/bookingRequest?bookingRequestId=${id}&openDelayModal=true`;
  return '/#/';
}

// A web FCM message can arrive as `{ notification, data }`, data-only, or with an
// empty `data` object next to a populated `notification`. Merge both so routing
// and copy never depend on which shape the backend used.
export function normalizePushPayload(payload = {}) {
  const notification = payload?.notification && typeof payload.notification === 'object' ? payload.notification : {};
  const raw = payload?.data && typeof payload.data === 'object' ? payload.data : {};
  const fallback = !raw.type && !notification.title && payload?.type ? payload : {};
  const data = { ...fallback, ...raw };
  if (!data.type && notification.click_action) data.type = String(notification.click_action);
  return {
    title: notification.title || data.title || data.notificationTitle || 'MyNaai update',
    body: notification.body || data.body || data.message || data.notificationBody || 'You have a new update from MyNaai.',
    data,
    type: String(data.type || data.notificationType || '').toUpperCase(),
    hasData: Boolean(Object.keys(raw).length),
  };
}

// Records the last foreground delivery so the in-app diagnostics can prove the
// FCM pipeline is alive end to end (backend -> Firebase -> browser -> portal).
export function recordForegroundMessage(message = {}) {
  try {
    // A foreground FCM message arrives as { notification, data, from } — the
    // booking type lives in data, not at the top level.
    const data = message.data || {};
    localStorage.setItem('FCM_LAST_MESSAGE', JSON.stringify({
      at: new Date().toISOString(),
      type: data.type || data.notificationType || message.type || '',
      title: message.notification?.title || data.title || message.title || '',
    }));
  } catch (storageError) {
    console.debug(getErrorMessage(storageError, 'Could not record the last notification.'));
  }
}

export function readForegroundMessageRecord() {
  try {
    const parsed = JSON.parse(localStorage.getItem('FCM_LAST_MESSAGE') || 'null');
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch (parseError) {
    return null;
  }
}

function maskToken(token) {
  const value = String(token || '');
  if (!value) return '';
  return value.length <= 24 ? `${value.slice(0, 6)}…` : `${value.slice(0, 14)}…${value.slice(-6)} (${value.length} chars)`;
}

// Step-by-step web push health, shown on both Account screens so "notifications
// are not working" can be pinned to a specific layer on the actual device.
export async function getPushDiagnostics() {
  const checks = [];
  const add = (label, state, value, detail = '') => checks.push({ label, state, value, detail });

  add('Secure context (HTTPS)', window.isSecureContext ? 'ok' : 'fail', window.isSecureContext ? 'Yes' : 'No', window.isSecureContext ? '' : 'Web push only works on https:// (or localhost).');
  const hasBrowserApis = 'Notification' in window && 'serviceWorker' in navigator;
  add('Browser APIs', hasBrowserApis ? 'ok' : 'fail', hasBrowserApis ? 'Available' : 'Missing', hasBrowserApis ? '' : 'This browser has no Notification/serviceWorker API — web push cannot work here.');
  const requiredConfig = { apiKey: firebaseConfig.apiKey, projectId: firebaseConfig.projectId, messagingSenderId: firebaseConfig.messagingSenderId, appId: firebaseConfig.appId, vapidKey };
  const missingRequired = Object.entries(requiredConfig).filter(([, value]) => !value).map(([key]) => key);
  const missingOptional = ['authDomain', 'storageBucket'].filter(key => !firebaseConfig[key]);
  add('Firebase web config', missingRequired.length ? 'fail' : 'ok',
    missingRequired.length ? `Missing ${missingRequired.join(', ')}` : missingOptional.length ? `Complete (${missingOptional.join(', ')} not set — not needed for push)` : 'Complete',
    missingRequired.length ? 'Set the VITE_FIREBASE_* build variables and redeploy.' : '');
  add('Notification permission', Notification.permission === 'granted' ? 'ok' : Notification.permission === 'denied' ? 'fail' : 'warn', Notification.permission, Notification.permission === 'denied' ? 'Allow notifications for this site in browser settings, then retry.' : Notification.permission === 'default' ? 'Not requested yet.' : '');

  let messaging = null;
  try { messaging = await getMessagingClient(); } catch (error) { console.debug(getErrorMessage(error, 'Messaging client unavailable.')); }
  add('Firebase Messaging', messaging ? 'ok' : 'fail', messaging ? 'Initialised' : 'Unavailable', messaging ? '' : 'iOS/iPadOS needs the installed PWA (Add to Home Screen); some browsers block it entirely.');

  let registration = null;
  try {
    registration = await peekPushServiceWorker();
    if (!registration && isPushConfigured()) registration = await getPushServiceWorker();
  } catch (error) { console.debug(getErrorMessage(error, 'Worker registration unavailable.')); }
  const worker = registration?.active || registration?.waiting || registration?.installing || null;
  add('Messaging service worker', registration ? 'ok' : 'fail', registration ? `${worker?.state || 'registered'} · scope ${registration.scope}` : 'Not registered', registration ? ''
    : isPushConfigured()
      ? 'The worker script /firebase-messaging-sw.js could not be registered (blocked, offline, or gstatic unreachable).'
      : 'Registration is skipped until the Firebase web config is complete.');

  let subscription = null;
  try { subscription = registration?.pushManager ? await registration.pushManager.getSubscription() : null; } catch (error) { console.debug(getErrorMessage(error, 'Push subscription unavailable.')); }
  add('Push subscription', subscription ? 'ok' : 'warn', subscription ? `Active · ${(subscription.endpoint || '').replace(/^https?:\/\//, '').split('/')[0]}` : 'None yet', subscription ? '' : 'Created on the next token request.');

  const storedToken = typeof localStorage !== 'undefined' ? localStorage.getItem('FCM_TOKEN') || '' : '';
  const token = storedToken || (messaging ? await getPushToken({ requestPermission: false }) : '');
  add('FCM device token', token ? 'ok' : 'fail', token ? maskToken(token) : 'Empty', token
    ? 'This is the value sent to the API as deviceToken.'
    : Notification.permission === 'granted'
      ? 'Permission is granted but no token exists yet — the worker or Firebase config is the problem, not the browser.'
      : 'Sign-in needs a token: allow notifications, then sign in again.');

  const last = readForegroundMessageRecord();
  add('Last foreground message', last ? 'ok' : 'warn', last ? `${last.type || 'notification'} · ${new Date(last.at).toLocaleString('en-IN')}` : 'None received yet', last ? '' : 'Send a test notification while this tab is open to verify delivery.');

  const failed = checks.some(check => check.state === 'fail');
  return { ok: !failed, checks };
}

export function formatPushDiagnostics(diagnostics = {}) {
  return (diagnostics.checks || [])
    .map(check => `${check.state.toUpperCase()} · ${check.label}: ${check.value}${check.detail ? ` — ${check.detail}` : ''}`)
    .join('\n');
}

export async function setupPush({ onMessage: handleMessage } = {}) {
  const messaging = await getMessagingClient();
  if (!messaging) return { token: '', unsubscribe: () => {} };
  const token = await getPushToken({ requestPermission: false });
  const unsubscribe = handleMessage ? onMessage(messaging, handleMessage) : () => {};
  return { token, unsubscribe };
}

export async function deletePushToken() {
  localStorage.removeItem('FCM_TOKEN');
  const messaging = await getMessagingClient();
  if (!messaging) return;
  try { await deleteToken(messaging); } catch (error) { console.debug(getErrorMessage(error, 'Could not revoke the browser notification token.')); }
}

// Deep links a notification payload onto the matching hash route.
const ACTIONABLE_SALON_TYPES = ['BOOKING_REQUEST', 'DELAY_BOOKING'];
const ACTIONABLE_USER_TYPES = ['DELAY_TIME_PROPOSAL'];

export function isActionableNotification(type, role = '') {
  const value = String(type || '').toUpperCase();
  return String(role).toUpperCase() === 'SALON' ? ACTIONABLE_SALON_TYPES.includes(value) : ACTIONABLE_USER_TYPES.includes(value);
}

export function getNotificationRoute(data = {}, role = '') {
  const type = String(data.type || data.notificationType || '').toUpperCase();
  const bookingRequestId = data.bookingRequestId || data.bookingId || '';
  const query = params => Object.fromEntries(Object.entries(params).filter(([, value]) => value !== undefined && value !== null && value !== ''));

  if (type === 'DELAY_TIME_PROPOSAL' && String(role).toUpperCase() === 'USER') {
    return { name: 'delay', params: query({ bookingRequestId, delayMinutes: data.delayMinutes, proposedTime: data.proposedTime }) };
  }
  if ((type === 'BOOKING_CONFIRMED' || type === 'BOOKING_REJECTED' || type === 'DELAY_RESPONSE') && String(role).toUpperCase() === 'USER') {
    return { name: 'bookings', params: {} };
  }
  if (type === 'BOOKING_REQUEST' && String(role).toUpperCase() === 'SALON') {
    return { name: 'bookingRequest', params: query({ bookingRequestId }) };
  }
  if (type === 'DELAY_BOOKING' && String(role).toUpperCase() === 'SALON') {
    return { name: 'bookingRequest', params: query({ bookingRequestId, openDelayModal: 'true' }) };
  }
  return { name: String(role).toUpperCase() === 'SALON' ? 'queue' : 'home', params: {} };
}
