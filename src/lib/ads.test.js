import { describe, expect, it } from 'vitest';
import { normalizeAdImages } from './ads';

describe('normalizeAdImages', () => {
  it('reads the mobile app shape of data.images as strings', () => {
    expect(normalizeAdImages({ status: 'SUCCESS', data: { images: ['ads/one.jpg', 'ads/two.png'] } })).toEqual([
      'ads/one.jpg',
      'ads/two.png',
    ]);
  });

  it('accepts objects with imageUrl and ignores empty entries', () => {
    expect(normalizeAdImages({
      data: {
        images: [
          { imageUrl: 'promo/a.jpg' },
          { url: '' },
          { src: 'promo/b.jpg' },
          null,
        ],
      },
    })).toEqual(['promo/a.jpg', 'promo/b.jpg']);
  });

  it('returns an empty list when the advertisement payload is missing', () => {
    expect(normalizeAdImages(null)).toEqual([]);
    expect(normalizeAdImages({ status: 'SUCCESS', data: {} })).toEqual([]);
  });
});
