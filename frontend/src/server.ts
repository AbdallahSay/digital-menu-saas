import {
  AngularNodeAppEngine,
  createNodeRequestHandler,
  isMainModule,
  writeResponseToNodeResponse,
} from '@angular/ssr/node';
import express from 'express';
import { join } from 'node:path';
import { request } from 'node:http';

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
  // Fixed loopback upstream; never use client Host/URL as an upstream or forward credentials.
  const upstream = request(
    {
      hostname: '127.0.0.1',
      port: 5080,
      path: req.originalUrl,
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
app.use(
  express.static(join(import.meta.dirname, '../browser'), {
    index: false,
    redirect: false,
    maxAge: 0,
  }),
);
app.use((req, res, next) => {
  if (req.path === '/admin') {
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  } else if (!['/', '/r/demo'].includes(req.path)) {
    res.setHeader('X-Robots-Tag', 'noindex');
  }
  angularApp
    .handle(req)
    .then((response) => (response ? writeResponseToNodeResponse(response, res) : next()))
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
  app.listen(4000, '127.0.0.1', () => console.log('F01 local SSR: http://localhost:4000'));
}
export const reqHandler = createNodeRequestHandler(app);
