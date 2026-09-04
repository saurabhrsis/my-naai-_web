import React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it } from 'vitest';
import { ImageWithFallback, formatDistanceInKm, getDistanceInKm, normalizeDistanceInKm } from './Shared';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

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

describe('ImageWithFallback', () => {
  // jsdom never loads images, so a provided src always renders as-is and the
  // tile treatment is decided purely from which source is resolved.
  function renderImage(props = {}) {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    act(() => { root.render(<ImageWithFallback {...props} />); });
    const img = container.querySelector('img');
    act(() => { root.unmount(); });
    container.remove();
    return img;
  }

  it('letterboxes the brand logo fallback instead of stretching it', () => {
    expect(renderImage({ src: '' }).className).toContain('image-fallback-tile');
    expect(renderImage({ src: '/assets/brand/naai-logo-dark.svg' }).className).toContain('image-fallback-tile');
  });

  it('keeps photo sources filling their frame', () => {
    expect(renderImage({ src: 'salon-photo.jpg' }).className).not.toContain('image-fallback-tile');
    expect(renderImage({ src: '', fallback: '/assets/naai/ad2.jpg' }).className).not.toContain('image-fallback-tile');
  });

  it('loads images lazily but lets a caller opt out', () => {
    expect(renderImage({ src: 'a.jpg' }).getAttribute('loading')).toBe('lazy');
    expect(renderImage({ src: 'a.jpg', loading: 'eager' }).getAttribute('loading')).toBe('eager');
  });
});
