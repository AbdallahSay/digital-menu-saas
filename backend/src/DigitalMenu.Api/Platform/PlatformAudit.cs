using System.Globalization;
using System.Security.Claims;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using DigitalMenu.Domain;
using DigitalMenu.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace DigitalMenu.Api.Platform;

public sealed record AuditEntryResponse(Guid Id, DateTime TimestampUtc, string Action, string ResourceType,
    Guid? ResourceId, Guid? RestaurantId, string? RestaurantName, Guid? ActorUserId, string? CorrelationId,
    IReadOnlyDictionary<string, string?>? Metadata);
public sealed record AuditPageResponse(int Page, int PageSize, int Total, IReadOnlyList<AuditEntryResponse> Items);

// PlatformAdmin-only, read-only view over AuditEntries. Filters are server-validated and bound;
// no free-text search over metadata is offered.
public static partial class PlatformAudit
{
    public const int MaxExportRows = 5000;
    private const string Route = "/api/v1/platform/audit";
    [GeneratedRegex("^[A-Za-z]{1,100}$")]
    private static partial Regex ActionPattern();

    private sealed record Filter(string? Action, Guid? RestaurantId, DateTime? FromUtc, DateTime? ToUtc);
    internal sealed record Row(AuditEntry Entry, string? RestaurantName);

    public static void MapPlatformAudit(this WebApplication app)
    {
        var group = app.MapGroup(Route).RequireAuthorization("PlatformAdmin");
        group.MapGet("", async (string? action, Guid? restaurantId, string? fromUtc, string? toUtc, int? page, int? pageSize,
            MenuDbContext db, CancellationToken ct) =>
        {
            var number = page ?? 1;
            var size = pageSize ?? 50;
            if (number < 1 || number > 100000 || size < 1 || size > 200)
                return Problem("Invalid pagination.");
            if (!TryFilter(action, restaurantId, fromUtc, toUtc, out var filter, out var error)) return Problem(error);
            var query = Apply(db, filter);
            var total = await query.CountAsync(ct);
            var rows = await Project(db, query).Skip((number - 1) * size).Take(size).ToListAsync(ct);
            return Results.Ok(new AuditPageResponse(number, size, total, rows.Select(Response).ToArray()));
        }).Produces<AuditPageResponse>().ProducesProblem(400);

        group.MapGet("/export", async (string? action, Guid? restaurantId, string? fromUtc, string? toUtc,
            MenuDbContext db, HttpContext context, CancellationToken ct) =>
        {
            if (!TryFilter(action, restaurantId, fromUtc, toUtc, out var filter, out var error)) return Problem(error);
            // One bounded read (cap + 1) keeps memory fixed even if rows are inserted concurrently.
            var rows = await Project(db, Apply(db, filter)).Take(MaxExportRows + 1).ToListAsync(ct);
            if (rows.Count > MaxExportRows)
                return Problem($"Export is limited to {MaxExportRows} rows; narrow the filters.");
            // Exporting audit history is itself audited (metadata holds only the validated filters and count).
            db.Add(new AuditEntry
            {
                ActorUserId = Guid.Parse(context.User.FindFirstValue(ClaimTypes.NameIdentifier)!),
                RestaurantId = filter.RestaurantId is { } id && await db.Set<Restaurant>().AnyAsync(r => r.Id == id, ct) ? id : null,
                Action = "AuditExported",
                ResourceType = "AuditLog",
                CorrelationId = context.TraceIdentifier.Length <= 100 ? context.TraceIdentifier : null,
                MetadataJson = JsonSerializer.Serialize(new Dictionary<string, string?>
                {
                    ["action"] = filter.Action,
                    ["restaurantId"] = filter.RestaurantId?.ToString("D"),
                    ["fromUtc"] = Iso(filter.FromUtc),
                    ["toUtc"] = Iso(filter.ToUtc),
                    ["rows"] = rows.Count.ToString(CultureInfo.InvariantCulture)
                })
            });
            await db.SaveChangesAsync(ct);
            var name = "audit-" + DateTime.UtcNow.ToString("yyyyMMdd'T'HHmmss'Z'", CultureInfo.InvariantCulture) + ".csv";
            return Results.File(Csv(rows), "text/csv; charset=utf-8", name);
        }).Produces(200, contentType: "text/csv").ProducesProblem(400);
    }

    private static IResult Problem(string title) => Results.Problem(statusCode: 400, title: title);

