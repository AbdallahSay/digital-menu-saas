using System.Text.Json.Serialization;
using DigitalMenu.Application;
using DigitalMenu.Domain;

namespace DigitalMenu.Api.Catalog;

[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed record CreateItemRequest(Guid CategoryId, string? NameAr, string? NameEn, string? DescriptionAr,
    string? DescriptionEn, decimal? Price, string? CurrencyCode, int? SortOrder, bool? IsPublished, bool? IsAvailable, bool? IsFeatured = null);
[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed record UpdateItemRequest(Guid CategoryId, string? NameAr, string? NameEn, string? DescriptionAr,
    string? DescriptionEn, decimal? Price, string? CurrencyCode, int? SortOrder, bool? IsPublished, bool? IsAvailable, string? RowVersion, bool? IsFeatured = null);
[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed record DeleteItemRequest(string? RowVersion);
public sealed record ItemResponse(Guid Id, Guid CategoryId, string NameAr, string? NameEn, string? DescriptionAr,
    string? DescriptionEn, decimal Price, string CurrencyCode, int SortOrder, bool IsPublished, bool IsAvailable, string RowVersion, Guid? ImageId = null, bool IsFeatured = false);
public sealed record ItemPageResponse(int Page, int PageSize, IReadOnlyList<ItemResponse> Items);

public static class Items
{
    private static ItemResponse Response(MenuItem i) => new(i.Id, i.CategoryId, i.NameAr, i.NameEn,
        i.DescriptionAr, i.DescriptionEn, i.Price, i.CurrencyCode, i.SortOrder, i.IsPublished, i.IsAvailable, Convert.ToBase64String(i.RowVersion), null, i.IsFeatured);
    // Attaches the first stored image id (by sort order) so the owner UI can read it back through the
    // tenant-scoped admin media endpoint. Reads go through the tenant session, never a raw context.
    private static async Task<IReadOnlyList<ItemResponse>> WithImages(ITenantDataSession session, IReadOnlyList<ItemResponse> items, CancellationToken ct)
    {
        if (items.Count == 0) return items;
        var first = new Dictionary<Guid, Guid>();
        foreach (var chunk in items.Select(i => i.Id).Chunk(100))
            foreach (var (itemId, imageId) in await session.ReadFirstImagesAsync(chunk, ct)) first[itemId] = imageId;
        return items.Select(i => first.TryGetValue(i.Id, out var best) ? i with { ImageId = best } : i).ToArray();
    }
    private static string? Optional(string? text) => string.IsNullOrWhiteSpace(text) ? null : text.Trim();
    private static bool Text(string? text, int length, bool multiline = false) => text is null ||
        (text.Trim().Length <= length && !text.Any(c => char.IsControl(c) && !(multiline && c is '\r' or '\n' or '\t')));
    private static void Assign(MenuItem item, CreateItemRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.NameAr) || !Text(request.NameAr, 150) || !Text(request.NameEn, 150) ||
            !Text(request.DescriptionAr, 2000, true) || !Text(request.DescriptionEn, 2000, true) ||
            request.Price is not { } price || price < 0 || price > 9999999999999999.99m || decimal.Round(price, 2) != price ||
            request.CurrencyCode != "EGP" || request.SortOrder is not >= 0 || !request.IsPublished.HasValue || !request.IsAvailable.HasValue)
            throw new TenantBoundaryException(TenantFailure.InvalidRequest);
        item.CategoryId = request.CategoryId;
        item.NameAr = request.NameAr.Trim();
        item.NameEn = Optional(request.NameEn);
        item.DescriptionAr = Optional(request.DescriptionAr);
        item.DescriptionEn = Optional(request.DescriptionEn);
        item.Price = price;
        item.CurrencyCode = request.CurrencyCode;
        item.SortOrder = request.SortOrder.Value;
        item.IsPublished = request.IsPublished.Value;
        item.IsAvailable = request.IsAvailable.Value;
        // Omitted means unchanged on update (old clients keep working) and false on create.
        if (request.IsFeatured.HasValue) item.IsFeatured = request.IsFeatured.Value;
        item.UpdatedAtUtc = DateTime.UtcNow;
    }
    private static byte[] Version(string? text)
    {
        try { var bytes = Convert.FromBase64String(text ?? ""); if (bytes.Length == 8) return bytes; }
        catch (FormatException) { }
        throw new TenantBoundaryException(TenantFailure.InvalidRequest);
    }
    private static async Task<MenuItem> Owned(ITenantDataSession session, Guid id, CancellationToken ct)
    {
        var item = await session.EditAsync<MenuItem>(id, ct);
        if (item.IsDeleted) throw new TenantBoundaryException(TenantFailure.NotFound);
        return item;
    }
    public static void MapItems(this WebApplication app)
    {
        var group = app.MapGroup("/api/v1/admin/items").RequireAuthorization("TenantOwner");
        group.MapGet("", async (int? page, int? pageSize, Guid? categoryId, string? search, ITenantDataSession session, CancellationToken ct) =>
        {
            var number = page ?? 1;
            var size = pageSize ?? 20;
            var items = await session.ReadItemsAsync(i => new ItemResponse(i.Id, i.CategoryId, i.NameAr, i.NameEn,
                i.DescriptionAr, i.DescriptionEn, i.Price, i.CurrencyCode, i.SortOrder, i.IsPublished, i.IsAvailable,
                Convert.ToBase64String(i.RowVersion), null, i.IsFeatured), number, size, categoryId, search, ct);
            return Results.Ok(new ItemPageResponse(number, size, await WithImages(session, items, ct)));
        });
        group.MapGet("/{id:guid}", async (Guid id, ITenantDataSession session, CancellationToken ct) =>
            Results.Ok((await WithImages(session, [Response(await Owned(session, id, ct))], ct))[0]));
        group.MapPost("", async (CreateItemRequest request, ITenantContext tenants, ITenantDataSession session, CancellationToken ct) =>
        {
            var item = new MenuItem { RestaurantId = (await tenants.RequireAsync(ct)).RestaurantId };
            Assign(item, request);
            await session.StageAsync(item, true, ct);
            await session.CommitAsync(ct);
            return Results.Created($"/api/v1/admin/items/{item.Id}", Response(item));
        });
        group.MapPut("/{id:guid}", async (Guid id, UpdateItemRequest request, ITenantDataSession session, CancellationToken ct) =>
        {
            var item = await Owned(session, id, ct);
            await session.EditAsync<MenuItem>(id, Version(request.RowVersion), ct);
            Assign(item, new(request.CategoryId, request.NameAr, request.NameEn, request.DescriptionAr, request.DescriptionEn,
                request.Price, request.CurrencyCode, request.SortOrder, request.IsPublished, request.IsAvailable, request.IsFeatured));
            await session.CommitAsync(ct);
            return Results.Ok(Response(item));
        });
        group.MapDelete("/{id:guid}", async (Guid id, [Microsoft.AspNetCore.Mvc.FromBody] DeleteItemRequest request, ITenantDataSession session, CancellationToken ct) =>
        {
            var item = await Owned(session, id, ct);
            await session.EditAsync<MenuItem>(id, Version(request.RowVersion), ct);
            item.IsDeleted = true;
            item.UpdatedAtUtc = DateTime.UtcNow;
            await session.CommitAsync(ct);
            return Results.NoContent();
        });
    }
}
