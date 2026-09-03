import { describe, it, expect, vi, beforeEach } from 'vitest';
import { vibrate, isBuzzerSupported, unlockBuzzer, playBuzzer } from './buzzer';

beforeEach(() => {
  window.navigator.vibrate = vi.fn(() => true);
  global.fetch = vi.fn(() => Promise.resolve({
    ok: true, arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)),
  }));
});

describe('vibrate', () => {
  it('issues navigator.vibrate when available', () => {
    expect(vibrate([100, 50])).toBe(true);
    expect(window.navigator.vibrate).toHaveBeenCalledWith([100, 50]);
  });

  it('returns false when vibrate is not a function', () => {
    window.navigator.vibrate = undefined;
    expect(vibrate()).toBe(false);
  });
});

describe('isBuzzerSupported', () => {
  it('is true when an AudioContext exists', () => {
    expect(isBuzzerSupported()).toBe(true);
  });
});

describe('playBuzzer', () => {
  it('returns true and vibrates', () => {
    const result = playBuzzer({ type: 'BOOKING_REQUEST' });
    expect(result).toBe(true);
    expect(window.navigator.vibrate).toHaveBeenCalled();
  });
});

describe('unlockBuzzer', () => {
  it('preloads without throwing', () => {
    expect(() => unlockBuzzer()).not.toThrow();
  });
});
