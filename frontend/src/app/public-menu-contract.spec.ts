import { decodeMenu, readMenu } from './public-menu-contract';
const menu = {
  restaurant: {
    name: 'Public',
    slug: 'a',
    primaryColor: '#123456',
    currency: 'EGP',
    logoUrl: '/api/v1/public/media/logo/0123456789abcdef0123',
  },
  language: 'ar',
  publishedMenuVersion: 1,
  categories: [
    {
      id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      name: 'Category',
      items: [
        {
          id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
          name: 'Item',
          description: '',
          price: 12.5,
          image: {
            url: '/api/v1/public/media/items/cccccccc-cccc-cccc-cccc-cccccccccccc/main',
            thumbnailUrl:
              '/api/v1/public/media/items/cccccccc-cccc-cccc-cccc-cccccccccccc/thumbnail',
            alt: 'طبق',
            width: 800,
            height: 600,
          },
        },
      ],
    },
  ],
};
describe('F09 safe display projection', () => {
  it('requires JSON content and bounds streamed upstream responses', async () => {
    await expect(readMenu(new Response('private error'), 'ar')).rejects.toThrow();
    await expect(
      readMenu(
        new Response('x'.repeat(16 * 1024 * 1024 + 1), {
          headers: { 'Content-Type': 'application/json' },
        }),
        'ar',
      ),
    ).rejects.toThrow();
  });
  it('allowlists fields and preserves all decimal(18,2) cents', () => {
    const input = JSON.stringify({ ...menu, privateToken: 'secret' }).replace(
      '12.5',
      '9999999999999999.99',
    );
    const result = decodeMenu(input, 'ar', 'a');
    expect(JSON.stringify(result)).not.toContain('secret');
    expect(result.categories[0].items[0].priceText).toBe('9999999999999999.99');
  });
  it('rejects malformed or mismatched locale/tenant/redirect shapes', () => {
    for (const value of [
      null,
      {},
      { ...menu, language: 'en' },
      { ...menu, restaurant: { ...menu.restaurant, slug: '//evil.example' } },
      {
        ...menu,
        categories: [
          { ...menu.categories[0], items: [{ ...menu.categories[0].items[0], price: '12.5' }] },
        ],
      },
    ])
      expect(() => decodeMenu(JSON.stringify(value), 'ar', 'a')).toThrow();
    expect(() => decodeMenu(JSON.stringify(menu), 'ar', 'b')).toThrow();
  });

  it('accepts null media fields and preserves a valid logo and item image', () => {
    const noMedia = JSON.parse(JSON.stringify(menu));
    noMedia.restaurant.logoUrl = null;
    noMedia.categories[0].items[0].image = null;
    const bare = decodeMenu(JSON.stringify(noMedia), 'ar', 'a');
    expect(bare.restaurant.logoUrl).toBeNull();
    expect(bare.categories[0].items[0].image).toBeNull();
    const withMedia = decodeMenu(JSON.stringify(menu), 'ar', 'a');
    expect(withMedia.restaurant.logoUrl).toBe(menu.restaurant.logoUrl);
    expect(withMedia.categories[0].items[0].image?.url).toBe(menu.categories[0].items[0].image.url);
  });

  it('rejects media URLs outside the server-built opaque patterns', () => {
    const withLogo = (logoUrl: unknown) => ({
      ...menu,
      restaurant: { ...menu.restaurant, logoUrl },
    });
    const withImage = (image: unknown) => ({
      ...menu,
      categories: [{ ...menu.categories[0], items: [{ ...menu.categories[0].items[0], image }] }],
    });
    for (const value of [
      // Absolute or cross-origin logo URLs can never leave the decoder.
      withLogo('https://evil.example/logo.webp'),
      withLogo('/api/v1/admin/settings/logo'),
      withLogo('/api/v1/public/media/logo/SHORT'),
      withLogo(42),
      // Item images: wrong variant pair, mismatched ids, absolute URL,
      // oversized alt, out-of-range dimensions.
      withImage({ ...menu.categories[0].items[0].image, url: 'https://evil.example/x' }),
      withImage({
        ...menu.categories[0].items[0].image,
        thumbnailUrl: '/api/v1/public/media/items/cccccccc-cccc-cccc-cccc-cccccccccccc/main',
      }),
      withImage({
        ...menu.categories[0].items[0].image,
        thumbnailUrl: '/api/v1/public/media/items/dddddddd-dddd-dddd-dddd-dddddddddddd/thumbnail',
      }),
      withImage({ ...menu.categories[0].items[0].image, alt: 'x'.repeat(301) }),
      withImage({ ...menu.categories[0].items[0].image, width: 0 }),
      withImage({ ...menu.categories[0].items[0].image, height: 4097 }),
      withImage({ ...menu.categories[0].items[0].image, width: 800.5 }),
      withImage('image'),
    ])
      expect(() => decodeMenu(JSON.stringify(value), 'ar', 'a')).toThrow();
  });
});
