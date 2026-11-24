using System.ComponentModel.DataAnnotations;
using System.Text.RegularExpressions;
using System.Threading.RateLimiting;
using DigitalMenu.Domain;
using DigitalMenu.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace DigitalMenu.Api.Leads;

/// <summary>
/// Lead intake is closed unless an operator configures it. Collecting personal data requires a
/// published notice version and a retention window; without both the endpoint answers 503.
/// </summary>
public sealed record LeadOptions(string NoticeVersion, int RetentionDays, string ControllerName, string ContactChannel)
{
    public const int MaxRetentionDays = 365;

    public static LeadOptions? FromConfiguration(IConfiguration configuration)
    {
        if (!string.Equals(configuration["Leads:Enabled"], "true", StringComparison.OrdinalIgnoreCase)) return null;
        var notice = configuration["Leads:NoticeVersion"]?.Trim();
        if (string.IsNullOrEmpty(notice) || notice.Length > 40 || notice.Any(char.IsControl))
            throw new InvalidOperationException("Leads:NoticeVersion is required (max 40 chars) when lead intake is enabled.");
        if (!int.TryParse(configuration["Leads:RetentionDays"], out var days) || days < 1 || days > MaxRetentionDays)
            throw new InvalidOperationException("Leads:RetentionDays must be 1 to 365 when lead intake is enabled.");
        var controller = configuration["Leads:ControllerName"]?.Trim();
        var contact = configuration["Leads:ContactChannel"]?.Trim();
        if (string.IsNullOrEmpty(controller) || controller.Length > 120 || controller.Any(char.IsControl) ||
            string.IsNullOrEmpty(contact) || contact.Length > 200 || contact.Any(char.IsControl))
            throw new InvalidOperationException("Leads:ControllerName and Leads:ContactChannel are required when lead intake is enabled.");
        return new LeadOptions(notice, days, controller, contact);
    }
}

public sealed record LeadRequest(string? ContactName, string? BusinessName, string? Phone, string? Email, string? Notes,
    bool? Consent, string? NoticeVersion, string? Website);
public sealed record LeadStatusResponse(bool Open, string? NoticeVersion, int? RetentionDays, string? ControllerName, string? ContactChannel);
public sealed record LeadResponse(Guid Id, DateTime CreatedUtc, DateTime ExpiresUtc, string ContactName, string BusinessName,
    string Phone, string? Email, string? Notes, string Status, string RowVersion);
public sealed record LeadPageResponse(int Page, int PageSize, int Total, LeadResponse[] Items);
public sealed record LeadStatusChange(string? Status, string? RowVersion);

public static partial class LeadEndpoints
{
    public const int BodyLimit = 4096;
    public const int GlobalHourlyCap = 100;
    [GeneratedRegex(@"^\+?[0-9][0-9 \-]{6,22}$")] private static partial Regex PhonePattern();

    public static void AddLeadIntake(this IServiceCollection services, IConfiguration configuration)
    {
        services.AddLeadOptionsHolder(LeadOptions.FromConfiguration(configuration));
        services.AddHostedService<LeadRetentionService>();
        services.AddRateLimiter(o =>
        {
            o.AddPolicy("lead-status", c => RateLimitPartition.GetFixedWindowLimiter(c.Connection.RemoteIpAddress?.ToString() ?? "unknown",
                _ => new FixedWindowRateLimiterOptions { PermitLimit = 60, Window = TimeSpan.FromMinutes(1), QueueLimit = 0 }));
            // Per-source cap here; the global hourly cap is a database count inside Create (one policy per endpoint).
            o.AddPolicy("lead-create", c => RateLimitPartition.GetFixedWindowLimiter("ip:" + (c.Connection.RemoteIpAddress?.ToString() ?? "unknown"),
                _ => new FixedWindowRateLimiterOptions { PermitLimit = 5, Window = TimeSpan.FromMinutes(10), QueueLimit = 0 }));
        });
    }

    private static void AddLeadOptionsHolder(this IServiceCollection services, LeadOptions? options) =>
        services.AddSingleton(new LeadOptionsHolder(options));

    public sealed record LeadOptionsHolder(LeadOptions? Options);

