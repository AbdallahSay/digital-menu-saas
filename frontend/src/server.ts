import {
  AngularNodeAppEngine,
  createNodeRequestHandler,
  isMainModule,
  writeResponseToNodeResponse,
} from '@angular/ssr/node';
import express from 'express';
import { join } from 'node:path';
import { request } from 'node:http';
import { request as secureRequest } from 'node:https';
import { gzipSync } from 'node:zlib';
import { secureAssets } from './secure-assets';
import { publicPage, publicOrigin, publicApiOrigin } from './public-menu-server';

// F01 only: this is a reversible local router, never a production hosting decision.
const app = express();
app.disable('x-powered-by');
const angularApp = new AngularNodeAppEngine();
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('Cache-Control', 'no-store');
  next();
});
app.use('/api', (req, res) => {
  // Configured trusted upstream; never derive an origin from Host or forward credentials.
  const upstreamUrl = new URL(publicApiOrigin + req.originalUrl);
  const upstream = (upstreamUrl.protocol === 'https:' ? secureRequest : request)(
    upstreamUrl,
    {
      method: req.method,
      headers: { accept: req.headers.accept ?? '*/*' },
    },
    (response) => {
      res.status(response.statusCode ?? 502);
      if (response.headers['content-type'])
        res.setHeader('Content-Type', response.headers['content-type']);
      response.pipe(res);
    },
  );
  upstream.setTimeout(5000, () => upstream.destroy());
  upstream.on('error', () => {
    if (!res.headersSent)
      res
        .status(502)
        .type('application/problem+json')
        .send({ title: 'API unavailable', status: 502 });
    else res.destroy();
  });
  req.pipe(upstream);
});
app.get('/favicon.ico', (_req, res) => res.status(204).end());
app.get('/m/demo-code', (_req, res) => res.redirect(302, '/r/demo'));
app.get('/robots.txt', (_req, res) =>
  res
    .type('text/plain')
    .send(
      'User-agent: *\nDisallow: /admin\nDisallow: /api/\nSitemap: http://localhost:4000/sitemap.xml\n',
    ),
);
app.get('/sitemap.xml', (_req, res) =>
  res
    .type('application/xml')
    .send(
      '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>http://localhost:4000/r/demo</loc></url></urlset>',
    ),
);

app.use(secureAssets(join(import.meta.dirname, '../browser'), isMainModule(import.meta.url)));

function unavailable(res: express.Response) {
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  res
    .status(503)
    .type('html')
    .send(
      '<!doctype html><html lang="ar" dir="rtl"><head><title>المنيو غير متاح مؤقتًا</title><meta name="robots" content="noindex"></head><body><h1>المنيو غير متاح مؤقتًا</h1></body></html>',
    );
}
async function sendHtml(req: express.Request, res: express.Response, response: Response) {
  for (const [key, value] of response.headers.entries()) {
    if (!['content-length', 'content-encoding', 'set-cookie'].includes(key))
      res.setHeader(key, value);
  }
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Vary', 'Accept-Encoding');
  if (req.acceptsEncodings('gzip', 'identity') === 'gzip') {
    res.setHeader('Content-Encoding', 'gzip');
    res.status(response.status).send(gzipSync(Buffer.from(await response.arrayBuffer())));
  } else await writeResponseToNodeResponse(response, res);
}
app.get('/m/:publicCode', async (req, res) => {
  const page = await publicPage(
    req.params['publicCode'],
    true,
    req.originalUrl.split('?')[1] ?? '',
  );
  if (page.status === 200 && page.menu) {
    // Human-approved reserved demo route: never redirect a real restaurant to fake data.
    if (page.menu.restaurant.slug === 'demo') {
      unavailable(res);
      return;
    }
    res.redirect(302, '/r/' + page.menu.restaurant.slug);
    return;
  }
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  res
    .status(page.status)
    .type('html')
    .send(
      '<!doctype html><html lang="ar" dir="rtl"><head><title>المنيو غير متاح</title><meta name="robots" content="noindex"></head><body><h1>المنيو غير متاح</h1></body></html>',
    );
});
app.get('/r/:slug', async (req, res, next) => {
  if (req.params['slug'] === 'demo') {
    next();
    return;
  }
  const page = await publicPage(req.params['slug'], false, req.originalUrl.split('?')[1] ?? '');
  if (page.status !== 200) res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  try {
    // Fresh request/context per render; never pass cookies, Authorization or Host.
    const request = new Request(
      publicOrigin + '/r/' + encodeURIComponent(req.params['slug']) + '?lang=' + page.language,
    );
    const response = await angularApp.handle(request, page);
    if (!response) {
      unavailable(res);
      return;
    }
    await sendHtml(req, res, response);
  } catch {
    if (!res.headersSent) unavailable(res);
    else res.destroy();
  }
});

app.use((req, res, next) => {
  if (req.path === '/admin') {
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  } else if (!['/', '/r/demo'].includes(req.path)) {
    res.setHeader('X-Robots-Tag', 'noindex');
  }
  angularApp
    .handle(req)
    .then(async (response) => {
      if (!response) return next();
      const acceptEncoding = req.headers['accept-encoding'] || '';
      if (acceptEncoding.includes('gzip')) {
        const text = await response.text();
        const gzipped = gzipSync(text);
        for (const [k, v] of response.headers.entries()) {
          res.setHeader(k, v);
        }
        res.setHeader('Content-Encoding', 'gzip');
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.setHeader('Vary', 'Accept-Encoding');
        res.status(response.status).send(gzipped);
      } else {
        writeResponseToNodeResponse(response, res);
      }
    })
    .catch(next);
});
app.use((_req, res) => {
  res
    .status(404)
    .type('html')
    .send(
      '<!doctype html><html lang="ar" dir="rtl"><head><title>الصفحة غير موجودة</title><meta name="robots" content="noindex"></head><body><h1>الصفحة غير موجودة</h1></body></html>',
    );
});
if (isMainModule(import.meta.url)) {
  if (process.env['F01_LOCAL_ONLY'] !== '1')
    throw new Error(
      'F01 local router requires F01_LOCAL_ONLY=1; production hosting is unresolved.',
    );
  const port = Number(process.env['PORT'] ?? 4000);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw Error('Invalid local SSR port');
  app.listen(port, '127.0.0.1', () => console.log('Local SSR listening'));
}
export const reqHandler = createNodeRequestHandler(app);
