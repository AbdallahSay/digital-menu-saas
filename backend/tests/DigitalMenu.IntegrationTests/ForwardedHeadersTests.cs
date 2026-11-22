using System.Net;
using DigitalMenu.Api.Proxy;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.Configuration;

namespace DigitalMenu.IntegrationTests;

/// <summary>
/// Middleware-only coverage for the trusted-proxy policy (no SQL): the
/// forwarded-IP behavior of every configuration shape, exercised through
/// the same TrustedProxyConfiguration the production pipeline uses.
/// </summary>
public sealed class ForwardedHeadersTests
{
    private const string Peer = "192.0.2.1";
    private const string Forwarded = "198.51.100.7";

    private static async Task<string> ObservedRemoteIp(IDictionary<string, string?> settings)
    {
        var builder = new WebHostBuilder()
            .ConfigureServices((context, services) =>
                TrustedProxyConfiguration.Configure(services, context.Configuration))
            .Configure((context, app) =>
            {
                if (TrustedProxyConfiguration.IsEnabled(context.Configuration))
                    app.UseForwardedHeaders();
                app.Run(http => http.Response.WriteAsync(http.Connection.RemoteIpAddress?.ToString() ?? "null"));
            });
        foreach (var pair in settings)
            builder.UseSetting(pair.Key, pair.Value);
        using var server = new TestServer(builder);
        var httpContext = await server.SendAsync(context =>
        {
            context.Connection.RemoteIpAddress = IPAddress.Parse(Peer);
            context.Request.Headers["X-Forwarded-For"] = Forwarded;
        });
        httpContext.Response.Body.Seek(0, SeekOrigin.Begin);
        using var reader = new StreamReader(httpContext.Response.Body);
        return await reader.ReadToEndAsync();
    }

    private static IConfiguration Config(IDictionary<string, string?> settings) =>
        new ConfigurationBuilder().AddInMemoryCollection(settings).Build();

    [Fact]
    public async Task Empty_configuration_ignores_forwarded_for()
    {
        // No proxies configured: the middleware is not registered and the
        // socket peer is used, so a direct caller cannot rotate XFF to evade
        // per-IP rate limiting.
        Assert.Equal(Peer, await ObservedRemoteIp(new Dictionary<string, string?>()));
    }

    [Fact]
    public void Malformed_entries_fail_startup_loudly()
    {
        foreach (var bad in new[] { "not-an-ip", "999.1.2.3", "192.0.2.0/24", "" })
        {
            var config = Config(new Dictionary<string, string?> { ["Proxy:TrustedProxies:0"] = bad });
            Assert.Throws<InvalidOperationException>(() => TrustedProxyConfiguration.Parse(config));
        }
    }

    [Fact]
    public async Task Trusted_peer_applies_forwarded_for()
    {
        var observed = await ObservedRemoteIp(new Dictionary<string, string?>
        { ["Proxy:TrustedProxies:0"] = Peer });
        Assert.Equal(Forwarded, observed);
    }

    [Fact]
    public async Task Untrusted_peer_is_ignored_even_with_a_configured_allowlist()
    {
        // The allowlist names a different proxy; this peer is not it.
        var observed = await ObservedRemoteIp(new Dictionary<string, string?>
        { ["Proxy:TrustedProxies:0"] = "192.0.2.9" });
        Assert.Equal(Peer, observed);
    }

