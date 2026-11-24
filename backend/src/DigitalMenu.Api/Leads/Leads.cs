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
    string Phone, string? Email, string? Notes, string Status);
public sealed record LeadPageResponse(int Page, int PageSize, int Total, LeadResponse[] Items);
public sealed record LeadStatusChange(string? Status);

public static partial class LeadEndpoints
{
    public const int BodyLimit = 4096;
    public const int GlobalHourlyCap = 100;
    [GeneratedRegex(@"^\+?[0-9][0-9 \-]{6,22}$")] private static partial Regex PhonePattern();

    public static void AddLeadIntake(this IServiceCollection services, IConfiguration configuration)
    {
        services.AddLeadOptionsHolder(LeadOptions.FromConfiguration(configuration));
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
            if (request.Status is not ("New" or "Contacted" or "Closed")) return Problem(400, "Invalid status.");
            var lead = await db.Set<Lead>().SingleOrDefaultAsync(l => l.Id == id && l.ExpiresUtc > DateTime.UtcNow, ct);
            if (lead is null) return Problem(404, "Lead not found.");
            lead.Status = request.Status;
            await db.SaveChangesAsync(ct);
            return Results.Ok(Map(lead));
        });
        admin.MapDelete("/{id:guid}", async (Guid id, MenuDbContext db, CancellationToken ct) =>
        {
            var deleted = await db.Set<Lead>().Where(l => l.Id == id).ExecuteDeleteAsync(ct);
            return deleted == 0 ? Problem(404, "Lead not found.") : Results.NoContent();
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
        if (await db.Set<Lead>().CountAsync(l => l.CreatedUtc > now.AddHours(-1), ct) >= GlobalHourlyCap)
            return Problem(429, "Too many requests.");
        // Retention is enforced here too: expired rows are removed in bounded batches on every accepted write.
        await db.Set<Lead>().Where(l => l.ExpiresUtc <= now).Take(100).ExecuteDeleteAsync(ct);
        db.Add(new Lead
        {
            CreatedUtc = now, ExpiresUtc = now.AddDays(options.RetentionDays), ContactName = name, BusinessName = business,
            Phone = phone, Email = email, Notes = notes, NoticeVersion = options.NoticeVersion,
        });
        await db.SaveChangesAsync(ct);
        return Results.StatusCode(201);
    }

    private static LeadResponse Map(Lead l) => new(l.Id, l.CreatedUtc, l.ExpiresUtc, l.ContactName, l.BusinessName, l.Phone, l.Email, l.Notes, l.Status);
    private static IResult Problem(int status, string title) => Results.Problem(statusCode: status, title: title);
}
