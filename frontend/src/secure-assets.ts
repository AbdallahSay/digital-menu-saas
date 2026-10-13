import type { RequestHandler } from 'express';
import { extname, join, relative, resolve, sep } from 'node:path';
import {
  closeSync,
  constants,
  fstatSync,
  lstatSync,
  openSync,
  readFileSync,
  readdirSync,
  realpathSync,
} from 'node:fs';
import { gzipSync } from 'node:zlib';

// Read trusted build assets once before listening; requests never open filesystem
// paths. Runtime symlink/rename swaps cannot alter the validated snapshot.
export function secureAssets(root: string, preload = true): RequestHandler {
  let browserRoot = resolve(root);
  const assets = new Map<string, { content: Buffer; gzip?: Buffer; type: string }>();
  const types: Record<string, string> = {
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.html': 'text/html; charset=utf-8',
    '.json': 'application/json',
    '.svg': 'image/svg+xml',
    '.woff2': 'font/woff2',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.txt': 'text/plain; charset=utf-8',
    '.ico': 'image/x-icon',
  };
  let snapshotBytes = 0;
  function snapshotDirectory(directory: string) {
    // Linux directory descriptors anchor children against ancestor rename races.
    const fd = openSync(
      directory,
      constants.O_RDONLY | (constants.O_DIRECTORY ?? 0) | (constants.O_NOFOLLOW ?? 0),
    );
    try {
      const anchored = process.platform === 'linux' ? `/proc/self/fd/${fd}` : directory;
      const canonical = realpathSync(anchored);
      if (canonical !== browserRoot && !canonical.startsWith(browserRoot + sep))
        throw new Error('Unsafe static build directory');
      for (const name of readdirSync(anchored)) {
        const path = join(anchored, name);
        const stat = lstatSync(path);
        if (stat.isSymbolicLink()) continue;
        const real = realpathSync(path);
        if (!real.startsWith(browserRoot + sep)) throw new Error('Unsafe static build asset');
        if (stat.isDirectory()) {
          snapshotDirectory(path);
          continue;
        }
        const type = types[extname(name)];
        if (!stat.isFile() || !type) continue;
        const file = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
        try {
          const opened = fstatSync(file);
          if (
            !opened.isFile() ||
            opened.ino !== stat.ino ||
            opened.dev !== stat.dev ||
            opened.nlink !== 1
          )
            throw new Error('Static build asset changed');
          const filePath = process.platform === 'linux' ? `/proc/self/fd/${file}` : path;
          if (!realpathSync(filePath).startsWith(browserRoot + sep))
            throw new Error('Unsafe static build asset');
          if (opened.size > 8 * 1024 * 1024 || snapshotBytes + opened.size > 32 * 1024 * 1024)
            throw new Error('Static build snapshot exceeds budget');
          const content = readFileSync(file);
          const after = lstatSync(path);
          if (
            after.isSymbolicLink() ||
            after.ino !== opened.ino ||
            after.dev !== opened.dev ||
            !realpathSync(path).startsWith(browserRoot + sep) ||
            fstatSync(file).mtimeMs !== opened.mtimeMs
          )
            throw new Error('Static build asset changed');
          snapshotBytes += content.length;
          assets.set('/' + relative(browserRoot, real).split(sep).join('/'), {
            content,
            type,
            gzip: /\.(js|css|html|svg|json|txt)$/.test(name) ? gzipSync(content) : undefined,
          });
        } finally {
          closeSync(file);
        }
      }
    } finally {
      closeSync(fd);
    }
  }
  let initialized = false;
  function initialize() {
    if (lstatSync(browserRoot).isSymbolicLink()) throw new Error('Unsafe static build root');
    browserRoot = realpathSync(browserRoot);
    snapshotDirectory(browserRoot);
    initialized = true;
  }
  if (preload) initialize();
  return (req, res, next) => {
    const raw = req.originalUrl.split('?')[0];
    let path: string;
    try {
      path = decodeURIComponent(raw);
    } catch {
      res.status(404).end();
      return;
    }
    if (
      !path.startsWith('/') ||
      /[%\\\x00-\x1f\x7f]/.test(path) ||
      path
        .split('/')
        .some((segment) => segment === '.' || segment === '..' || segment.startsWith('.'))
    ) {
      res.status(404).end();
      return;
    }
    // Angular's build-time virtual server has no browser directory yet. Genuine
    // SSR routes need no assets; an exported runtime handler snapshots on first asset.
    if (!initialized) {
      if (!extname(path) && !path.startsWith('/fonts/')) {
        next();
        return;
      }
      initialize();
    }
    const asset = assets.get(path);
    if (!asset) {
      if (extname(path) || path.startsWith('/fonts/')) {
        res.status(404).end();
        return;
      }
      next();
      return;
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.status(405).end();
      return;
    }
    const encoding = asset.gzip
      ? req.acceptsEncodings('gzip', 'identity')
      : req.acceptsEncodings('identity');
    if (!encoding) {
      res.status(406).end();
      return;
    }
    const gzip = encoding === 'gzip' && asset.gzip;
    const content = gzip || asset.content;
    res.setHeader('Content-Type', asset.type);
    res.setHeader('Vary', 'Accept-Encoding');
    if (gzip) res.setHeader('Content-Encoding', 'gzip');
    if (
      /^\/(?:chunk|main|styles)-[A-Za-z0-9_-]+\.(?:js|css)$/.test(path) ||
      path.startsWith('/fonts/')
    )
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.setHeader('Content-Length', content.length);
    if (req.method === 'HEAD') res.status(200).end();
    else res.send(content);
  };
}
