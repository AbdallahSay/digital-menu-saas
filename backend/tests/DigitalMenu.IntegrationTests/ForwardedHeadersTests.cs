using System.Net;
using DigitalMenu.Api.Proxy;
using Microsoft.AspNetCore.Builder;
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

    private static Task<string> ObservedRemoteIp(IDictionary<string, string?> settings) =>
        ObservedRemoteIp(settings, IPAddress.Parse(Peer));

    private static async Task<string> ObservedRemoteIp(IDictionary<string, string?> settings, IPAddress peer)
    {
        var builder = WebApplication.CreateBuilder();
        builder.WebHost.UseTestServer();
        builder.Configuration.AddInMemoryCollection(settings);
        TrustedProxyConfiguration.Configure(builder.Services, builder.Configuration);
        await using var app = builder.Build();
        if (TrustedProxyConfiguration.IsEnabled(builder.Configuration))
            app.UseForwardedHeaders();
        app.Run(http => http.Response.WriteAsync(http.Connection.RemoteIpAddress?.ToString() ?? "null"));
        await app.StartAsync();
        var httpContext = await app.GetTestServer().SendAsync(context =>
        {
            context.Connection.RemoteIpAddress = peer;
            context.Request.Headers["X-Forwarded-For"] = Forwarded;
        });
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
        var observed = await ObservedRemoteIp(
            new Dictionary<string, string?> { ["Proxy:TrustedProxies:0"] = "192.0.2.9" },
            IPAddress.Loopback);
        Assert.Equal(IPAddress.Loopback.ToString(), observed);
    }
}
