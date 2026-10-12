using System.Text.Json.Serialization;
using DigitalMenu.Application;
using DigitalMenu.Domain;

namespace DigitalMenu.Api.Catalog;

[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed record CreateCategoryRequest(string? NameAr, string? NameEn, int? SortOrder, bool? IsPublished);
[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed record UpdateCategoryRequest(string? NameAr, string? NameEn, int? SortOrder, bool? IsPublished, string? RowVersion);
[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed record DeleteCategoryRequest(string? RowVersion);
public sealed record CategoryResponse(Guid Id, string NameAr, string? NameEn, int SortOrder, bool IsPublished, string RowVersion);
public sealed record CategoryPageResponse(int Page, int PageSize, IReadOnlyList<CategoryResponse> Items);

public static class Categories
{
    private static CategoryResponse Response(Category c) => new(c.Id, c.NameAr, c.NameEn, c.SortOrder,
        c.IsPublished, Convert.ToBase64String(c.RowVersion));
    private static bool Valid(string? ar, string? en, int? order, bool? published) =>
        !string.IsNullOrWhiteSpace(ar) && ar.Trim().Length <= 120 && !ar.Any(char.IsControl) &&
        (en is null || (en.Trim().Length <= 120 && !en.Any(char.IsControl))) && order is >= 0 && published.HasValue;
    private static byte[] Version(string? value)
    {
        try
        {
            var bytes = Convert.FromBase64String(value ?? "");
            if (bytes.Length == 8) return bytes;
        }
        catch (FormatException) { }
        throw new TenantBoundaryException(TenantFailure.InvalidRequest);
    }
    private static async Task<Category> Owned(ITenantDataSession session, Guid id, CancellationToken ct)
    {
        var category = await session.EditAsync<Category>(id, ct);
        if (category.IsDeleted) throw new TenantBoundaryException(TenantFailure.NotFound);
        return category;
    }
    private static void Assign(Category c, string ar, string? en, int order, bool published)
    {
        c.NameAr = ar.Trim();
        c.NameEn = string.IsNullOrWhiteSpace(en) ? null : en.Trim();
        c.SortOrder = order;
        c.IsPublished = published;
        c.UpdatedAtUtc = DateTime.UtcNow;
    }
    public static void MapCategories(this WebApplication app)
    {
        var group = app.MapGroup("/api/v1/admin/categories").RequireAuthorization("TenantOwner");
        group.MapGet("/{id:guid}", async (Guid id, ITenantDataSession session, CancellationToken ct) =>
            Results.Ok(Response(await Owned(session, id, ct))));
        group.MapGet("", async (int? page, int? pageSize, ITenantDataSession session, CancellationToken ct) =>
        {
            var number = page ?? 1;
            var size = pageSize ?? 20;
            var items = await session.ReadCategoriesAsync(c => new CategoryResponse(c.Id, c.NameAr, c.NameEn,
                c.SortOrder, c.IsPublished, Convert.ToBase64String(c.RowVersion)), number, size, ct);
            return Results.Ok(new CategoryPageResponse(number, size, items));
        });
        group.MapPost("", async (CreateCategoryRequest request, ITenantContext tenants, ITenantDataSession session, CancellationToken ct) =>
        {
            if (!Valid(request.NameAr, request.NameEn, request.SortOrder, request.IsPublished))
                throw new TenantBoundaryException(TenantFailure.InvalidRequest);
            var category = new Category { RestaurantId = (await tenants.RequireAsync(ct)).RestaurantId };
            Assign(category, request.NameAr!, request.NameEn, request.SortOrder!.Value, request.IsPublished!.Value);
            await session.StageAsync(category, true, ct);
            await session.CommitAsync(ct);
            return Results.Created($"/api/v1/admin/categories/{category.Id}", Response(category));
        });
        group.MapPut("/{id:guid}", async (Guid id, UpdateCategoryRequest request, ITenantDataSession session, CancellationToken ct) =>
        {
            var category = await Owned(session, id, ct);
            if (!Valid(request.NameAr, request.NameEn, request.SortOrder, request.IsPublished))
                throw new TenantBoundaryException(TenantFailure.InvalidRequest);
            await session.EditAsync<Category>(id, Version(request.RowVersion), ct);
            Assign(category, request.NameAr!, request.NameEn, request.SortOrder!.Value, request.IsPublished!.Value);
            await session.CommitAsync(ct);
            return Results.Ok(Response(category));
        });
        group.MapDelete("/{id:guid}", async (Guid id, [Microsoft.AspNetCore.Mvc.FromBody] DeleteCategoryRequest request, ITenantDataSession session, CancellationToken ct) =>
        {
            var category = await Owned(session, id, ct);
            await session.EditAsync<Category>(id, Version(request.RowVersion), ct);
            category.IsDeleted = true;
            category.UpdatedAtUtc = DateTime.UtcNow;
            await session.CommitAsync(ct);
            return Results.NoContent();
        });
    }
}

