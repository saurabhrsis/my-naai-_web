import { describe, it, expect, vi, beforeEach } from 'vitest';

// Avoid importing the whole network chain; test the token helpers that back the
// service-worker auth mirror and the session shape used across the app.
import { api, getToken, setToken, getServerUrl, resetPlanExpiredAlert } from './api';

beforeEach(() => {
  localStorage.clear();
  window.indexedDB = { open: vi.fn() };
  resetPlanExpiredAlert();
  vi.unstubAllGlobals();
});

describe('token helpers', () => {
  it('starts empty', () => {
    expect(getToken()).toBe('');
  });

  it('setToken writes a JSON payload and getToken reads it back', () => {
    setToken('abc123');
    expect(getToken()).toBe('abc123');
    const stored = JSON.parse(localStorage.getItem('mynaai'));
    expect(stored.token).toBe('abc123');
  });

  it('getToken tolerates a raw (non-JSON) stored value', () => {
    localStorage.setItem('mynaai', 'raw-token');
    expect(getToken()).toBe('raw-token');
  });
});

describe('getServerUrl', () => {
  it('never throws and returns a string', () => {
    expect(typeof getServerUrl()).toBe('string');
  });
});

describe('plan expiry response handling', () => {
  it('dispatches one global event when any API returns PLAN_EXPIRED', async () => {
    const expired = vi.fn();
    window.addEventListener('mynaai:plan-expired', expired);
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({
      ok: false,
      status: 403,
      text: () => Promise.resolve(JSON.stringify({ error: 'PLAN_EXPIRED' })),
    })));

    await expect(api.customerList({ salonId: 'salon-1' })).rejects.toThrow();
    await expect(api.customerList({ salonId: 'salon-1' })).rejects.toThrow();

    expect(expired).toHaveBeenCalledTimes(1);
    expect(expired.mock.calls[0][0].detail.data.error).toBe('PLAN_EXPIRED');
    window.removeEventListener('mynaai:plan-expired', expired);
  });
});