    [Fact]
    public async Task Loopback_is_not_implicitly_trusted()
    {
        var config = Config(new Dictionary<string, string?> { ["Proxy:TrustedProxies:0"] = "192.0.2.9" });
        Assert.Single(TrustedProxyConfiguration.Parse(config));
        // A loopback peer with only a non-loopback allowlist entry must not
        // be able to drive the forwarded IP.
        using var server = new TestServer(new WebHostBuilder()
            .UseSetting("Proxy:TrustedProxies:0", "192.0.2.9")
            .ConfigureServices((context, services) =>
                TrustedProxyConfiguration.Configure(services, context.Configuration))
            .Configure((context, app) =>
            {
                if (TrustedProxyConfiguration.IsEnabled(context.Configuration))
                    app.UseForwardedHeaders();
                app.Run(http => http.Response.WriteAsync(http.Connection.RemoteIpAddress?.ToString() ?? "null"));
            }));
        var httpContext = await server.SendAsync(context =>
        {
            context.Connection.RemoteIpAddress = IPAddress.Loopback;
            context.Request.Headers["X-Forwarded-For"] = Forwarded;
        });
        httpContext.Response.Body.Seek(0, SeekOrigin.Begin);
        using var reader = new StreamReader(httpContext.Response.Body);
        Assert.Equal(IPAddress.Loopback.ToString(), await reader.ReadToEndAsync());
    }

    private static async Task<string> ObservedSchemeAndIp(
        IDictionary<string, string?> settings,
        IDictionary<string, string> headers)
    {
        var builder = new WebHostBuilder()
            .ConfigureServices((context, services) =>
                TrustedProxyConfiguration.Configure(services, context.Configuration))
            .Configure((context, app) =>
            {
                if (TrustedProxyConfiguration.IsEnabled(context.Configuration))
                    app.UseForwardedHeaders();
                app.Run(http =>
                {
                    var remote = http.Connection.RemoteIpAddress?.ToString() ?? "null";
                    return http.Response.WriteAsync($"{http.Request.Scheme}|{remote}");
                });
            });
        foreach (var pair in settings)
            builder.UseSetting(pair.Key, pair.Value);
        using var server = new TestServer(builder);
        var httpContext = await server.SendAsync(context =>
        {
            context.Connection.RemoteIpAddress = IPAddress.Parse(Peer);
            foreach (var pair in headers)
                context.Request.Headers[pair.Key] = pair.Value;
        });
        httpContext.Response.Body.Seek(0, SeekOrigin.Begin);
        using var reader = new StreamReader(httpContext.Response.Body);
        return await reader.ReadToEndAsync();
    }

    private static Dictionary<string, string?> PlatformTrust() =>
        new() { ["Proxy:TrustPlatform"] = "true" };

    [Fact]
    public async Task Platform_mode_adopts_the_stamped_forwarded_for()
    {
        var observed = await ObservedSchemeAndIp(
            PlatformTrust(),
            new Dictionary<string, string> { ["X-Forwarded-For"] = Forwarded });
        Assert.Equal($"http|{Forwarded}", observed);
    }

    [Fact]
    public async Task Platform_mode_forward_limit_one_keeps_the_rightmost_ip()
    {
        // A client-supplied chain may prepend forged entries; ForwardLimit=1
        // keeps only the front-end-stamped rightmost address, so the client
        // cannot rotate rate-limit partitioning.
        var observed = await ObservedSchemeAndIp(
            PlatformTrust(),
            new Dictionary<string, string> { ["X-Forwarded-For"] = $"203.0.113.9, {Forwarded}" });
        Assert.Equal($"http|{Forwarded}", observed);
    }

    [Fact]
    public async Task Platform_mode_adopts_the_stamped_forwarded_proto()
    {
        var observed = await ObservedSchemeAndIp(
            PlatformTrust(),
            new Dictionary<string, string>
            {
                ["X-Forwarded-For"] = Forwarded,
                ["X-Forwarded-Proto"] = "https",
            });
        Assert.Equal($"https|{Forwarded}", observed);
    }

    [Fact]
    public async Task Platform_mode_defaults_off_and_ignores_proto()
    {
        // No configuration: neither the forwarded IP nor the proto is
        // adopted, so a direct caller cannot spoof HTTPS past the scheme
        // checks.
        var observed = await ObservedSchemeAndIp(
            new Dictionary<string, string?>(),
            new Dictionary<string, string>
            {
                ["X-Forwarded-For"] = Forwarded,
                ["X-Forwarded-Proto"] = "https",
            });
        Assert.Equal($"http|{Peer}", observed);
    }

