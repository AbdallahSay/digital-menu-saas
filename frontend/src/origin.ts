// Single-label DNS service names resolve only inside a private network
// (compose service names); public DNS names always have a dot. The label
// charset check also excludes bracketed IPv6 literals (they contain ':').
// Private IP literals are the RFC1918 + link-local IPv4 ranges; IPv6
// literals (including ULA/link-local) are NOT accepted - use a service name.
function isPrivateNetworkHost(hostname: string): boolean {
  if (/^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/i.test(hostname)) return true;
  const parts = hostname.split('.');
  if (parts.length !== 4 || parts.some((p) => !/^\d{1,3}$/.test(p) || Number(p) > 255))
    return false;
  const [a, b] = parts.map(Number);
  return (
    a === 10 ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 169 && b === 254)
  );
}

// Origin validation shared by the SSR server and its tests. Kept import-free
// so node:test can import this module directly (type-stripped) without the
// Angular bundler's extensionless resolution.
export function origin(value: string, internal = false, allowInsecureInternal = false): string {
  const url = new URL(value);
  const localHttp =
    url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  // Operator opt-in for a plain-HTTP upstream on a private network only
  // (compose service name, RFC1918 literal). Never widens the public origin,
  // which must stay https (or local http for development).
  const internalHttp =
    internal &&
    allowInsecureInternal &&
    url.protocol === 'http:' &&
    isPrivateNetworkHost(url.hostname);
  if (
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash ||
    (url.protocol !== 'https:' && !localHttp && !internalHttp)
  )
    throw Error(internal ? 'Invalid internal API origin' : 'Invalid public origin');
  return url.origin;
}
