import { readMenu, validCode, validSlug, type PublicPage } from './app/public-menu-contract';

function origin(value: string, internal = false): string {
  const url = new URL(value);
  if (
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash ||
    (url.protocol !== 'https:' &&
      !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)))
  )
    throw Error(internal ? 'Invalid internal API origin' : 'Invalid public origin');
  return url.origin;
}
// Configuration only, never derived from Host or incoming credentials.
export const publicOrigin = origin(process.env['PUBLIC_ORIGIN'] ?? 'http://localhost:4000');
export const publicApiOrigin = origin(
  process.env['PUBLIC_API_ORIGIN'] ?? 'http://127.0.0.1:5080',
  true,
);
export async function publicPage(
  identifier: string,
  byCode: boolean,
  query: string,
): Promise<PublicPage> {
  const params = new URLSearchParams(query);
  const languages = params.getAll('lang');
  const language = languages[0] === 'en' ? 'en' : 'ar';
  const page: PublicPage = {
    slug: byCode ? '' : identifier,
    language,
    publicOrigin,
    status: 400,
    menu: null,
  };
  if (
    !(byCode ? validCode(identifier) : validSlug(identifier)) ||
    languages.length > 1 ||
    (languages.length === 1 && !['ar', 'en'].includes(languages[0]))
  )
    return page;
  try {
    const path = byCode ? '/api/v1/public/menus/' : '/api/v1/public/restaurants/by-slug/';
    const response = await fetch(publicApiOrigin + path + identifier + '?lang=' + language, {
      headers: { Accept: 'application/json' },
      credentials: 'omit',
      redirect: 'error',
      signal: AbortSignal.timeout(5000),
    });
    if (response.status !== 200) {
      await response.body?.cancel();
      page.status = response.status === 404 ? 404 : response.status === 400 ? 400 : 503;
      return page;
    }
    page.menu = await readMenu(response, language, byCode ? undefined : identifier);
    page.slug = page.menu.restaurant.slug;
    page.status = 200;
  } catch {
    page.status = 503;
    page.menu = null;
  }
  return page;
}
