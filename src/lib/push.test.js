import { describe, it, expect, vi, beforeEach } from 'vitest';

// Firebase browser SDK does not run under node/jsdom; stub the entry points so
// the module import itself (and the feature-detection gates) stay safe.
vi.mock('firebase/app', () => ({ getApps: () => [], initializeApp: vi.fn(() => ({})) }));
vi.mock('firebase/messaging', () => ({
  getMessaging: vi.fn(() => ({})),
  getToken: vi.fn(() => Promise.resolve('')), isSupported: vi.fn(() => Promise.resolve(false)),
  deleteToken: vi.fn(() => Promise.resolve()), onMessage: vi.fn(),
}));

// push.js reads env vars; provide stable fixtures.

import {
  isPushConfigured,
  bookingRequestActions,
  normalizePushPayload,
  isActionableNotification,
  getNotificationRoute,
  formatPushDiagnostics,
} from './push';

beforeEach(() => {
  localStorage.clear();
  window.Notification.permission = 'granted';
});

describe('isPushConfigured', () => {
  it('is true when all required Firebase values are set', () => {
    expect(isPushConfigured()).toBe(true);
  });
});

describe('bookingRequestActions', () => {
  it('returns Accept / Reject / Delay', () => {
    const actions = bookingRequestActions();
    expect(actions).toHaveLength(3);
    expect(actions.map(a => a.action)).toEqual(['ACCEPT_BOOKING', 'REJECT_BOOKING', 'DELAY_BOOKING']);
  });
});

describe('normalizePushPayload', () => {
  it('merges notification + data blocks', () => {
    const result = normalizePushPayload({
      notification: { title: 'T', body: 'B' },
      data: { type: 'BOOKING_REQUEST', bookingRequestId: '42' },
    });
    expect(result.title).toBe('T');
    expect(result.body).toBe('B');
    expect(result.type).toBe('BOOKING_REQUEST');
    expect(result.data.bookingRequestId).toBe('42');
    expect(result.hasData).toBe(true);
  });

  it('handles data-only messages', () => {
    const result = normalizePushPayload({ data: { title: 'X', type: 'DELAY_TIME_PROPOSAL' } });
    expect(result.title).toBe('X');
    expect(result.type).toBe('DELAY_TIME_PROPOSAL');
  });

  it('falls back to defaults for empty payload', () => {
    const result = normalizePushPayload({});
    expect(result.title).toBe('My Naai update');
    expect(result.type).toBe('');
  });

  it('reads click_action into type', () => {
    const result = normalizePushPayload({ notification: { title: 'A', click_action: 'BOOKING_REQUEST' } });
    expect(result.type).toBe('BOOKING_REQUEST');
  });
});

describe('isActionableNotification', () => {
  it('salon handles BOOKING_REQUEST / DELAY_BOOKING', () => {
    expect(isActionableNotification('BOOKING_REQUEST', 'SALON')).toBe(true);
    expect(isActionableNotification('DELAY_BOOKING', 'SALON')).toBe(true);
    expect(isActionableNotification('BOOKING_CONFIRMED', 'SALON')).toBe(false);
  });
  it('customer handles DELAY_TIME_PROPOSAL', () => {
    expect(isActionableNotification('DELAY_TIME_PROPOSAL', 'USER')).toBe(true);
    expect(isActionableNotification('BOOKING_REQUEST', 'USER')).toBe(false);
  });
});

describe('getNotificationRoute', () => {
  const cases = [
    [{ type: 'DELAY_TIME_PROPOSAL', bookingRequestId: '9', delayMinutes: '10' }, 'USER', 'delay'],
    [{ type: 'BOOKING_CONFIRMED' }, 'USER', 'bookings'],
    [{ type: 'BOOKING_REJECTED' }, 'USER', 'bookings'],
    [{ type: 'DELAY_RESPONSE' }, 'USER', 'bookings'],
    [{ type: 'BOOKING_REQUEST', bookingRequestId: '5' }, 'SALON', 'bookingRequest'],
    [{ type: 'DELAY_BOOKING', bookingRequestId: '5' }, 'SALON', 'bookingRequest'],
  ];
  it.each(cases)('routes %s / role %s to %s', (data, role, expected) => {
    const route = getNotificationRoute(data, role);
    expect(route.name).toBe(expected);
  });

  it('openDelayModal set for DELAY_BOOKING', () => {
    const route = getNotificationRoute({ type: 'DELAY_BOOKING', bookingRequestId: '5' }, 'SALON');
    expect(route.params.openDelayModal).toBe('true');
  });

  it('defaults to home/queue when unknown', () => {
    expect(getNotificationRoute({ type: 'WEIRD' }, 'USER').name).toBe('home');
    expect(getNotificationRoute({ type: 'WEIRD' }, 'SALON').name).toBe('queue');
  });
});

describe('formatPushDiagnostics', () => {
  it('renders each check line', () => {
    const out = formatPushDiagnostics({ checks: [
      { state: 'ok', label: 'HTTPS', value: 'Yes' },
      { state: 'fail', label: 'Token', value: 'Empty', detail: 'missing' },
    ]});
    expect(out).toContain('OK · HTTPS: Yes');
    expect(out).toContain('FAIL · Token: Empty — missing');
  });
});