    public static void MapLeads(this WebApplication app)
    {
        app.MapGet("/api/v1/leads/status", (LeadOptionsHolder holder) =>
            Results.Ok(new LeadStatusResponse(holder.Options is not null, holder.Options?.NoticeVersion, holder.Options?.RetentionDays,
                holder.Options?.ControllerName, holder.Options?.ContactChannel)))
            .AllowAnonymous().RequireRateLimiting("lead-status");
        // Under /api/v1/auth so the SSR proxy forwards the antiforgery cookies (public paths are identity-free).
        app.MapPost("/api/v1/auth/leads", Create).AllowAnonymous().RequireRateLimiting("lead-create")
            .Produces(201).ProducesProblem(400).ProducesProblem(415).ProducesProblem(429).ProducesProblem(503);

        var admin = app.MapGroup("/api/v1/platform/leads").RequireAuthorization("PlatformAdmin");
        admin.MapGet("", async (int? page, int? pageSize, MenuDbContext db, CancellationToken ct) =>
        {
            var number = page ?? 1; var size = pageSize ?? 20;
            if (number < 1 || number > 100000 || size < 1 || size > 100) return Problem(400, "Invalid pagination.");
            var now = DateTime.UtcNow;
            var query = db.Set<Lead>().AsNoTracking().Where(l => l.ExpiresUtc > now);
            var total = await query.CountAsync(ct);
            var rows = await query.OrderByDescending(l => l.CreatedUtc).ThenBy(l => l.Id).Skip((number - 1) * size).Take(size).ToListAsync(ct);
            return Results.Ok(new LeadPageResponse(number, size, total, rows.Select(Map).ToArray()));
        });
        admin.MapPatch("/{id:guid}", async (Guid id, LeadStatusChange request, MenuDbContext db, CancellationToken ct) =>
        {
            if (request.Status is not ("New" or "Contacted" or "Closed") || !TryVersion(request.RowVersion, out var expected))
                return Problem(400, "Invalid status or RowVersion.");
            var lead = await db.Set<Lead>().SingleOrDefaultAsync(l => l.Id == id && l.ExpiresUtc > DateTime.UtcNow, ct);
            if (lead is null) return Problem(404, "Lead not found.");
            if (!lead.RowVersion.SequenceEqual(expected)) return Problem(412, "Lead was changed. Reload before retrying.");
            lead.Status = request.Status;
            db.Entry(lead).Property(x => x.RowVersion).OriginalValue = expected;
            try { await db.SaveChangesAsync(ct); }
            catch (DbUpdateConcurrencyException) { return Problem(412, "Lead was changed. Reload before retrying."); }
            return Results.Ok(Map(lead));
        });
        admin.MapDelete("/{id:guid}", async (Guid id, string? rowVersion, MenuDbContext db, CancellationToken ct) =>
        {
            if (!TryVersion(rowVersion, out var expected)) return Problem(400, "RowVersion is required.");
            var lead = await db.Set<Lead>().SingleOrDefaultAsync(l => l.Id == id, ct);
            if (lead is null) return Problem(404, "Lead not found.");
            if (!lead.RowVersion.SequenceEqual(expected)) return Problem(412, "Lead was changed. Reload before retrying.");
            db.Entry(lead).Property(x => x.RowVersion).OriginalValue = expected;
            db.Remove(lead);
            try { await db.SaveChangesAsync(ct); }
            catch (DbUpdateConcurrencyException) { return Problem(412, "Lead was changed. Reload before retrying."); }
            return Results.NoContent();
        });
    }

    private static async Task<IResult> Create(LeadRequest request, LeadOptionsHolder holder, MenuDbContext db, HttpContext context, CancellationToken ct)
    {
        if (holder.Options is not { } options) return Problem(503, "Lead intake is not open.");
        if (!(context.Request.ContentType ?? "").StartsWith("application/json", StringComparison.OrdinalIgnoreCase))
            return Problem(415, "JSON is required.");
        var name = request.ContactName?.Trim(); var business = request.BusinessName?.Trim();
        var phone = request.Phone?.Trim(); var email = string.IsNullOrWhiteSpace(request.Email) ? null : request.Email.Trim();
        var notes = string.IsNullOrWhiteSpace(request.Notes) ? null : request.Notes.Trim();
        if (string.IsNullOrEmpty(name) || name.Length > 120 || name.Any(char.IsControl) ||
            string.IsNullOrEmpty(business) || business.Length > 160 || business.Any(char.IsControl) ||
            string.IsNullOrEmpty(phone) || !PhonePattern().IsMatch(phone) ||
            (email is not null && (email.Length > 256 || !new EmailAddressAttribute().IsValid(email))) ||
            (notes is not null && (notes.Length > 1000 || notes.Any(c => char.IsControl(c) && c is not ('\n' or '\r')))))
            return Problem(400, "Invalid lead fields.");
        if (request.Consent != true || request.NoticeVersion != options.NoticeVersion)
            return Problem(400, "Consent to the current notice is required.");
        // Bots fill hidden fields; they get the same answer as a real submission and nothing is stored.
        if (!string.IsNullOrEmpty(request.Website)) return Results.StatusCode(201);
        var now = DateTime.UtcNow;
        if (!await TryTakeQuota(db, now, ct)) return Problem(429, "Too many requests.");
        db.Add(new Lead
        {
            CreatedUtc = now, ExpiresUtc = now.AddDays(options.RetentionDays), ContactName = name, BusinessName = business,
            Phone = phone, Email = email, Notes = notes, NoticeVersion = options.NoticeVersion,
        });
        await db.SaveChangesAsync(ct);
        return Results.StatusCode(201);
    }

