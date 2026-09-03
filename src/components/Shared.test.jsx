import { describe, expect, it } from 'vitest';
import { formatDistanceInKm, getDistanceInKm, normalizeDistanceInKm } from './Shared';

describe('distance helpers', () => {
  it('allows valid zero coordinates but rejects missing coordinates', () => {
    expect(getDistanceInKm(0, 0, 1, 1)).toBeGreaterThan(0);
    expect(getDistanceInKm(18, 73, '', 0)).toBeNull();
  });

  it('does not treat a server placeholder zero as a reported distance', () => {
    expect(normalizeDistanceInKm(0)).toBeNull();
    expect(normalizeDistanceInKm('0 km')).toBeNull();
    expect(normalizeDistanceInKm('2.5 km')).toBe(2.5);
    expect(normalizeDistanceInKm('50 m')).toBe(0.05);
  });

  it('formats a genuinely calculated near-zero distance without showing 0 km', () => {
    expect(formatDistanceInKm(0)).toBe('< 0.1 km');
    expect(formatDistanceInKm(getDistanceInKm(18, 73, 18.0005, 73))).toBe('< 0.1 km');
    expect(formatDistanceInKm(2.46)).toBe('2.5 km');
  });
});
