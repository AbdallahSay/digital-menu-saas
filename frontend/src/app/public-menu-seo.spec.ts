import {
  buildCanonicalUrl,
  buildRestaurantTitle,
  buildRestaurantDescription,
  buildRestaurantJsonLd,
  serializeJsonLd,
} from './public-menu-seo';
import type { DisplayMenu } from './public-menu-contract';

const fixtureA: DisplayMenu = {
  restaurant: {
    name: 'مطعم ألف <script>globalThis.s01Canary=true</script>',
    slug: 's01-a',
    primaryColor: '#123456',
    currency: 'EGP',
  },
  language: 'ar',
  publishedMenuVersion: 1,
  categories: [
    {
      id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      name: 'قسم سابق',
      items: [
        {
          id: '11111111-1111-1111-1111-111111111111',
          name: 'صنف أول',
          description: 'وصف بديل',
          price: 12.5,
          priceText: '12.50',
        },
      ],
    },
    {
      id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
      name: 'قسم ألف',
      items: [
        {
          id: '22222222-2222-2222-2222-222222222222',
          name: 'صنف ألف',
          description: '</script><script>globalThis.s01Canary=true</script>',
          price: 99.99,
          priceText: '99.99',
        },
      ],
    },
  ],
};

const fixtureEmpty: DisplayMenu = {
  restaurant: {
    name: 'مطعم فارغ',
    slug: 's01-empty',
    primaryColor: '#654321',
    currency: 'EGP',
  },
  language: 'ar',
  publishedMenuVersion: 1,
  categories: [],
};

describe('S02-I01 Restaurant SEO & JSON-LD Metadata', () => {
  describe('buildCanonicalUrl', () => {
    it('produces single canonical Arabic menu URL without query parameters', () => {
      expect(buildCanonicalUrl('https://example.com', 's01-a')).toBe('https://example.com/r/s01-a');
      expect(buildCanonicalUrl('http://localhost:4000', 'demo')).toBe(
        'http://localhost:4000/r/demo',
      );
    });
  });

  describe('buildRestaurantTitle', () => {
    it('returns unique, relevant title for Arabic and English', () => {
      expect(buildRestaurantTitle(fixtureA, 'المنيو غير متاح', false)).toBe(
        'مطعم ألف <script>globalThis.s01Canary=true</script> | المنيو',
      );
      expect(buildRestaurantTitle(fixtureA, 'Menu unavailable', true)).toBe(
        'مطعم ألف <script>globalThis.s01Canary=true</script> | Menu',
      );
    });

    it('returns error title when menu is null', () => {
      expect(buildRestaurantTitle(null, 'المنيو مش موجود', false)).toBe('المنيو مش موجود');
      expect(buildRestaurantTitle(null, 'Menu not found', true)).toBe('Menu not found');
    });
  });

  describe('buildRestaurantDescription', () => {
    it('builds truthful Arabic meta description with categories', () => {
      const desc = buildRestaurantDescription(fixtureA, 'المنيو غير متاح', false);
      expect(desc).toContain(fixtureA.restaurant.name);
      expect(desc).toContain('قسم سابق');
      expect(desc).toContain('قسم ألف');
      expect(desc.length).toBeGreaterThan(15);
      expect(desc.length).toBeLessThanOrEqual(200);
      expect(desc).not.toMatch(/[\r\n\t]/);
    });

    it('builds truthful English meta description', () => {
      const desc = buildRestaurantDescription(fixtureA, 'Menu unavailable', true);
      expect(desc).toContain(fixtureA.restaurant.name);
      expect(desc).toContain('Digital menu for');
      expect(desc.length).toBeGreaterThan(15);
      expect(desc.length).toBeLessThanOrEqual(200);
      expect(desc).not.toMatch(/[\r\n\t]/);
    });

    it('truthfully handles empty menu in Arabic and English', () => {
      const descAr = buildRestaurantDescription(fixtureEmpty, 'المنيو غير متاح', false);
      expect(descAr).toContain('مطعم فارغ');
      expect(descAr).toContain('فارغ');

      const descEn = buildRestaurantDescription(fixtureEmpty, 'Menu unavailable', true);
      expect(descEn).toContain('مطعم فارغ');
      expect(descEn).toContain('empty');
    });

    it('returns error title when menu is null', () => {
      expect(buildRestaurantDescription(null, 'رابط المنيو غير صحيح', false)).toBe(
        'رابط المنيو غير صحيح',
      );
      expect(buildRestaurantDescription(null, 'Invalid menu link', true)).toBe('Invalid menu link');
    });
  });

  describe('buildRestaurantJsonLd', () => {
    it('creates truthful minimal Schema.org Restaurant structured data', () => {
      const canonical = 'https://example.com/r/s01-a';
      const jsonLd = buildRestaurantJsonLd(fixtureA, canonical);

      expect(jsonLd['@context']).toBe('https://schema.org');
      expect(jsonLd['@type']).toBe('Restaurant');
      expect(jsonLd.name).toBe(fixtureA.restaurant.name);
      expect(jsonLd.url).toBe(canonical);
      expect(jsonLd.menu).toBe(canonical);

      // Never fabricate unverified or private fields
      const record = jsonLd as unknown as Record<string, unknown>;
      expect(record['telephone']).toBeUndefined();
      expect(record['address']).toBeUndefined();
      expect(record['aggregateRating']).toBeUndefined();
      expect(record['review']).toBeUndefined();
      expect(record['openingHoursSpecification']).toBeUndefined();
      expect(record['image']).toBeUndefined();
      expect(record['servesCuisine']).toBeUndefined();
      expect(record['restaurantId']).toBeUndefined();
      expect(record['userId']).toBeUndefined();
      expect(record['objectKey']).toBeUndefined();
    });
  });

  describe('serializeJsonLd', () => {
    it('safely serializes JSON-LD preventing </script> and script breakouts', () => {
      const canonical = 'https://example.com/r/s01-a';
      const jsonLd = buildRestaurantJsonLd(fixtureA, canonical);
      const serialized = serializeJsonLd(jsonLd);

      // Must NOT contain raw angle brackets or script tag
      expect(serialized).not.toContain('<script');
      expect(serialized).not.toContain('</script');
      expect(serialized).not.toContain('<');
      expect(serialized).not.toContain('>');

      // Must be valid JSON that parses cleanly
      const parsed = JSON.parse(serialized);
      expect(parsed['@context']).toBe('https://schema.org');
      expect(parsed['@type']).toBe('Restaurant');
      expect(parsed.name).toBe(fixtureA.restaurant.name);
      expect(parsed.url).toBe(canonical);
      expect(parsed.menu).toBe(canonical);
    });

    it('neutralizes malicious Unicode separators U+2028 and U+2029', () => {
      const malicious = {
        name: 'مطعم \u2028 فاصل أسطر \u2029 فاصل فقرات',
      };
      const serialized = serializeJsonLd(malicious);
      expect(serialized).not.toContain('\u2028');
      expect(serialized).not.toContain('\u2029');
      expect(serialized).toContain('\\u2028');
      expect(serialized).toContain('\\u2029');

      const parsed = JSON.parse(serialized);
      expect(parsed.name).toBe('مطعم \u2028 فاصل أسطر \u2029 فاصل فقرات');
    });
  });
});
