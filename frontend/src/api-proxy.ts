import type { Request, Response } from 'express';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { isIP } from 'node:net';

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

export interface ApiProxyOptions {
  // Platform-terminated ingress (compose Caddy edge / Azure App Service):
  // the edge stamps X-Forwarded-For (appending the real client IP last) and
  // overwrites X-Forwarded-Proto, so this proxy forwards the LAST XFF entry
  // (never the client-supplied chain) and the edge-stamped proto. Default
  // off: only the direct socket peer is forwarded and the proto never is.
  trustPlatformForwarding?: boolean;
  // Source-authenticated forwarding boundary: when the API sits behind its
  // OWN public platform edge (Azure), the rightmost XFF entry it sees is
  // this app's outbound IP, so the client IP travels in a dedicated header
  // authenticated by this shared secret. The API adopts it only on a
  // fixed-time secret match; a direct caller cannot forge it. Never logged
  // or copied from client headers (the allowlist above excludes them).
  sharedSecret?: string;
}

// Public traffic fails fast into the honest bounded unavailable page;
// identity paths (auth/admin) get longer so a paused free-tier database
// resume (typically under a minute) does not turn the first owner sign-in
// into a 502. Still bounded: the worst case fails closed with 502.
export function upstreamTimeoutMs(identityPath: boolean) {
  return identityPath ? 90000 : 5000;
}

// Azure front ends may append a :port to XFF entries. Normalize an entry to
// a bare IP: strip only a parsed port (IPv4:port or [IPv6]:port), keep bare
// IPv4/IPv6 (including IPv4-mapped forms), and reject anything malformed so
// a garbage entry never reaches the authenticated boundary as if it were an
// address. Address validation is node:net isIP, the same complete parser
// family the API's IPAddress/IPEndPoint.TryParse applies - never a regex.
export function normalizeClientEntry(entry: string): string | undefined {
  const portOk = (port: string) => /^\d{1,5}$/.test(port) && Number(port) <= 65535;
  if (isIP(entry)) return entry;
  const v4 = /^(\d{1,3}(?:\.\d{1,3}){3}):(\d{1,5})$/.exec(entry);
  if (v4 && isIP(v4[1]) === 4 && portOk(v4[2])) return v4[1];
  const v6 = /^\[([^\]]+)\](?::(\d{1,5}))?$/.exec(entry);
  if (v6 && isIP(v6[1]) === 6 && (v6[2] === undefined || portOk(v6[2]))) return v6[1];
  return undefined;
}

// The edge-stamped client IP in platform mode (last XFF entry, never the
// client-supplied chain), else the direct socket peer.
export function stampedClientIp(req: Request, trustPlatform: boolean): string | undefined {
  if (trustPlatform) {
    const chain = req.headers['x-forwarded-for'];
    const last = typeof chain === 'string' ? chain.split(',').pop()!.trim() : '';
    return last || req.socket.remoteAddress || undefined;
  }
  return req.socket.remoteAddress || undefined;
}

export function apiProxy(upstreamOrigin: string, options: ApiProxyOptions = {}) {
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
    // In platform mode the edge stamps the chain, so the LAST entry is the
    // real client; forward only that entry and the edge-stamped proto. With
    // a shared secret the client IP also travels in the authenticated
    // header pair the API's proxy boundary consumes.
    if (options.trustPlatformForwarding) {
      const client = stampedClientIp(req, true);
      if (client) {
        headers['x-forwarded-for'] = client;
        // The authenticated header carries only a normalized bare IP; a
        // malformed entry sends no client-IP header at all, so the API
        // falls back to the stamped rightmost XFF instead of a shared
        // bucket or a parser rejection.
        const normalized = normalizeClientEntry(client);
        if (normalized && options.sharedSecret) {
          headers['x-menu-client-ip'] = normalized;
          headers['x-menu-proxy-token'] = options.sharedSecret;
        }
      }
      headers['x-forwarded-proto'] =
        req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http';
    } else if (req.socket.remoteAddress) headers['x-forwarded-for'] = req.socket.remoteAddress;
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
    upstream.setTimeout(upstreamTimeoutMs(identity), () => upstream.destroy());
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
