using System.IO.Pipes;
using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using DigitalMenu.Api.Platform;
using DigitalMenu.Infrastructure.Persistence;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using static DigitalMenu.IntegrationTests.AuthenticationTests;

namespace DigitalMenu.IntegrationTests;

public sealed class DevelopmentOnboardingTests
{
    private sealed class CapturedLogs : ILoggerProvider, ILogger
    {
        public System.Collections.Concurrent.ConcurrentQueue<string> Messages { get; } = new();
        public ILogger CreateLogger(string categoryName) => this;
        public bool IsEnabled(LogLevel logLevel) => true;
        public IDisposable? BeginScope<TState>(TState state) where TState : notnull => null;
        public void Log<TState>(LogLevel logLevel, EventId eventId, TState state, Exception? exception, Func<TState, Exception?, string> formatter)
            => Messages.Enqueue(formatter(state, exception));
        public void Dispose() { }
    }
    [Theory]
    [InlineData("Production", true)]
    [InlineData("Production", false)]
    [InlineData("Staging", true)]
    [InlineData("Development", false)]
    public async Task Local_delivery_is_unavailable_without_both_explicit_activation_and_Development(string environment, bool enabled)
    {
        await using var factory = new WebApplicationFactory<Program>().WithWebHostBuilder(b => b.UseEnvironment(environment)
            .UseSetting("DevelopmentOnboarding:Enabled", enabled.ToString()));
        Assert.IsType<UnconfiguredOwnerOnboardingDelivery>(factory.Services.GetRequiredService<IOwnerOnboardingDelivery>());
        Assert.False(factory.Services.GetRequiredService<IOwnerOnboardingDelivery>().IsAvailable);
        Assert.DoesNotContain(factory.Services.GetServices<IHostedService>(), s => s is DevelopmentPipeDelivery);
        if (environment == "Production" && enabled)
            Assert.Throws<InvalidOperationException>(() => new DevelopmentPipeDelivery(
                factory.Services.GetRequiredService<IHostEnvironment>(), factory.Services.GetRequiredService<IConfiguration>(),
                factory.Services.GetRequiredService<IServiceScopeFactory>(), factory.Services.GetRequiredService<ILogger<DevelopmentPipeDelivery>>()));
    }

    [SqlServerFact]
    public async Task Opted_in_runtime_delivers_only_committed_invitation_over_private_IPC_and_reuses_existing_auth_flow()
    {
        var name = "DigitalMenu.Test." + Guid.NewGuid().ToString("N");
        var logs = new CapturedLogs();
        await using var fixture = await AuthFixture.Create(empty: true, onboardingPipe: name, configure: s => s.AddLogging(b => b.AddProvider(logs)));
        var config = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["ConnectionStrings:MenuDatabase"] = fixture.Connection,
            ["Bootstrap:Email"] = "admin@example.test",
            ["Bootstrap:Password"] = fixture.Password
        }).Build();
        await DigitalMenu.Api.Auth.DevelopmentBootstrap.RunAsync(fixture.Factory.Services,
            fixture.Factory.Services.GetRequiredService<IHostEnvironment>(), config);
        var admin = new Browser(fixture.Factory);
        await admin.Csrf();
        Assert.Equal(HttpStatusCode.NoContent, (await admin.Login(fixture.Password, "admin@example.test")).StatusCode);
        await admin.Csrf();
        var result = await admin.Send(HttpMethod.Post, "/api/v1/platform/restaurants", new { name = "Local Owner", slug = "local-owner", ownerEmail = "local@example.test" });
        Assert.Equal(HttpStatusCode.Created, result.StatusCode);
        using var client = new NamedPipeClientStream(".", name, PipeDirection.In, PipeOptions.Asynchronous | PipeOptions.CurrentUserOnly);
        await client.ConnectAsync(10000);
        if (OperatingSystem.IsWindows())
        {
            var security = client.GetAccessControl();
            using var identity = System.Security.Principal.WindowsIdentity.GetCurrent();
            Assert.Equal(identity.User, security.GetOwner(typeof(System.Security.Principal.SecurityIdentifier)));
            var network = new System.Security.Principal.SecurityIdentifier(System.Security.Principal.WellKnownSidType.NetworkSid, null);
            var deniesNetwork = false;
            foreach (System.IO.Pipes.PipeAccessRule rule in security.GetAccessRules(true, false, typeof(System.Security.Principal.SecurityIdentifier)))
                if (rule.IdentityReference == network && rule.AccessControlType == System.Security.AccessControl.AccessControlType.Deny)
                    deniesNetwork = true;
            Assert.True(deniesNetwork);
        }
        using var reader = new StreamReader(client);
        using var invitation = JsonDocument.Parse((await reader.ReadLineAsync().WaitAsync(TimeSpan.FromSeconds(10)))!);
        var token = invitation.RootElement.GetProperty("token").GetString()!;
        Assert.DoesNotContain(token, await result.Content.ReadAsStringAsync());
        var owner = new Browser(fixture.Factory);
        var body = new { userId = invitation.RootElement.GetProperty("userId").GetGuid(), token, password = fixture.Password };
        Assert.Equal(HttpStatusCode.BadRequest, (await owner.Send(HttpMethod.Post, "/onboarding", body)).StatusCode);
        await owner.Csrf();
        Assert.Equal(HttpStatusCode.NoContent, (await owner.Send(HttpMethod.Post, "/onboarding", body)).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await owner.Send(HttpMethod.Post, "/onboarding", body)).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await owner.Login(fixture.Password, "local@example.test")).StatusCode);
        Assert.Contains("Local Owner", await (await owner.Send(HttpMethod.Get, "/me")).Content.ReadAsStringAsync());
        var logged = string.Join('\n', logs.Messages);
        Assert.False(logged.Contains(token, StringComparison.Ordinal), "Onboarding tokens must not enter application logs.");
        Assert.False(logged.Contains(fixture.Password, StringComparison.Ordinal), "Passwords must not enter application logs.");
    }

    [SqlServerFact]
    public async Task Aborted_staging_is_not_delivered_and_bounded_queue_rejects_excess_without_secrets()
    {
        var name = "DigitalMenu.Test." + Guid.NewGuid().ToString("N");
        await using var fixture = await AuthFixture.Create(onboardingPipe: name);
        var delivery = fixture.Factory.Services.GetRequiredService<IOwnerOnboardingDelivery>();
        for (var i = 0; i < 16; i++)
        {
            var id = Guid.NewGuid();
            await delivery.StageAsync(id, "aborted@example.test", "not-a-valid-token", CancellationToken.None);
            delivery.Abort(id);
        }
        await Assert.ThrowsAsync<OnboardingDeliveryException>(() => delivery.StageAsync(Guid.NewGuid(), "overflow@example.test", "not-a-valid-token", CancellationToken.None));
        using var client = new NamedPipeClientStream(".", name, PipeDirection.In, PipeOptions.Asynchronous | PipeOptions.CurrentUserOnly);
        await client.ConnectAsync(10000);
        using var reader = new StreamReader(client);
        var read = reader.ReadLineAsync();
        var winner = await Task.WhenAny(read, Task.Delay(150));
        Assert.NotSame(read, winner); // no aborted invitation is sent
    }
}
