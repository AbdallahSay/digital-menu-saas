import type { DisplayMenu } from './public-menu-contract';

export interface RestaurantJsonLd {
  '@context': 'https://schema.org';
  '@type': 'Restaurant';
  name: string;
  url: string;
  menu: string;
}

export function buildCanonicalUrl(publicOrigin: string, slug: string): string {
  return `${publicOrigin}/r/${slug}`;
}

export function buildRestaurantTitle(
  menu: DisplayMenu | null,
  errorTitle: string,
  english: boolean,
): string {
  if (!menu) return errorTitle;
  return `${menu.restaurant.name} | ${english ? 'Menu' : 'المنيو'}`;
}

export function buildRestaurantDescription(
  menu: DisplayMenu | null,
  errorTitle: string,
  english: boolean,
): string {
  if (!menu) return errorTitle;
  const cleanName = menu.restaurant.name.trim();
  if (menu.categories.length === 0) {
    return english
      ? `Digital menu for ${cleanName}. The menu is currently empty.`
      : `قائمة طعام ${cleanName} الرقمية. المنيو فارغ حاليًا.`;
  }
  const catNames = menu.categories.map((c) => c.name.trim()).filter((n) => n.length > 0);
  if (english) {
    const catList = catNames.join(', ');
    const text = `Digital menu for ${cleanName}. Browse items and prices: ${catList}.`;
    return truncateDescription(text, 160);
  } else {
    const catList = catNames.join('، ');
    const text = `قائمة طعام ${cleanName} الرقمية. تصفح الأصناف والأسعار: ${catList}.`;
    return truncateDescription(text, 160);
  }
}

function truncateDescription(text: string, maxLength: number): string {
  const singleLine = text
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
  if (singleLine.length <= maxLength) return singleLine;
  return singleLine.slice(0, maxLength - 1).trimEnd() + '…';
}

export function buildRestaurantJsonLd(menu: DisplayMenu, canonicalUrl: string): RestaurantJsonLd {
  return {
    '@context': 'https://schema.org',
    '@type': 'Restaurant',
    name: menu.restaurant.name,
    url: canonicalUrl,
    menu: canonicalUrl,
  };
}

export function serializeJsonLd(data: unknown): string {
  return JSON.stringify(data)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}
