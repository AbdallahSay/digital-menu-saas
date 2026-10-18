// F09 wire DTOs. Prices are JSON numbers backed by SQL decimal(18,2).
export interface PublicItem {
  id: string;
  name: string;
  description: string;
  price: number;
}
export interface PublicCategory {
  id: string;
  name: string;
  items: PublicItem[];
}
export interface PublicMenu {
  restaurant: { name: string; slug: string; primaryColor: string; currency: string };
  language: 'ar' | 'en';
  publishedMenuVersion: number;
  categories: PublicCategory[];
}
export type DisplayMenu = Omit<PublicMenu, 'categories'> & {
  categories: (Omit<PublicCategory, 'items'> & { items: (PublicItem & { priceText: string })[] })[];
};
export interface PublicPage {
  slug: string;
  language: 'ar' | 'en';
  status: 200 | 400 | 404 | 503;
  publicOrigin: string;
  menu: DisplayMenu | null;
}
export const validSlug = (value: string) =>
  /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value) && value.length <= 100;
export const validCode = (value: string) => /^[a-f0-9]{20}$/.test(value);

export async function readMenu(
  response: Response,
  language: 'ar' | 'en',
  expectedSlug?: string,
): Promise<DisplayMenu> {
  if (!response.headers.get('content-type')?.startsWith('application/json') || !response.body) {
    await response.body?.cancel();
    throw Error('Invalid public menu');
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.length;
    if (length > 16 * 1024 * 1024) {
      await reader.cancel();
      throw Error('Invalid public menu');
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return decodeMenu(
    new TextDecoder('utf-8', { fatal: true }).decode(bytes),
    language,
    expectedSlug,
  );
}

// Project an explicit allowlist; never serialize arbitrary upstream properties.
// Preserve decimal price lexemes for display (JS numbers alone lose high-value cents).
export function decodeMenu(
  text: string,
  language: 'ar' | 'en',
  expectedSlug?: string,
): DisplayMenu {
  const raw = JSON.parse(text);
  const precise = JSON.parse(
    text.replace(/"(?:\\.|[^"\\])*"|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/g, (token) =>
      token.startsWith('"') ? token : JSON.stringify(token),
    ),
  );
  const string = (value: unknown, max: number, empty = false): string => {
    if (typeof value !== 'string' || value.length > max || (!empty && !value.trim()))
      throw Error('Invalid public menu');
    return value;
  };
  const id = (value: unknown) => {
    const result = string(value, 36);
    if (!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(result))
      throw Error('Invalid public menu');
    return result;
  };
  if (
    !raw ||
    raw.language !== language ||
    !Number.isSafeInteger(raw.publishedMenuVersion) ||
    raw.publishedMenuVersion < 1 ||
    !raw.restaurant ||
    !Array.isArray(raw.categories) ||
    raw.categories.length > 100
  )
    throw Error('Invalid public menu');
  const slug = string(raw.restaurant.slug, 100);
  if (
    !validSlug(slug) ||
    (expectedSlug && expectedSlug !== slug) ||
    raw.restaurant.currency !== 'EGP' ||
    !/^#[a-f0-9]{6}$/i.test(raw.restaurant.primaryColor)
  )
    throw Error('Invalid public menu');
  let count = 0;
  const categories = raw.categories.map((category: PublicCategory, ci: number) => {
    if (!category || !Array.isArray(category.items) || (count += category.items.length) > 1000)
      throw Error('Invalid public menu');
    return {
      id: id(category.id),
      name: string(category.name, 150),
      items: category.items.map((item: PublicItem, ii: number) => {
        const price = precise.categories[ci].items[ii].price;
        if (
          !item ||
          typeof item.price !== 'number' ||
          !Number.isFinite(item.price) ||
          typeof price !== 'string' ||
          !/^\d{1,16}(?:\.\d{1,2})?$/.test(price)
        )
          throw Error('Invalid public menu');
        const [whole, fraction = ''] = price.split('.');
        return {
          id: id(item.id),
          name: string(item.name, 150),
          description: string(item.description, 2000, true),
          price: item.price,
          priceText: whole + '.' + fraction.padEnd(2, '0'),
        };
      }),
    };
  });
  return {
    restaurant: {
      name: string(raw.restaurant.name, 150),
      slug,
      primaryColor: raw.restaurant.primaryColor,
      currency: 'EGP',
    },
    language,
    publishedMenuVersion: raw.publishedMenuVersion,
    categories,
  };
}
