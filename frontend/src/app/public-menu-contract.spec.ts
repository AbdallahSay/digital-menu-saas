import { decodeMenu, readMenu } from './public-menu-contract';
const menu = {
  restaurant: { name: 'Public', slug: 'a', primaryColor: '#123456', currency: 'EGP' },
  language: 'ar',
  publishedMenuVersion: 1,
  categories: [
    {
      id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      name: 'Category',
      items: [
        { id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', name: 'Item', description: '', price: 12.5 },
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
});
