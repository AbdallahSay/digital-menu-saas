using System.ComponentModel.DataAnnotations;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text.Json.Serialization;
using System.Text.RegularExpressions;
using DigitalMenu.Domain;
using DigitalMenu.Infrastructure.Persistence;
using Microsoft.AspNetCore.Identity;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;

namespace DigitalMenu.Api.Platform;

// Local/test adapters retain secrets only in memory/private IPC and never send external mail.
public interface IOwnerOnboardingDelivery
{
    bool IsAvailable { get; }
    Task StageAsync(Guid userId, string email, string token, CancellationToken cancellationToken);
    void Confirm(Guid userId) { }
    void Abort(Guid userId) { }
}

public sealed class UnconfiguredOwnerOnboardingDelivery : IOwnerOnboardingDelivery
{
    public bool IsAvailable => false;
    public Task StageAsync(Guid userId, string email, string token, CancellationToken cancellationToken)
        => throw new InvalidOperationException("Owner onboarding delivery is not configured.");
}

public interface IRestaurantPublicCodeGenerator
{
    string Generate();
}
public sealed class CryptographicPublicCodeGenerator : IRestaurantPublicCodeGenerator
{
    public string Generate() => Provisioning.NewPublicCode();
}

[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed record ProvisionRestaurantRequest(string? Name, string? Slug, string? OwnerEmail);
[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed record RestaurantStatusRequest(string? Status, string? RowVersion);
[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed record RestaurantPublicationRequest(bool? IsPublished, string? RowVersion);
[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed record CompleteOnboardingRequest(Guid UserId, string? Token, string? Password);
public sealed record RestaurantResponse(Guid Id, string Name, string Slug, string PublicCode,
    string Status, bool IsPublished, long PublishedMenuVersion, string RowVersion);
public sealed record RestaurantPageResponse(int Page, int PageSize, int Total, IReadOnlyList<RestaurantResponse> Items);

public static partial class Provisioning
{
    [GeneratedRegex("^[a-z0-9]+(?:-[a-z0-9]+)*$")]
    private static partial Regex SlugPattern();
    public static string NewPublicCode() => Convert.ToHexStringLower(RandomNumberGenerator.GetBytes(10));
    private static IResult Problem(int status, string title) => Results.Problem(statusCode: status, title: title);
    private static RestaurantResponse Response(Restaurant r) => new(r.Id, r.Name, r.Slug, r.PublicCode,
        r.Status, r.IsPublished, r.PublishedMenuVersion, Convert.ToBase64String(r.RowVersion));

    public static void MapPlatformProvisioning(this WebApplication app)
    {
        var group = app.MapGroup("/api/v1/platform/restaurants").RequireAuthorization("PlatformAdmin");
        group.MapGet("", async (int? page, int? pageSize, string? search, MenuDbContext db, CancellationToken ct) =>
        {
            var number = page ?? 1;
            var size = pageSize ?? 20;
            if (number < 1 || number > 100000 || size < 1 || size > 100 || search?.Length > 150)
                return Problem(400, "Invalid pagination or search.");
            var query = db.Set<Restaurant>().AsNoTracking();
            if (!string.IsNullOrWhiteSpace(search))
            {
                var term = search.Trim();
                query = query.Where(r => r.Name.Contains(term) || r.Slug.Contains(term));
            }
            var total = await query.CountAsync(ct);
            var rows = await query.OrderBy(r => r.CreatedAtUtc).ThenBy(r => r.Id)
                .Skip((number - 1) * size).Take(size).ToListAsync(ct);
            return Results.Ok(new RestaurantPageResponse(number, size, total, rows.Select(Response).ToArray()));
        }).Produces<RestaurantPageResponse>().ProducesProblem(400);
        group.MapGet("/{id:guid}", async (Guid id, MenuDbContext db, CancellationToken ct) =>
        {
            var restaurant = await db.Set<Restaurant>().AsNoTracking().SingleOrDefaultAsync(r => r.Id == id, ct);
            return restaurant is null ? Problem(404, "Restaurant not found.") : Results.Ok(Response(restaurant));
        }).Produces<RestaurantResponse>().ProducesProblem(404);
        group.MapPost("", Create).Produces<RestaurantResponse>(201).ProducesProblem(400).ProducesProblem(409).ProducesProblem(503);
        group.MapPatch("/{id:guid}/status", (Guid id, RestaurantStatusRequest request, MenuDbContext db,
            HttpContext context, CancellationToken ct) => Change(id, request.Status, null, request.RowVersion, db, context, ct))
            .Produces<RestaurantResponse>().ProducesProblem(400).ProducesProblem(404).ProducesProblem(412);
        group.MapPatch("/{id:guid}/publication", (Guid id, RestaurantPublicationRequest request, MenuDbContext db,
            HttpContext context, CancellationToken ct) => request.IsPublished is null
                ? Task.FromResult(Problem(400, "IsPublished is required."))
                : Change(id, null, request.IsPublished, request.RowVersion, db, context, ct))
            .Produces<RestaurantResponse>().ProducesProblem(400).ProducesProblem(404).ProducesProblem(412);
        app.MapPost("/api/v1/auth/onboarding", CompleteOnboarding).AllowAnonymous().RequireRateLimiting("auth")
            .Produces(204).ProducesProblem(400).ProducesProblem(409).ProducesProblem(429);
    }

    private static async Task<IResult> Create(ProvisionRestaurantRequest request, MenuDbContext db,
        UserManager<ApplicationUser> users, IOwnerOnboardingDelivery delivery, IRestaurantPublicCodeGenerator codes, IHostEnvironment environment,
        HttpContext context, CancellationToken ct)
    {
        var name = request.Name?.Trim();
        var slug = request.Slug?.Trim().ToLowerInvariant();
        var email = request.OwnerEmail?.Trim();
        if (string.IsNullOrWhiteSpace(name) || name.Length > 150 || name.Any(char.IsControl) ||
            string.IsNullOrEmpty(slug) || slug.Length > 100 || !SlugPattern().IsMatch(slug) ||
            string.IsNullOrEmpty(email) || email.Length > 256 || !new EmailAddressAttribute().IsValid(email))
            return Problem(400, "Invalid restaurant or owner fields.");
        // Explicit local/test boundary. A production delivery/outbox requires a separate reviewed increment.
        if (!environment.IsDevelopment() || !delivery.IsAvailable)
            return Problem(503, "Owner onboarding delivery is not configured for local testing.");
        var stagedOwner = Guid.Empty;
        try
        {
            await using var transaction = await db.Database.BeginTransactionAsync(System.Data.IsolationLevel.Serializable, ct);
            if (await db.Set<Restaurant>().AnyAsync(r => r.Slug == slug, ct) || await users.FindByEmailAsync(email) is not null)
                return Problem(409, "Restaurant slug or owner account conflicts.");
            var owner = new ApplicationUser { Id = Guid.NewGuid(), UserName = email, Email = email };
            stagedOwner = owner.Id;
            if (!(await users.CreateAsync(owner)).Succeeded)
                return Problem(409, "Owner account could not be created.");
            var restaurant = new Restaurant { Name = name, Slug = slug, PublicCode = codes.Generate() };
            db.AddRange(restaurant, new RestaurantUser { RestaurantId = restaurant.Id, UserId = owner.Id },
                new RestaurantSettings { RestaurantId = restaurant.Id }, Audit(context, restaurant.Id, "RestaurantProvisioned"));
            await db.SaveChangesAsync(ct);
            // Local IPC staging waits for Confirm after commit; finally Abort suppresses rollback.
            // Test-only sinks may retain an unusable token whose user was never committed.
            var token = await users.GeneratePasswordResetTokenAsync(owner);
            try { await delivery.StageAsync(owner.Id, email, token, ct); }
            catch (Exception ex) when (ex is not OperationCanceledException) { throw new OnboardingDeliveryException(); }
            await transaction.CommitAsync(ct);
            delivery.Confirm(owner.Id);
            return Results.Created($"/api/v1/platform/restaurants/{restaurant.Id}", Response(restaurant));
        }
        catch (Exception ex) when (IsConflict(ex)) { return Problem(409, "Provisioning conflicts with another request."); }
        catch (OnboardingDeliveryException) { return Problem(503, "Owner onboarding delivery failed."); }
        finally { delivery.Abort(stagedOwner); }
    }

    private static async Task<IResult> Change(Guid id, string? status, bool? published, string? version,
        MenuDbContext db, HttpContext context, CancellationToken ct)
    {
        if ((published is null && status is not ("Active" or "Suspended")) || !TryVersion(version, out var expected))
            return Problem(400, "Invalid state or RowVersion.");
        var restaurant = await db.Set<Restaurant>().SingleOrDefaultAsync(r => r.Id == id, ct);
        if (restaurant is null) return Problem(404, "Restaurant not found.");
        if (!restaurant.RowVersion.SequenceEqual(expected)) return Problem(412, "Restaurant was changed. Reload before retrying.");
        if (published is not null ? restaurant.IsPublished == published : restaurant.Status == status)
            return Results.Ok(Response(restaurant));
        if (published is not null) restaurant.IsPublished = published.Value;
        else restaurant.Status = status!;
        restaurant.UpdatedAtUtc = DateTime.UtcNow;
        restaurant.PublishedMenuVersion++;
        db.Entry(restaurant).Property(r => r.RowVersion).OriginalValue = expected;
        db.Add(Audit(context, id, published is not null
            ? (published.Value ? "RestaurantPublished" : "RestaurantUnpublished")
            : (status == "Active" ? "RestaurantReactivated" : "RestaurantSuspended")));
        try { await db.SaveChangesAsync(ct); }
        catch (DbUpdateConcurrencyException) { return Problem(412, "Restaurant was changed. Reload before retrying."); }
        return Results.Ok(Response(restaurant));
    }

    private static async Task<IResult> CompleteOnboarding(CompleteOnboardingRequest request, MenuDbContext db,
        UserManager<ApplicationUser> users, HttpContext context, CancellationToken ct)
    {
        if (request.UserId == Guid.Empty || string.IsNullOrEmpty(request.Token) || request.Token.Length > 4096 ||
            string.IsNullOrEmpty(request.Password) || request.Password.Length > 256)
            return Problem(400, "Invalid onboarding request.");
        if (context.User.Identity?.IsAuthenticated == true) return Problem(409, "Sign out before onboarding.");
        await using var transaction = await db.Database.BeginTransactionAsync(ct);
        var owner = await users.FindByIdAsync(request.UserId.ToString());
        if (owner is null || await users.HasPasswordAsync(owner) || owner.TwoFactorEnabled || await users.IsLockedOutAsync(owner) ||
            await users.IsInRoleAsync(owner, "PlatformAdmin") ||
            !await (from m in db.Set<RestaurantUser>()
                    join r in db.Set<Restaurant>() on m.RestaurantId equals r.Id
                    where m.UserId == owner.Id && m.IsActive && m.Role == "Owner" && r.Status == "Active"
                    select m).AnyAsync(ct))
            return Problem(400, "Invalid or expired onboarding request.");
        var result = await users.ResetPasswordAsync(owner, request.Token, request.Password);
        if (!result.Succeeded) return Problem(400, "Invalid onboarding token or password.");
        await transaction.CommitAsync(ct);
        return Results.NoContent();
    }

    private static AuditEntry Audit(HttpContext context, Guid id, string action) => new()
    {
        ActorUserId = Guid.Parse(context.User.FindFirstValue(ClaimTypes.NameIdentifier)!),
        RestaurantId = id,
        ResourceId = id,
        ResourceType = "Restaurant",
        Action = action,
        CorrelationId = context.TraceIdentifier.Length <= 100 ? context.TraceIdentifier : null
    };
    private static bool TryVersion(string? value, out byte[] bytes)
    {
        bytes = [];
        if (value is null || value.Length != 12) return false;
        try { bytes = Convert.FromBase64String(value); return bytes.Length == 8; }
        catch (FormatException) { return false; }
    }
    private static bool IsConflict(Exception ex) => ex is SqlException { Number: 2601 or 2627 or 1205 }
        || (ex.InnerException is not null && IsConflict(ex.InnerException));
}

// Adapters wrap delivery failures without copying provider error messages/secrets.
public sealed class OnboardingDeliveryException : Exception;
