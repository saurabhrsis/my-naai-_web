import { describe, it, expect, vi, beforeEach } from 'vitest';

// Avoid importing the whole network chain; test the token helpers that back the
// service-worker auth mirror and the session shape used across the app.
import { api, getFileUrl, getToken, setToken, getServerUrl, resetPlanExpiredAlert } from './api';

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

describe('getFileUrl', () => {
  it('builds the mobile app’s /getFiles path for a bare upload path', () => {
    expect(getFileUrl('ads/banner.jpg').endsWith('/getFiles/ads/banner.jpg')).toBe(true);
  });

  // Ads come back as `/public/uploads/<file>.jpg`. Prefixing only absolute-path
  // inputs used to hand back `https://backend.mynaai.in/public/uploads/…`, which
  // the backend does not serve, so every carousel image 404’d.
  it('routes a leading-slash upload path through /getFiles', () => {
    const url = getFileUrl('/public/uploads/1786449506315-698102274.jpg');
    expect(url.endsWith('/getFiles/public/uploads/1786449506315-698102274.jpg')).toBe(true);
    expect(url).not.toMatch(/getFiles\/+getFiles/);
    expect(url.replace(/^https?:\/\//, '')).not.toContain('//');
  });

  it('keeps the exact case-sensitive route spelling and never doubles it', () => {
    expect(getFileUrl('/getFiles/ads/one.jpg').endsWith('/getFiles/ads/one.jpg')).toBe(true);
    expect(getFileUrl('/getfiles/ads/one.jpg').endsWith('/getFiles/ads/one.jpg')).toBe(true);
    expect(getFileUrl('getFiles/ads/one.jpg').endsWith('/getFiles/ads/one.jpg')).toBe(true);
  });

  it('repairs an absolute backend URL that skipped the route', () => {
    expect(getFileUrl('https://backend.mynaai.in/public/uploads/1786449506315-698102274.jpg'))
      .toBe('https://backend.mynaai.in/getFiles/public/uploads/1786449506315-698102274.jpg');
    expect(getFileUrl('https://backend.mynaai.in/getFiles/public/uploads/a.jpg'))
      .toBe('https://backend.mynaai.in/getFiles/public/uploads/a.jpg');
  });

  it('keeps foreign absolute URLs and local asset paths unchanged', () => {
    expect(getFileUrl('https://cdn.example/ad.jpg')).toBe('https://cdn.example/ad.jpg');
    expect(getFileUrl('/assets/brand/naai-logo-dark.svg')).toBe('/assets/brand/naai-logo-dark.svg');
  });

  it('returns an empty string for empty or prefix-only values', () => {
    expect(getFileUrl('')).toBe('');
    expect(getFileUrl('   ')).toBe('');
    expect(getFileUrl('/getFiles/')).toBe('');
    expect(getFileUrl(null)).toBe('');
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