    [Fact]
    public async Task Allowlist_mode_never_adopts_forwarded_proto()
    {
        // The strict allowlist mode only adopts the forwarded IP; the scheme
        // stays as observed on the socket so TLS checks cannot be bypassed by
        // a header.
        var observed = await ObservedSchemeAndIp(
            new Dictionary<string, string?> { ["Proxy:TrustedProxies:0"] = Peer },
            new Dictionary<string, string>
            {
                ["X-Forwarded-For"] = Forwarded,
                ["X-Forwarded-Proto"] = "https",
            });
        Assert.Equal($"http|{Forwarded}", observed);
    }

    [Fact]
    public async Task Platform_trust_wins_over_the_allowlist()
    {
        var observed = await ObservedSchemeAndIp(
            new Dictionary<string, string?>
            {
                ["Proxy:TrustPlatform"] = "true",
                ["Proxy:TrustedProxies:0"] = "192.0.2.9",
            },
            new Dictionary<string, string> { ["X-Forwarded-For"] = Forwarded });
        Assert.Equal($"http|{Forwarded}", observed);
    }

    // End-to-end chain shape through the source-authenticated boundary: the
    // API front end appends the web app's outbound IP to whatever Node
    // forwarded, so XFF arrives as [visitor, node]. The shared secret proves
    // the Node hop; only then does the dedicated client-IP header win.
    private const string Secret = "test-shared-secret-32-chars-min!!";
    private const string Visitor = "203.0.113.50";
    private const string Node = "10.0.0.8";

    private static async Task<string> ObservedBoundary(
        IDictionary<string, string?> settings,
        IDictionary<string, string> headers)
    {
        var builder = new WebHostBuilder()
            .ConfigureServices((context, services) =>
                TrustedProxyConfiguration.Configure(services, context.Configuration))
            .Configure((context, app) =>
            {
                if (TrustedProxyConfiguration.IsEnabled(context.Configuration))
                    app.UseForwardedHeaders();
                app.UsePlatformProxyAuthentication(context.Configuration);
                app.Run(http =>
                {
                    var remote = http.Connection.RemoteIpAddress?.ToString() ?? "null";
                    var tokenSeen = http.Request.Headers.ContainsKey(PlatformProxyAuthentication.TokenHeader);
                    var ipSeen = http.Request.Headers.ContainsKey(PlatformProxyAuthentication.ClientIpHeader);
                    return http.Response.WriteAsync($"{remote}|{tokenSeen}|{ipSeen}");
                });
            });
        foreach (var pair in settings)
            builder.UseSetting(pair.Key, pair.Value);
        using var server = new TestServer(builder);
        var httpContext = await server.SendAsync(context =>
        {
            context.Connection.RemoteIpAddress = IPAddress.Parse(Peer);
            foreach (var pair in headers)
                context.Request.Headers[pair.Key] = pair.Value;
        });
        httpContext.Response.Body.Seek(0, SeekOrigin.Begin);
        using var reader = new StreamReader(httpContext.Response.Body);
        return await reader.ReadToEndAsync();
    }

    private static Dictionary<string, string?> PlatformWithSecret() =>
        new()
        {
            ["Proxy:TrustPlatform"] = "true",
            ["Proxy:SharedSecret"] = Secret,
        };

    [Fact]
    public async Task Authenticated_web_hop_recovers_the_visitor_ip()
    {
        var observed = await ObservedBoundary(
            PlatformWithSecret(),
            new Dictionary<string, string>
            {
                ["X-Forwarded-For"] = $"{Visitor}, {Node}",
                [PlatformProxyAuthentication.TokenHeader] = Secret,
                [PlatformProxyAuthentication.ClientIpHeader] = Visitor,
            });
        Assert.Equal($"{Visitor}|False|False", observed);
    }