    private static bool TryFilter(string? action, Guid? restaurantId, string? fromUtc, string? toUtc, out Filter filter, out string error)
    {
        filter = new Filter(null, null, null, null);
        error = "";
        action = string.IsNullOrWhiteSpace(action) ? null : action.Trim();
        if (action is not null && !ActionPattern().IsMatch(action)) { error = "Invalid action filter."; return false; }
        if (restaurantId == Guid.Empty) { error = "Invalid restaurant filter."; return false; }
        if (!TryInstant(fromUtc, out var from) || !TryInstant(toUtc, out var to))
        { error = "Dates must be ISO 8601 (UTC assumed when no offset is given)."; return false; }
        if (from is not null && to is not null && from >= to) { error = "fromUtc must be earlier than toUtc."; return false; }
        filter = new Filter(action, restaurantId, from, to);
        return true;
    }

    private static bool TryInstant(string? value, out DateTime? instant)
    {
        instant = null;
        if (string.IsNullOrWhiteSpace(value)) return true;
        if (value.Length > 40 || !DateTimeOffset.TryParse(value, CultureInfo.InvariantCulture,
                DateTimeStyles.AssumeUniversal | DateTimeStyles.AdjustToUniversal, out var parsed)) return false;
        instant = parsed.UtcDateTime;
        return true;
    }

    // From is inclusive, To is exclusive.
    private static IQueryable<AuditEntry> Apply(MenuDbContext db, Filter filter)
    {
        var query = db.Set<AuditEntry>().AsNoTracking();
        if (filter.Action is { } action) query = query.Where(a => a.Action == action);
        if (filter.RestaurantId is { } id) query = query.Where(a => a.RestaurantId == id);
        if (filter.FromUtc is { } from) query = query.Where(a => a.TimestampUtc >= from);
        if (filter.ToUtc is { } to) query = query.Where(a => a.TimestampUtc < to);
        return query;
    }

    private static IQueryable<Row> Project(MenuDbContext db, IQueryable<AuditEntry> query) =>
        from a in query
        join r in db.Set<Restaurant>().AsNoTracking() on a.RestaurantId equals r.Id into restaurants
        from r in restaurants.DefaultIfEmpty()
        orderby a.TimestampUtc descending, a.Id descending
        select new Row(a, r == null ? null : r.Name);

    private static AuditEntryResponse Response(Row row) => new(row.Entry.Id,
        DateTime.SpecifyKind(row.Entry.TimestampUtc, DateTimeKind.Utc), row.Entry.Action, row.Entry.ResourceType,
        row.Entry.ResourceId, row.Entry.RestaurantId, row.RestaurantName, row.Entry.ActorUserId, row.Entry.CorrelationId,
        Metadata(row.Entry.MetadataJson));

    private static Dictionary<string, string?>? Metadata(string? json)
    {
        if (json is null) return null;
        try { return JsonSerializer.Deserialize<Dictionary<string, string?>>(json); }
        catch (JsonException) { return null; }
    }

    private static string? Iso(DateTime? value) =>
        value?.ToString("yyyy-MM-dd'T'HH:mm:ss.fffffff'Z'", CultureInfo.InvariantCulture);

    internal static byte[] Csv(IEnumerable<Row> rows)
    {
        var builder = new StringBuilder();
        builder.Append("timestampUtc,action,resourceType,resourceId,restaurantId,restaurantName,actorUserId,correlationId,reason,metadata\r\n");
        foreach (var row in rows)
        {
            var e = row.Entry;
            var metadata = Metadata(e.MetadataJson);
            string?[] cells = [Iso(e.TimestampUtc), e.Action, e.ResourceType, e.ResourceId?.ToString("D"),
                e.RestaurantId?.ToString("D"), row.RestaurantName, e.ActorUserId?.ToString("D"), e.CorrelationId,
                metadata?.GetValueOrDefault("reason"), e.MetadataJson];
            builder.AppendJoin(',', cells.Select(Cell)).Append("\r\n");
        }
        // UTF-8 BOM so spreadsheet tools render Arabic restaurant names and reasons correctly.
        return [.. Encoding.UTF8.GetPreamble(), .. Encoding.UTF8.GetBytes(builder.ToString())];
    }

    // RFC 4180 quoting plus spreadsheet formula-injection neutralisation (CWE-1236).
    public static string Cell(string? value)
    {
        if (string.IsNullOrEmpty(value)) return "";
        if (value[0] is '=' or '+' or '-' or '@' or '\t' or '\r' or '|' or '%') value = "'" + value;
        return "\"" + value.Replace("\"", "\"\"", StringComparison.Ordinal) + "\"";
    }
}
