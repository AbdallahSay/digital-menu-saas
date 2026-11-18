using System.Linq.Expressions;
using System.Text.Json.Serialization;
using DigitalMenu.Application;
using DigitalMenu.Domain;

namespace DigitalMenu.Api.Catalog;

[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed record ReorderEntry(Guid Id, int? SortOrder, string? RowVersion);
[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed record ReorderRequest(IReadOnlyList<ReorderEntry>? Items);
public sealed record ReorderedEntry(Guid Id, int SortOrder, string RowVersion);
public sealed record ReorderResponse(IReadOnlyList<ReorderedEntry> Items);

/// <summary>Endpoint marker: reorder bodies may carry up to MaxBatchEdit entries.</summary>
public sealed class ReorderMetadata
{
    public const long BodyLimit = 16384;
}

internal static class Reorder
{
    // Shared by categories and items: all-or-nothing, server-scoped, rowVersion-checked, one menu-version bump.
    private static async Task<IResult> ApplyAsync<TEntity>(ReorderRequest? request, ITenantDataSession session,
        Expression<Func<TEntity, bool>> live, Action<TEntity, int> setSort, Func<TEntity, int> getSort,
        CancellationToken ct) where TEntity : VersionedEntity
    {
        var entries = request?.Items;
        if (entries is null || entries.Count is < 1 or > ITenantDataSession.MaxBatchEdit ||
            entries.Any(e => e is null || e.Id == Guid.Empty || e.SortOrder is not >= 0) ||
            entries.Select(e => e.Id).Distinct().Count() != entries.Count)
            throw new TenantBoundaryException(TenantFailure.InvalidRequest);
        var expected = entries.ToDictionary(e => e.Id, e => Version(e.RowVersion));
        var rows = (await session.EditManyAsync(expected, live, ct)).ToDictionary(r => r.Id);
        var now = DateTime.UtcNow;
        foreach (var entry in entries)
        {
            setSort(rows[entry.Id], entry.SortOrder!.Value);
            rows[entry.Id].UpdatedAtUtc = now;
        }
        await session.CommitAsync(ct);
        return Results.Ok(new ReorderResponse(entries.Select(e =>
            new ReorderedEntry(e.Id, getSort(rows[e.Id]), Convert.ToBase64String(rows[e.Id].RowVersion))).ToArray()));
    }

    private static byte[] Version(string? value)
    {
        if (value is { Length: 12 })
            try
            {
                var bytes = Convert.FromBase64String(value);
                if (bytes.Length == 8) return bytes;
            }
            catch (FormatException) { }
        throw new TenantBoundaryException(TenantFailure.InvalidRequest);
    }

    public static RouteHandlerBuilder MapReorder<TEntity>(this RouteGroupBuilder group, Expression<Func<TEntity, bool>> live,
        Action<TEntity, int> setSort, Func<TEntity, int> getSort) where TEntity : VersionedEntity =>
        group.MapPost("/reorder", (ReorderRequest request, ITenantDataSession session, CancellationToken ct) =>
                ApplyAsync(request, session, live, setSort, getSort, ct))
            .WithMetadata(new ReorderMetadata())
            .Produces<ReorderResponse>().ProducesProblem(400).ProducesProblem(404).ProducesProblem(409).ProducesProblem(412);
}