    [Fact]
    public async Task Direct_attacker_without_the_secret_gets_only_the_edge_stamped_ip()
    {
        // A direct caller on the public API hostname prepends a forged entry;
        // ForwardLimit=1 keeps only the front-end-stamped rightmost address.
        var observed = await ObservedBoundary(
            PlatformWithSecret(),
            new Dictionary<string, string> { ["X-Forwarded-For"] = $"203.0.113.9, {Forwarded}" });
        Assert.Equal($"{Forwarded}|False|False", observed);
    }

    [Fact]
    public async Task A_wrong_secret_is_an_absent_one()
    {
        var observed = await ObservedBoundary(
            PlatformWithSecret(),
            new Dictionary<string, string>
            {
                ["X-Forwarded-For"] = $"203.0.113.9, {Forwarded}",
                [PlatformProxyAuthentication.TokenHeader] = "wrong-secret",
                [PlatformProxyAuthentication.ClientIpHeader] = "203.0.113.9",
            });
        Assert.Equal($"{Forwarded}|False|False", observed);
    }

    [Fact]
    public async Task Authenticated_hop_with_a_malformed_client_ip_falls_back()
    {
        var observed = await ObservedBoundary(
            PlatformWithSecret(),
            new Dictionary<string, string>
            {
                ["X-Forwarded-For"] = $"{Visitor}, {Node}",
                [PlatformProxyAuthentication.TokenHeader] = Secret,
                [PlatformProxyAuthentication.ClientIpHeader] = "not-an-ip",
            });
        Assert.Equal($"{Node}|False|False", observed);
    }

    [Theory]
    [InlineData("198.51.100.7:63546", "198.51.100.7")] // Azure XFF entries can carry a port
    [InlineData("198.51.100.7", "198.51.100.7")]
    [InlineData("[2001:db8::7]:443", "2001:db8::7")]
    [InlineData("[2001:db8::7]", "2001:db8::7")]
    [InlineData("2001:db8::7", "2001:db8::7")]
    public async Task Authenticated_hop_accepts_ip_endpoints_and_strips_only_the_port(
        string presented, string expected)
    {
        var observed = await ObservedBoundary(
            PlatformWithSecret(),
            new Dictionary<string, string>
            {
                ["X-Forwarded-For"] = $"{Visitor}, {Node}",
                [PlatformProxyAuthentication.TokenHeader] = Secret,
                [PlatformProxyAuthentication.ClientIpHeader] = presented,
            });
        Assert.Equal($"{expected}|False|False", observed);
    }

    [Theory]
    [InlineData("198.51.100.7:99999")] // port out of range: malformed, never coerced
    [InlineData("198.51.100.7:")]
    [InlineData("198.51.100.7:abc")]
    [InlineData("[2001:db8::7]:99999")]
    public async Task Authenticated_hop_rejects_malformed_endpoints(string presented)
    {
        var observed = await ObservedBoundary(
            PlatformWithSecret(),
            new Dictionary<string, string>
            {
                ["X-Forwarded-For"] = $"{Visitor}, {Node}",
                [PlatformProxyAuthentication.TokenHeader] = Secret,
                [PlatformProxyAuthentication.ClientIpHeader] = presented,
            });
        Assert.Equal($"{Node}|False|False", observed);
    }

    [Fact]
    public async Task Secret_headers_are_ignored_when_no_secret_is_configured()
    {
        var observed = await ObservedBoundary(
            PlatformTrust(),
            new Dictionary<string, string>
            {
                ["X-Forwarded-For"] = $"203.0.113.9, {Forwarded}",
                [PlatformProxyAuthentication.TokenHeader] = Secret,
                [PlatformProxyAuthentication.ClientIpHeader] = "203.0.113.9",
            });
        // Middleware not registered: headers survive (harmless) and the
        // forwarded policy keeps only the rightmost edge-stamped address.
        Assert.Equal($"{Forwarded}|True|True", observed);
    }
}
