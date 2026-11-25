// F09 wire DTOs. Prices are JSON numbers backed by SQL decimal(18,2).
export interface PublicItemImage {
  url: string;
  thumbnailUrl: string;
  alt: string;
  width: number;
  height: number;
}
export interface PublicItem {
  id: string;
  name: string;
  description: string;
  price: number;
  image: PublicItemImage | null;
  featured: boolean;
}
export interface PublicCategory {
  id: string;
  name: string;
  items: PublicItem[];
}
export interface PublicMenu {
  restaurant: {
    name: string;
    slug: string;
    primaryColor: string;
    currency: string;
    logoUrl: string | null;
    theme: 'classic' | 'cafe';
    brandLabel: string | null;
    tagline: string | null;
  };
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
  // Optional presentation text: absent or null from an older API means none.
  const optional = (value: unknown, max: number): string | null =>
    value === undefined || value === null ? null : string(value, max);
  const id = (value: unknown) => {
    const result = string(value, 36);
    if (!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(result))
      throw Error('Invalid public menu');
    return result;
  };
  // Media URLs are server-built relative paths under the opaque public media
  // origin only - anything else (absolute URLs, other paths) is rejected so a
  // compromised or buggy upstream can never turn the menu into an image
  // request to an arbitrary host.
  const logoUrl = (value: unknown): string | null => {
    if (value === null) return null;
    const result = string(value, 60);
    if (!/^\/api\/v1\/public\/media\/logo\/[a-f0-9]{20}$/.test(result))
      throw Error('Invalid public menu');
    return result;
  };
  const image = (value: unknown): PublicItemImage | null => {
    if (value === null) return null;
    const candidate = value as PublicItemImage;
    const pattern =
      /^\/api\/v1\/public\/media\/items\/([a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12})\/(main|thumbnail)$/;
    const url = typeof candidate?.url === 'string' ? pattern.exec(candidate.url) : null;
    const thumbnail =
      typeof candidate?.thumbnailUrl === 'string' ? pattern.exec(candidate.thumbnailUrl) : null;
    if (
      !url ||
      url[2] !== 'main' ||
      !thumbnail ||
      thumbnail[2] !== 'thumbnail' ||
      url[1] !== thumbnail[1] ||
      typeof candidate.alt !== 'string' ||
      candidate.alt.length > 300 ||
      !Number.isSafeInteger(candidate.width) ||
      candidate.width < 1 ||
      candidate.width > 4096 ||
      !Number.isSafeInteger(candidate.height) ||
      candidate.height < 1 ||
      candidate.height > 4096
    )
      throw Error('Invalid public menu');
    return {
      url: candidate.url,
      thumbnailUrl: candidate.thumbnailUrl,
      alt: candidate.alt,
      width: candidate.width,
      height: candidate.height,
    };
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
          image: image(item.image),
          featured: item.featured === true,
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
      logoUrl: logoUrl(raw.restaurant.logoUrl),
      theme: raw.restaurant.theme === 'cafe' ? 'cafe' : 'classic',
      brandLabel: optional(raw.restaurant.brandLabel, 40),
      tagline: optional(raw.restaurant.tagline, 120),
    },
    language,
    publishedMenuVersion: raw.publishedMenuVersion,
    categories,
  };
}