    /// <summary>Atomic shared hourly quota: one conditional UPDATE decides, so concurrent requests and instances cannot exceed the cap.</summary>
    public static async Task<bool> TryTakeQuota(MenuDbContext db, DateTime now, CancellationToken ct)
    {
        var hour = new DateTime(now.Year, now.Month, now.Day, now.Hour, 0, 0, DateTimeKind.Utc);
        for (var attempt = 0; attempt < 3; attempt++)
        {
            var updated = await db.Database.ExecuteSqlInterpolatedAsync(
                $"UPDATE LeadQuotas SET [Count] = [Count] + 1 WHERE HourUtc = {hour} AND [Count] < {GlobalHourlyCap}", ct);
            if (updated == 1) return true;
            if (await db.Set<LeadQuota>().AsNoTracking().AnyAsync(q => q.HourUtc == hour, ct)) return false; // row exists, at cap
            try
            {
                await db.Database.ExecuteSqlInterpolatedAsync($"INSERT INTO LeadQuotas (HourUtc, [Count]) VALUES ({hour}, 1)", ct);
                return true;
            }
            catch (Microsoft.Data.SqlClient.SqlException ex) when (ex.Number is 2627 or 2601) { /* lost the insert race: retry the UPDATE */ }
        }
        return false;
    }

    private static bool TryVersion(string? value, out byte[] version)
    {
        version = [];
        if (string.IsNullOrEmpty(value) || value.Length > 64) return false;
        try { version = Convert.FromBase64String(value); return version.Length > 0; } catch (FormatException) { return false; }
    }

    private static LeadResponse Map(Lead l) => new(l.Id, l.CreatedUtc, l.ExpiresUtc, l.ContactName, l.BusinessName, l.Phone, l.Email, l.Notes, l.Status, Convert.ToBase64String(l.RowVersion));
    private static IResult Problem(int status, string title) => Results.Problem(statusCode: status, title: title);
}

/// <summary>
/// Independent retention purge: runs at startup (catch-up) and on a timer, whether or not intake is open or receives
/// traffic. Deletes expired leads in bounded batches until none are left, and old quota counters.
/// </summary>
public sealed class LeadRetentionService(IServiceScopeFactory scopes, ILogger<LeadRetentionService> log) : BackgroundService
{
    public static readonly TimeSpan Interval = TimeSpan.FromMinutes(15);
    public const int Batch = 500;

    public static async Task<int> PurgeOnce(MenuDbContext db, DateTime now, CancellationToken ct)
    {
        var total = 0;
        while (true)
        {
            var ids = await db.Set<Lead>().Where(l => l.ExpiresUtc <= now).OrderBy(l => l.ExpiresUtc).Select(l => l.Id).Take(Batch).ToListAsync(ct);
            if (ids.Count == 0) break;
            total += await db.Set<Lead>().Where(l => ids.Contains(l.Id)).ExecuteDeleteAsync(ct);
        }
        await db.Set<LeadQuota>().Where(q => q.HourUtc < now.AddDays(-2)).ExecuteDeleteAsync(ct);
        return total;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using var timer = new PeriodicTimer(Interval);
        do
        {
            try
            {
                using var scope = scopes.CreateScope();
                var removed = await PurgeOnce(scope.ServiceProvider.GetRequiredService<MenuDbContext>(), DateTime.UtcNow, stoppingToken);
                if (removed > 0) log.LogInformation("Lead retention purge removed {Count} expired leads.", removed);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { return; }
            catch (Exception ex) { log.LogError(ex, "Lead retention purge failed; will retry next interval."); }
        } while (await timer.WaitForNextTickAsync(stoppingToken).ConfigureAwait(false));
    }
}
