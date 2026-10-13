using System.Collections.Concurrent;
using System.Diagnostics;
using System.Net;
using DigitalMenu.Domain;
using DigitalMenu.Infrastructure.Persistence;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Hosting.Server;
using Microsoft.AspNetCore.Hosting.Server.Features;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using static DigitalMenu.IntegrationTests.AuthenticationTests;

namespace DigitalMenu.IntegrationTests;

public sealed class PublicSsrTests(Xunit.Abstractions.ITestOutputHelper output)
{
    // Uses the production F09 handlers against a dedicated migrated SQL database.
    // Kestrel only bridges TestServer to Node; no fixture HTTP mutation endpoints.
    [SqlServerFact]
    public async Task Real_F09_SQL_to_Angular_SSR_is_isolated_safe_fresh_and_hydratable()
    {
        await using var fixture = await AuthFixture.Create(empty: true, configure: services => services.AddLogging(logging => logging.ClearProviders()));
        using var scope = fixture.Factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<MenuDbContext>();
        var a = new Restaurant { Name = "مطعم ألف <script>globalThis.s01Canary=true</script>", Slug = "s01-a", PublicCode = new('a', 20), IsPublished = true };
        var b = new Restaurant { Name = "مطعم باء", Slug = "s01-b", PublicCode = new('b', 20), IsPublished = true };
        var empty = new Restaurant { Name = "مطعم فارغ", Slug = "s01-empty", PublicCode = new('c', 20), IsPublished = true };
        var hidden = new Restaurant { Name = "S01_SECRET_HIDDEN", Slug = "s01-hidden", PublicCode = new('d', 20) };
        var suspended = new Restaurant { Name = "S01_SECRET_SUSPENDED", Slug = "s01-suspended", PublicCode = new('e', 20), IsPublished = true, Status = "Suspended" };
        var demoCollision = new Restaurant { Name = "S01_SECRET_DEMO_COLLISION", Slug = "demo", PublicCode = new('f', 20), IsPublished = true };
        var catA = new Category { RestaurantId = a.Id, NameAr = "قسم ألف", NameEn = "First A", IsPublished = true, SortOrder = 2 };
        var catB = new Category { RestaurantId = b.Id, NameAr = "قسم باء", NameEn = "Section B", IsPublished = true };
        var prior = new Category { RestaurantId = a.Id, NameAr = "قسم سابق", NameEn = "Earlier A", IsPublished = true };
        var hiddenCat = new Category { RestaurantId = a.Id, NameAr = "S01_SECRET_CATEGORY" };
        db.AddRange(a, b, empty, hidden, suspended, demoCollision, catA, catB, prior, hiddenCat,
            new RestaurantSettings { RestaurantId = a.Id, ContactPhoneOptional = "S01_SECRET_PHONE", AddressOptional = "S01_SECRET_ADDRESS", LogoObjectKey = a.Id + "/S01_SECRET_KEY.webp", PublishedContactDetailsFlags = 3 },
            new MenuItem { RestaurantId = a.Id, CategoryId = catA.Id, NameAr = "صنف ألف <img src=x onerror=globalThis.s01Canary=true>", NameEn = "Item A", DescriptionAr = "</script><script>globalThis.s01Canary=true</script>", Price = 12.50m, IsPublished = true, SortOrder = 2 },
            new MenuItem { RestaurantId = a.Id, CategoryId = catA.Id, NameAr = "صنف أول", DescriptionAr = "وصف بديل", Price = 9999999999999999.99m, IsPublished = true },
            new MenuItem { RestaurantId = b.Id, CategoryId = catB.Id, NameAr = "صنف باء", NameEn = "Item B", DescriptionAr = "وصف باء", Price = 32m, IsPublished = true },
            new MenuItem { RestaurantId = a.Id, CategoryId = catA.Id, NameAr = "S01_SECRET_DRAFT", Price = 1 },
            new MenuItem { RestaurantId = a.Id, CategoryId = catA.Id, NameAr = "S01_SECRET_UNAVAILABLE", Price = 1, IsPublished = true, IsAvailable = false },
            new MenuItem { RestaurantId = a.Id, CategoryId = catA.Id, NameAr = "S01_SECRET_DELETED", Price = 1, IsPublished = true, IsDeleted = true },
            new MenuItem { RestaurantId = a.Id, CategoryId = hiddenCat.Id, NameAr = "S01_SECRET_PARENT", Price = 1, IsPublished = true });
        await db.SaveChangesAsync();
        var frontend = FindFrontend();
        Assert.True(File.Exists(Path.Combine(frontend, "dist/digital-menu/server/server.mjs")), "Run npm ci and npm run build first.");
        var gates = Environment.GetEnvironmentVariable("S01_FRONTEND_GATES") == "1";
        var calls = new ConcurrentBag<string>();
        var credentials = new ConcurrentBag<string>();
        var failure = 0;
        using var apiClient = fixture.Factory.CreateClient(new() { BaseAddress = new Uri("https://localhost"), HandleCookies = false });
        var bridgeBuilder = WebApplication.CreateBuilder();
        bridgeBuilder.Logging.ClearProviders();
        bridgeBuilder.WebHost.UseKestrel().UseUrls(gates ? "http://127.0.0.1:5080" : "http://127.0.0.1:0");
        await using var bridge = bridgeBuilder.Build();
        bridge.Run(async context =>
        {
            calls.Add(context.Request.Path + context.Request.QueryString);
            foreach (var header in new[] { "Cookie", "Authorization", "X-Tenant-Id", "X-Restaurant-Id", "X-Role" })
                if (context.Request.Headers.ContainsKey(header)) credentials.Add(header);
            if (Volatile.Read(ref failure) == 1) { context.Response.ContentType = "application/json"; await context.Response.WriteAsync("{\"S01_SECRET_BROKEN\":true}"); return; }
            if (Volatile.Read(ref failure) == 2) { await Task.Delay(6000); return; }
            using var message = new HttpRequestMessage(new HttpMethod(context.Request.Method), context.Request.Path + context.Request.QueryString);
            using var response = await apiClient.SendAsync(message);
            context.Response.StatusCode = (int)response.StatusCode;
            context.Response.ContentType = response.Content.Headers.ContentType?.ToString();
            await response.Content.CopyToAsync(context.Response.Body);
        });
        await bridge.StartAsync();
        var internalOrigin = bridge.Services.GetRequiredService<IServer>().Features.Get<IServerAddressesFeature>()!.Addresses.Single();
        var port = gates ? 4000 : FreePort();
        var origin = "http://localhost:" + port;
        using var ssr = StartNode(frontend, ["dist/digital-menu/server/server.mjs"], new()
        {
            ["F01_LOCAL_ONLY"] = "1",
            ["PORT"] = port.ToString(),
            ["PUBLIC_ORIGIN"] = origin,
            ["PUBLIC_API_ORIGIN"] = internalOrigin
        });
        var stdout = ssr.StandardOutput.ReadToEndAsync(); var stderr = ssr.StandardError.ReadToEndAsync();
        try
        {
            using var client = new HttpClient(new HttpClientHandler { AllowAutoRedirect = false }) { BaseAddress = new Uri(origin), Timeout = TimeSpan.FromSeconds(15) };
            for (var attempt = 0; ; attempt++)
            {
                try { if ((await client.GetAsync("/api/health/live")).IsSuccessStatusCode) break; } catch (HttpRequestException) { }
                Assert.True(attempt < 60 && !ssr.HasExited, "SSR failed to start: " + (ssr.HasExited ? await stderr : "startup timeout"));
                await Task.Delay(250);
            }
            var before = calls.Count;
            var firstLive = Stopwatch.StartNew();
            Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/r/s01-a")).StatusCode);
            firstLive.Stop();
            output.WriteLine("First real SQL-backed SSR ms: " + firstLive.Elapsed.TotalMilliseconds);
            Assert.Equal(before + 1, calls.Count); // One F09 fetch per SSR render.
            await RunNode(frontend, ["--test", "scripts/test-public-menu.mjs"], new()
            { ["S01_ORIGIN"] = origin, ["S01_PRIVATE_IDS"] = a.Id + "," + b.Id, ["S01_COLD_MS"] = firstLive.Elapsed.TotalMilliseconds.ToString(System.Globalization.CultureInfo.InvariantCulture) });
            if (gates)
                foreach (var script in new[] { "source-html.mjs", "../node_modules/@playwright/test/cli.js", "test-security.mjs", "lighthouse-ci.mjs" })
                {
                    var arguments = script.Contains("cli.js", StringComparison.Ordinal) ? new[] { "node_modules/@playwright/test/cli.js", "test" }
                        : script == "test-security.mjs" ? ["--test", "scripts/test-security.mjs", "scripts/test-static-assets.mjs"]
                        : script == "source-html.mjs" ? ["--test", "scripts/source-html.mjs"] : new[] { "scripts/" + script };
                    await RunNode(frontend, arguments, []);
                }
            a.Slug = "s01-a-renamed"; a.PublishedMenuVersion++;
            await db.SaveChangesAsync();
            var qr = await client.GetAsync("/m/" + a.PublicCode);
            Assert.Equal(HttpStatusCode.Found, qr.StatusCode);
            Assert.Equal("/r/s01-a-renamed", qr.Headers.Location!.OriginalString);
            Assert.Equal(HttpStatusCode.OK, (await client.GetAsync(qr.Headers.Location)).StatusCode);
            Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync("/r/s01-a")).StatusCode);
            a.IsPublished = false; a.PublishedMenuVersion++; await db.SaveChangesAsync();
            Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync("/m/" + a.PublicCode)).StatusCode);
            a.IsPublished = true; a.Status = "Suspended"; a.PublishedMenuVersion++; await db.SaveChangesAsync();
            Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync("/m/" + a.PublicCode)).StatusCode);
            foreach (var mode in new[] { 1, 2 })
            {
                Volatile.Write(ref failure, mode);
                var response = await client.GetAsync("/r/s01-b");
                Assert.Equal(HttpStatusCode.ServiceUnavailable, response.StatusCode);
                Assert.DoesNotContain("S01_SECRET", await response.Content.ReadAsStringAsync());
                Assert.Equal(HttpStatusCode.ServiceUnavailable, (await client.GetAsync("/m/" + b.PublicCode)).StatusCode);
            }
            Volatile.Write(ref failure, 0);
            Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/r/s01-b")).StatusCode);
            await bridge.StopAsync();
            foreach (var encoding in new[] { "gzip", "identity" })
                foreach (var method in new[] { HttpMethod.Get, HttpMethod.Head })
                    foreach (var path in new[] { "/r/s01-b", "/m/" + b.PublicCode })
                    {
                        using var request = new HttpRequestMessage(method, path);
                        request.Headers.TryAddWithoutValidation("Accept-Encoding", encoding);
                        using var response = await client.SendAsync(request);
                        Assert.Equal(HttpStatusCode.ServiceUnavailable, response.StatusCode);
                    }
            Assert.Empty(credentials);
        }
        finally
        {
            if (!ssr.HasExited) ssr.Kill(entireProcessTree: true);
            await ssr.WaitForExitAsync();
            output.WriteLine(await stdout); output.WriteLine(await stderr);
        }
    }
    private static string FindFrontend()
    {
        var configured = Environment.GetEnvironmentVariable("S01_FRONTEND_DIRECTORY");
        if (configured is not null && Path.IsPathFullyQualified(configured) && File.Exists(Path.Combine(configured, "package-lock.json"))) return configured;
        var directory = new DirectoryInfo(Directory.GetCurrentDirectory());
        while (directory is not null)
        {
            var path = Path.Combine(directory.FullName, "frontend");
            if (File.Exists(Path.Combine(path, "package-lock.json"))) return path;
            directory = directory.Parent;
        }
        throw new InvalidOperationException("Repository frontend required.");
    }
    private static int FreePort()
    {
        var listener = new System.Net.Sockets.TcpListener(IPAddress.Loopback, 0);
        listener.Start(); var port = ((IPEndPoint)listener.LocalEndpoint).Port; listener.Stop(); return port;
    }
    private static Process StartNode(string directory, string[] arguments, Dictionary<string, string> environment)
    {
        var info = new ProcessStartInfo("node")
        {
            WorkingDirectory = directory,
            UseShellExecute = false,
            CreateNoWindow = true,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            StandardOutputEncoding = System.Text.Encoding.UTF8,
            StandardErrorEncoding = System.Text.Encoding.UTF8
        };
        foreach (var argument in arguments) info.ArgumentList.Add(argument);
        foreach (var pair in environment) info.Environment[pair.Key] = pair.Value;
        return Process.Start(info)!;
    }
    private async Task RunNode(string directory, string[] arguments, Dictionary<string, string> environment)
    {
        using var process = StartNode(directory, arguments, environment);
        var stdout = process.StandardOutput.ReadToEndAsync(); var stderr = process.StandardError.ReadToEndAsync();
        try { await process.WaitForExitAsync().WaitAsync(TimeSpan.FromMinutes(4)); }
        finally { if (!process.HasExited) process.Kill(entireProcessTree: true); }
        var text = await stdout + await stderr; output.WriteLine(text);
        Assert.True(process.ExitCode == 0, text);
    }
}
