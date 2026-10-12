using System.Collections.Concurrent;
using System.IO.Pipes;
using System.Security.AccessControl;
using System.Security.Principal;
using System.Text.Json;
using System.Text.RegularExpressions;
using System.Threading.Channels;
using DigitalMenu.Infrastructure.Persistence;
using Microsoft.AspNetCore.Identity;

namespace DigitalMenu.Api.Platform;

public static class DevelopmentOnboarding
{
    public static IServiceCollection AddDevelopmentOnboarding(this IServiceCollection services, IHostEnvironment environment, IConfiguration configuration)
    {
        if (environment.IsDevelopment() && configuration.GetValue<bool>("DevelopmentOnboarding:Enabled"))
        {
            services.AddSingleton<DevelopmentPipeDelivery>();
            services.AddSingleton<IOwnerOnboardingDelivery>(s => s.GetRequiredService<DevelopmentPipeDelivery>());
            services.AddHostedService(s => s.GetRequiredService<DevelopmentPipeDelivery>());
        }
        else services.AddSingleton<IOwnerOnboardingDelivery, UnconfiguredOwnerOnboardingDelivery>();
        return services;
    }
}

// Local IPC only. Never serialize these envelopes through HTTP or log their contents.
public sealed class DevelopmentPipeDelivery : BackgroundService, IOwnerOnboardingDelivery
{
    private sealed record Invitation(Guid UserId, string Email, string Token)
    {
        public TaskCompletionSource<bool> Committed { get; } = new(TaskCreationOptions.RunContinuationsAsynchronously);
    }
    private readonly Channel<Invitation> queue = Channel.CreateBounded<Invitation>(16);
    private readonly ConcurrentDictionary<Guid, Invitation> staged = new();
    private readonly IServiceScopeFactory scopes;
    private readonly ILogger<DevelopmentPipeDelivery> logger;
    private readonly string pipeName;
    private volatile bool available;

    public DevelopmentPipeDelivery(IHostEnvironment environment, IConfiguration configuration,
        IServiceScopeFactory scopes, ILogger<DevelopmentPipeDelivery> logger)
    {
        if (!environment.IsDevelopment() || !configuration.GetValue<bool>("DevelopmentOnboarding:Enabled"))
            throw new InvalidOperationException("Local onboarding requires explicit Development activation.");
        pipeName = configuration["DevelopmentOnboarding:PipeName"] ?? "DigitalMenu.Onboarding";
        if (!Regex.IsMatch(pipeName, "^[A-Za-z0-9.-]{1,80}$"))
            throw new InvalidOperationException("Invalid local onboarding pipe name.");
        this.scopes = scopes;
        this.logger = logger;
    }
    public bool IsAvailable => available;
    public Task StageAsync(Guid userId, string email, string token, CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        var invitation = new Invitation(userId, email, token);
        if (!available || !staged.TryAdd(userId, invitation)) throw new OnboardingDeliveryException();
        if (!queue.Writer.TryWrite(invitation))
        {
            Abort(userId);
            throw new OnboardingDeliveryException();
        }
        return Task.CompletedTask;
    }
    public void Confirm(Guid userId)
    {
        if (staged.TryRemove(userId, out var invitation)) invitation.Committed.TrySetResult(true);
    }
    public void Abort(Guid userId)
    {
        if (staged.TryRemove(userId, out var invitation)) invitation.Committed.TrySetResult(false);
    }
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        try
        {
            while (!stoppingToken.IsCancellationRequested)
            {
                using var pipe = CreatePrivatePipe();
                available = true;
                await pipe.WaitForConnectionAsync(stoppingToken);
                using var timeout = CancellationTokenSource.CreateLinkedTokenSource(stoppingToken);
                timeout.CancelAfter(TimeSpan.FromMinutes(5));
                try
                {
                    Invitation invitation;
                    do { invitation = await queue.Reader.ReadAsync(timeout.Token); }
                    while (!await invitation.Committed.Task.WaitAsync(timeout.Token));
                    using var scope = scopes.CreateScope();
                    var users = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
                    var user = await users.FindByIdAsync(invitation.UserId.ToString());
                    var valid = user is not null && !await users.HasPasswordAsync(user) &&
                        await users.VerifyUserTokenAsync(user, users.Options.Tokens.PasswordResetTokenProvider, "ResetPassword", invitation.Token);
                    using var writer = new StreamWriter(pipe) { AutoFlush = true };
                    var payload = valid ? JsonSerializer.Serialize(new { userId = invitation.UserId, email = invitation.Email, token = invitation.Token }) : "{}";
                    await writer.WriteLineAsync(payload.AsMemory(), timeout.Token);
                }
                catch (OperationCanceledException) when (!stoppingToken.IsCancellationRequested) { }
                catch (Exception) when (!stoppingToken.IsCancellationRequested)
                {
                    // Never pass an exception/provider payload into the log.
                    logger.LogWarning("Local onboarding consumer failed; invitation may require a fresh local fixture.");
                }
            }
        }
        catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { }
        finally { available = false; }
    }

    private NamedPipeServerStream CreatePrivatePipe()
    {
        if (OperatingSystem.IsWindows())
        {
            using var identity = WindowsIdentity.GetCurrent();
            var user = identity.User ?? throw new InvalidOperationException("Local user identity is required.");
            var security = new PipeSecurity();
            security.SetAccessRuleProtection(true, false);
            security.SetOwner(user);
            // Windows named pipes otherwise support SMB access. Deny network logons explicitly.
            security.AddAccessRule(new PipeAccessRule(new SecurityIdentifier(WellKnownSidType.NetworkSid, null), PipeAccessRights.FullControl, AccessControlType.Deny));
            security.AddAccessRule(new PipeAccessRule(user, PipeAccessRights.FullControl, AccessControlType.Allow));
            return NamedPipeServerStreamAcl.Create(pipeName, PipeDirection.Out, 1, PipeTransmissionMode.Byte,
                PipeOptions.Asynchronous | PipeOptions.FirstPipeInstance, 0, 0, security);
        }
        return new NamedPipeServerStream(pipeName, PipeDirection.Out, 1, PipeTransmissionMode.Byte,
            PipeOptions.Asynchronous | PipeOptions.CurrentUserOnly | PipeOptions.FirstPipeInstance);
    }
}
