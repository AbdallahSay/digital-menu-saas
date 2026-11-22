using System.Net;
using Microsoft.AspNetCore.HttpOverrides;

namespace DigitalMenu.Api.Proxy;

/// <summary>
/// Fail-closed trusted-proxy policy for X-Forwarded-For (docs/09-DEVOPS).
/// Forwarded headers are processed only when Proxy:TrustedProxies lists at
/// least one valid IP address; with an empty list the middleware is never
/// registered, so the socket peer is always used and a direct caller cannot
/// rotate the header to evade per-IP rate limiting. Malformed entries fail
/// startup loudly instead of silently degrading trust, and there is no
/// implicit loopback trust. Note: clearing the middleware's KnownNetworks
/// and KnownProxies lists is NOT a fail-closed state — ASP.NET treats empty
/// lists as "trust every proxy" — which is why the middleware is only
/// registered behind a validated nonempty allowlist.
/// </summary>
public static class TrustedProxyConfiguration
{
    public const string SectionName = "Proxy:TrustedProxies";
    public const string PlatformTrustName = "Proxy:TrustPlatform";

    /// <summary>
    /// Platform-managed ingress mode (Proxy:TrustPlatform): trust the hosting
    /// platform's TLS-terminating front end, which stamps X-Forwarded-For and
    /// X-Forwarded-Proto. Sound ONLY where ingress can arrive exclusively
    /// through that front end (e.g. Azure App Service: no direct socket path
    /// to the app exists). KnownNetworks/KnownProxies stay cleared, which
    /// ASP.NET treats as trust-every-proxy - acceptable there because the
    /// front end is the only possible peer; ForwardLimit=1 keeps the
    /// rightmost (front-end-stamped) client IP so a client-supplied
    /// X-Forwarded-For chain cannot rotate rate-limit partitioning. Never
    /// enable on a directly reachable host. When both modes are configured,
    /// platform trust wins.
    /// </summary>
    public static bool IsPlatformTrusted(IConfiguration configuration) =>
        configuration.GetValue<bool>(PlatformTrustName);

    /// <summary>
    /// Reads and strictly validates the configured trusted proxies. Throws
    /// for any malformed entry so a typo can never widen or narrow trust
    /// unnoticed.
    /// </summary>
    public static IPAddress[] Parse(IConfiguration configuration)
    {
        var entries = configuration.GetSection(SectionName).Get<string[]>() ?? [];
        var parsed = new IPAddress[entries.Length];
        for (var i = 0; i < entries.Length; i++)
        {
            if (!IPAddress.TryParse(entries[i], out var address))
                throw new InvalidOperationException(
                    $"Configuration '{SectionName}:{i}' value '{entries[i]}' is not a valid IP address. " +
                    "Fix or remove the entry; forwarded-header processing is enabled only with a valid allowlist.");
            parsed[i] = address;
        }
        return parsed;
    }

    /// <summary>
    /// Registers forwarded-header options only when a validated nonempty
    /// allowlist exists; otherwise nothing processes X-Forwarded-For.
    /// </summary>
    public static void Configure(IServiceCollection services, IConfiguration configuration)
    {
        if (IsPlatformTrusted(configuration))
        {
            services.Configure<ForwardedHeadersOptions>(options =>
            {
                options.ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto;
                options.ForwardLimit = 1;
                options.KnownNetworks.Clear();
                options.KnownProxies.Clear();
            });
            return;
        }
        var proxies = Parse(configuration);
        if (proxies.Length == 0) return;
        services.Configure<ForwardedHeadersOptions>(options =>
        {
            options.ForwardedHeaders = ForwardedHeaders.XForwardedFor;
            options.ForwardLimit = 1;
            options.KnownNetworks.Clear();
            options.KnownProxies.Clear();
            foreach (var proxy in proxies) options.KnownProxies.Add(proxy);
        });
    }

    /// <summary>
    /// Whether forwarded-header processing is active; Program.cs registers
    /// the middleware only when this is true.
    /// </summary>
    public static bool IsEnabled(IConfiguration configuration) =>
        IsPlatformTrusted(configuration) || Parse(configuration).Length > 0;
}
