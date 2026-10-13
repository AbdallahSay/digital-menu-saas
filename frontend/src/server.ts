import {
  AngularNodeAppEngine,
  createNodeRequestHandler,
  isMainModule,
  writeResponseToNodeResponse,
} from '@angular/ssr/node';
import express from 'express';
import { join, resolve, sep } from 'node:path';
import { request } from 'node:http';
import { gzipSync } from 'node:zlib';
import { readFileSync, realpathSync } from 'node:fs';

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

const compressionCache = new Map<string, { buffer: Buffer; contentType: string }>();

// Root-bounded for path traversal safety — resolved once at startup.
const browserRoot = resolve(import.meta.dirname, '../browser');

// High-performance compressed static asset delivery
app.use((req, res, next) => {
  const acceptEncoding = req.headers['accept-encoding'] || '';
  if (!acceptEncoding.includes('gzip')) return next();

  // Reject any path that does not remain inside browserRoot after normalisation.
  // resolve(root, '.' + path) prevents absolute-path override (e.g. /etc/passwd).
  const requestedPath = resolve(browserRoot, '.' + req.path);
  let realPath: string | null = null;
  try {
    realPath = realpathSync(requestedPath);
  } catch {
    // File does not exist or is otherwise inaccessible — fall through.
    return next();
  }
  // sep boundary ensures /browser-prefix-extra doesn't pass the prefix check.
  if (!realPath.startsWith(browserRoot + sep)) return next();

  if (!/\.(js|css|html|svg|json)$/.test(req.path)) return next();

  let cached = compressionCache.get(realPath);
  if (!cached) {
    const content = readFileSync(realPath);
    const buffer = gzipSync(content);
    const ext = req.path.split('.').pop();
    const contentType =
      ext === 'js'
        ? 'text/javascript; charset=utf-8'
        : ext === 'css'
          ? 'text/css; charset=utf-8'
          : ext === 'html'
            ? 'text/html; charset=utf-8'
            : ext === 'svg'
              ? 'image/svg+xml'
              : 'application/json';
    cached = { buffer, contentType };
    compressionCache.set(realPath, cached);
  }
  res.setHeader('Content-Encoding', 'gzip');
  res.setHeader('Content-Type', cached.contentType);
  res.setHeader('Vary', 'Accept-Encoding');
  if (
    req.path.startsWith('/chunk-') ||
    req.path.startsWith('/main-') ||
    req.path.startsWith('/styles-')
  ) {
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  }
  return res.send(cached.buffer);
});

app.use(
  '/fonts',
  express.static(join(import.meta.dirname, '../browser/fonts'), {
    index: false,
    redirect: false,
    setHeaders: (res) => {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    },
  }),
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
  app.listen(4000, '127.0.0.1', () => console.log('F01 local SSR: http://localhost:4000'));
}
export const reqHandler = createNodeRequestHandler(app);
