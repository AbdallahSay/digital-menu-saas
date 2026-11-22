import type { Request, Response } from 'express';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';

/**
 * Same-origin /api router (docs/09-DEVOPS).
 *
 * Two strict traffic classes:
 * - Identity paths (auth/admin/platform): the browser's Cookie, the
 *   X-XSRF-TOKEN antiforgery header, Content-Type and Content-Length pass
 *   through to .NET, and Set-Cookie passes back, so the __Host- session and
 *   antiforgery cookies keep their full protection end to end.
 * - Everything else under /api (public menu projections, health): stays
 *   identity-free. Cookie/Authorization are never forwarded and Set-Cookie
 *   is stripped from the upstream response, preserving the backend
 *   invariant that public projections never authenticate cookies.
 *
 * The upstream origin comes from server configuration only; it is never
 * derived from the request Host header.
 *
 * Path canonicality: classification MUST describe the exact pathname the
 * upstream receives, but new URL() normalizes dot segments, so a raw path
 * like /api/v1/auth/../public/menus/x would classify as identity yet
 * arrive at a public endpoint carrying cookies and leaking Set-Cookie back.
 * ASP.NET also decodes percent-encoding once (%2e%2e traverses after
 * decode) and routes case-insensitively. Rather than normalize and hope
 * both sides agree, the router rejects every non-canonical /api path with
 * 400 before proxying (see canonicalApiPathname) and classifies
 * case-insensitively, matching endpoint routing.
 *
 * Client identity: the router is the trust boundary for X-Forwarded-For.
 * It always overwrites the header with the direct socket peer and never
 * copies a client-supplied value, so rate-limit partitioning upstream
 * cannot be forged through this adapter. The .NET side only honors the
 * header when the connecting peer is a configured trusted proxy
 * (Proxy:TrustedProxies), keeping direct connections and unconfigured
 * deployments fail-closed.
 */

const IDENTITY_PREFIXES = ['/api/v1/auth', '/api/v1/admin', '/api/v1/platform'];

/**
 * Returns the canonical pathname of an /api request URL, or null when the
 * raw path is not in canonical form and must be rejected. Canonical means:
 * - no percent-encoding anywhere (the API surface is plain ASCII — GUIDs,
 *   slugs, hex codes — so any % only serves encoding tricks like %2e%2e),
 * - printable ASCII only (no controls, spaces, or non-ASCII bytes),
 * - no backslashes, no empty segments from repeated slashes,
 * - no '.' or '..' segments.
 * A canonical path is forwarded byte-identically, so the class the router
 * computed is always the class the upstream routes.
 */
export function canonicalApiPathname(url: string): string | null {
  const path = url.split('?', 1)[0];
  if (path.includes('%')) return null;
  if (!/^[\x21-\x7e]*$/.test(path)) return null;
  if (path.includes('\\') || path.includes('//')) return null;
  if (path.split('/').some((segment) => segment === '.' || segment === '..')) return null;
  return path;
}

/**
 * Classifies an /api request URL as identity traffic. Non-canonical paths
 * classify as non-identity, but callers must reject them (400) before
 * proxying; classification alone is not the enforcement point. Matching is
 * case-insensitive because ASP.NET endpoint routing is case-insensitive.
 */
export function isIdentityApiPath(url: string): boolean {
  const pathname = canonicalApiPathname(url);
  if (pathname === null) return false;
  const path = pathname.replace(/\/+$/, '').toLowerCase() || '/';
  return IDENTITY_PREFIXES.some((prefix) => path === prefix || path.startsWith(prefix + '/'));
}

const IDENTITY_REQUEST_HEADERS = [
  'accept',
  'cookie',
  'x-xsrf-token',
  'content-type',
  'content-length',
];
const PUBLIC_REQUEST_HEADERS = ['accept'];

export function apiProxy(upstreamOrigin: string) {
  return (req: Request, res: Response): void => {
    const pathname = canonicalApiPathname(req.originalUrl);
    if (pathname === null || !pathname.toLowerCase().startsWith('/api')) {
      res
        .status(400)
        .type('application/problem+json')
        .send({ title: 'Non-canonical request path.', status: 400 });
      return;
    }
    const identity = isIdentityApiPath(req.originalUrl);
    const allowed = identity ? IDENTITY_REQUEST_HEADERS : PUBLIC_REQUEST_HEADERS;
    const headers: Record<string, string> = {};
    for (const name of allowed) {
      const value = req.headers[name];
      if (typeof value === 'string') headers[name] = value;
    }
    // Overwrite, never copy: only the direct socket peer is trustworthy.
    if (req.socket.remoteAddress) headers['x-forwarded-for'] = req.socket.remoteAddress;
    const search = req.originalUrl.slice(pathname.length);
    const upstreamUrl = new URL(pathname + search, upstreamOrigin);
    const upstream = (upstreamUrl.protocol === 'https:' ? httpsRequest : httpRequest)(
      upstreamUrl,
      { method: req.method, headers },
      (response) => {
        res.status(response.statusCode ?? 502);
        if (response.headers['content-type'])
          res.setHeader('Content-Type', response.headers['content-type']);
        // Session/antiforgery cookies may only flow on identity paths.
        if (identity && response.headers['set-cookie'])
          res.setHeader('Set-Cookie', response.headers['set-cookie']);
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
  };
}
