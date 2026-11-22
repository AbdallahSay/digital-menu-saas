using System.Net;
using System.Security.Cryptography;
using System.Text;

namespace DigitalMenu.Api.Proxy;

/// <summary>
/// Source-authenticated web-to-API forwarding boundary (docs/09-DEVOPS).
/// On Azure the request chain is browser → web front end → Node SSR → api
/// front end → this app, so the rightmost X-Forwarded-For entry the
/// forwarded-headers middleware keeps is the Node app's outbound IP, not the
/// visitor's; per-IP rate limiting would collapse every proxied visitor into
/// one bucket. Node authenticates itself with a shared secret header and
/// passes the real client IP in a dedicated header; only a fixed-time secret
/// match lets that IP replace the forwarded one. A direct caller on the
/// public API hostname cannot prepend a forged IP: without the secret the
/// forwarded policy keeps only the front-end-stamped rightmost address, and
/// a wrong secret is just an absent one. Registered after
/// UseForwardedHeaders; a no-op unless platform trust is on AND
/// Proxy:SharedSecret is configured (the compose edge network is itself the
/// boundary, so it needs no secret). While active, both custom headers are
/// removed so no endpoint or log ever treats them as trusted input; when
/// the middleware is not active they pass through unread and inert.
/// </summary>
public static class PlatformProxyAuthentication
{
    public const string SharedSecretName = "Proxy:SharedSecret";
    public const string TokenHeader = "X-Menu-Proxy-Token";
    public const string ClientIpHeader = "X-Menu-Client-IP";

    public static IApplicationBuilder UsePlatformProxyAuthentication(
        this IApplicationBuilder app, IConfiguration configuration)
    {
        var secret = configuration[SharedSecretName];
        if (!TrustedProxyConfiguration.IsPlatformTrusted(configuration) || string.IsNullOrWhiteSpace(secret))
            return app;
        // Hash both sides so the comparison can never oracle the secret's length.
        var expected = SHA256.HashData(Encoding.UTF8.GetBytes(secret));
        return app.Use(async (context, next) =>
        {
            var presented = SHA256.HashData(
                Encoding.UTF8.GetBytes(context.Request.Headers[TokenHeader].ToString()));
            if (CryptographicOperations.FixedTimeEquals(presented, expected)
                && TryParseClientAddress(context.Request.Headers[ClientIpHeader].ToString(), out var clientIp))
                context.Connection.RemoteIpAddress = clientIp;
            context.Request.Headers.Remove(TokenHeader);
            context.Request.Headers.Remove(ClientIpHeader);
            await next(context);
        });
    }

    /// <summary>
    /// Accepts a bare IP or a valid IP endpoint (IPv4:port, [IPv6]:port),
    /// stripping only a parsed port: Azure front ends may append :port to
    /// forwarded entries, and discarding those would silently fall back to
    /// the web hop's address. Malformed input is rejected, never coerced.
    /// </summary>
    private static bool TryParseClientAddress(string value, out IPAddress address)
    {
        if (IPAddress.TryParse(value, out address!))
            return true;
        if (IPEndPoint.TryParse(value, out var endpoint) && endpoint is not null)
        {
            address = endpoint.Address;
            return true;
        }
        address = IPAddress.None;
        return false;
    }
}
