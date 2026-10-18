import { inject, REQUEST_CONTEXT, RESPONSE_INIT, TransferState, makeStateKey } from '@angular/core';
import type { ResolveFn } from '@angular/router';
import { readMenu, validSlug, type PublicPage } from './public-menu-contract';

export const resolvePublicMenu: ResolveFn<PublicPage> = async (route) => {
  const slug = route.paramMap.get('slug') ?? '';
  const language = route.queryParamMap.get('lang') === 'en' ? 'en' : 'ar';
  const originKey = makeStateKey<string>('public-origin');
  const key = makeStateKey<PublicPage>('public-menu:' + slug + ':' + language);
  const transfer = inject(TransferState);
  const context = inject(REQUEST_CONTEXT, { optional: true }) as PublicPage | null;
  const response = inject(RESPONSE_INIT, { optional: true });
  if (context) {
    if (response) response.status = context.status;
    transfer.set(originKey, context.publicOrigin);
    transfer.set(key, context);
    return context;
  }
  if (transfer.hasKey(key)) {
    const page = transfer.get(key, null!);
    transfer.remove(key);
    return page;
  }
  const page: PublicPage = {
    slug,
    language,
    publicOrigin: transfer.get(originKey, location.origin),
    status: 503,
    menu: null,
  };
  const languages = route.queryParamMap.getAll('lang');
  if (
    !validSlug(slug) ||
    languages.length > 1 ||
    (languages.length === 1 && !['ar', 'en'].includes(languages[0]))
  ) {
    page.status = 400;
    return page;
  }
  try {
    const result = await fetch(
      '/api/v1/public/restaurants/by-slug/' + encodeURIComponent(slug) + '?lang=' + language,
      { credentials: 'omit', redirect: 'error', signal: AbortSignal.timeout(5000) },
    );
    if (result.status !== 200) {
      await result.body?.cancel();
      page.status = result.status === 404 ? 404 : result.status === 400 ? 400 : 503;
      return page;
    }
    page.menu = await readMenu(result, language, slug);
    page.status = 200;
  } catch {
    /* Generic temporary failure; never fake an empty menu. */
  }
  return page;
};
