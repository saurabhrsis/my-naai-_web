import { describe, it, expect, vi, beforeEach } from 'vitest';

// Avoid importing the whole network chain; test the token helpers that back the
// service-worker auth mirror and the session shape used across the app.
import { getToken, setToken, getServerUrl } from './api';

beforeEach(() => {
  localStorage.clear();
  window.indexedDB = { open: vi.fn() };
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
