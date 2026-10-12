using System.Linq.Expressions;
using DigitalMenu.Application;
using DigitalMenu.Domain;
using DigitalMenu.Infrastructure.Persistence;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.ChangeTracking;
using Microsoft.Extensions.Logging;

namespace DigitalMenu.Infrastructure.Tenancy;

public sealed class TenantDataSession : ITenantDataSession, IDisposable
{
    private readonly TenantContext tenants;
    private readonly MenuDbContext db;
    private readonly string connection;
    private readonly ILogger<TenantDataSession> logger;
    private TenantScope? bound;

    public TenantDataSession(TenantContext tenants, MenuDbContext privileged, ILogger<TenantDataSession> logger)
    {
        this.tenants = tenants;
        this.logger = logger;
        connection = privileged.Database.GetConnectionString() ?? "";
        db = NewContext();
        db.DenyTenantAccess();
        db.ChangeTracker.AutoDetectChangesEnabled = false;
    }
    private MenuDbContext NewContext() => new(new DbContextOptionsBuilder<MenuDbContext>().UseSqlServer(connection).Options);
    private static bool Allowed(Type type) => type == typeof(Restaurant) || type == typeof(Category) ||
        type == typeof(MenuItem) || type == typeof(MenuItemImage) || type == typeof(RestaurantSettings);
    private static string ScopeProperty(Type type) => type == typeof(Restaurant) ? "Id" : "RestaurantId";
    private static string KeyProperty(Type type) => type == typeof(RestaurantSettings) ? "RestaurantId" : "Id";
    private static TenantBoundaryException Missing() => new(TenantFailure.NotFound);

    private async Task<TenantScope> BindAsync(CancellationToken ct)
    {
        var scope = await tenants.RequireAsync(ct);
        if (bound is not null && bound != scope) throw new TenantBoundaryException(TenantFailure.Forbidden);
        db.RestrictToTenant(scope.RestaurantId);
        bound = scope;
        return scope;
    }
    private IQueryable<T> Owned<T>() where T : class
    {
        if (bound is null || !Allowed(typeof(T))) throw Missing();
        var id = bound.RestaurantId;
        var field = ScopeProperty(typeof(T));
        return db.Set<T>().Where(e => EF.Property<Guid>(e, field) == id);
    }

    public async Task<IReadOnlyList<TResult>> ReadAsync<TEntity, TResult>(Expression<Func<TEntity, bool>> filter,
        Expression<Func<TEntity, TResult>> projection, int limit = 100, CancellationToken cancellationToken = default) where TEntity : class
    {
        try
        {
            await BindAsync(cancellationToken);
            if (limit < 1 || limit > 100) throw new TenantBoundaryException(TenantFailure.InvalidRequest);
            return await Owned<TEntity>().AsNoTracking().Where(filter).OrderBy(e => EF.Property<Guid>(e, KeyProperty(typeof(TEntity))))
                .Take(limit).Select(projection).ToListAsync(cancellationToken);
        }
        catch (TenantBoundaryException) { db.ChangeTracker.Clear(); await DeniedAsync(); throw; }
    }
    public async Task<TEntity> EditAsync<TEntity>(Guid id, CancellationToken cancellationToken = default) where TEntity : class
    {
        try
        {
            await BindAsync(cancellationToken);
            return await Owned<TEntity>().SingleOrDefaultAsync(e => EF.Property<Guid>(e, KeyProperty(typeof(TEntity))) == id, cancellationToken) ?? throw Missing();
        }
        catch (TenantBoundaryException) { db.ChangeTracker.Clear(); await DeniedAsync(); throw; }
    }
    public async Task StageAsync<TEntity>(TEntity entity, bool isNew, CancellationToken cancellationToken = default) where TEntity : class
    {
        try
        {
            await BindAsync(cancellationToken);
            if (!Allowed(typeof(TEntity))) throw Missing();
            var entry = db.Entry(entity);
            entry.State = isNew ? EntityState.Added : EntityState.Modified;
            await ValidateEntryAsync(entry, cancellationToken);
        }
        catch (TenantBoundaryException) { db.ChangeTracker.Clear(); await DeniedAsync(); throw; }
    }
    public async Task<TEntity> EditAsync<TEntity>(Guid id, byte[] expectedRowVersion, CancellationToken cancellationToken = default) where TEntity : class
    {
        // Ownership is checked before version comparison: a foreign ID always remains 404.
        var entity = await EditAsync<TEntity>(id, cancellationToken);
        var property = db.Entry(entity).Metadata.FindProperty("RowVersion");
        if (property is null || expectedRowVersion.Length != 8)
        { db.ChangeTracker.Clear(); throw new TenantBoundaryException(TenantFailure.InvalidRequest); }
        var original = (byte[])db.Entry(entity).Property("RowVersion").OriginalValue!;
        if (!original.SequenceEqual(expectedRowVersion))
        { db.ChangeTracker.Clear(); throw new TenantBoundaryException(TenantFailure.Concurrency); }
        return entity;
    }
    public async Task DeleteAsync<TEntity>(Guid id, CancellationToken cancellationToken = default) where TEntity : class
    {
        var entity = await EditAsync<TEntity>(id, cancellationToken);
        db.Entry(entity).State = EntityState.Deleted;
    }

    public async Task<int> CommitAsync(CancellationToken cancellationToken = default)
    {
        try
        {
            if (bound is null) await BindAsync(cancellationToken);
            await using var transaction = await db.Database.BeginTransactionAsync(System.Data.IsolationLevel.Serializable, cancellationToken);
            await tenants.ValidateCurrentAsync(db, bound!, cancellationToken);
            // Check immutable keys BEFORE DetectChanges (which itself rejects mutated EF keys).
            foreach (var entry in db.ChangeTracker.Entries().ToArray())
                await ValidateEntryAsync(entry, cancellationToken);
            db.ChangeTracker.DetectChanges();
            foreach (var entry in db.ChangeTracker.Entries().Where(e => e.State != EntityState.Unchanged).ToArray())
                await ValidateEntryAsync(entry, cancellationToken);
            if (!db.ChangeTracker.HasChanges()) { await transaction.CommitAsync(cancellationToken); return 0; }
            db.Add(new AuditEntry
            {
                ActorUserId = bound!.UserId,
                RestaurantId = bound.RestaurantId,
                Action = "TenantWriteCommitted",
                ResourceType = "TenantBoundary"
            });
            var count = await db.SaveChangesAsync(cancellationToken);
            await transaction.CommitAsync(cancellationToken);
            return count;
        }
        catch (TenantBoundaryException) { db.ChangeTracker.Clear(); await DeniedAsync(); throw; }
        catch (DbUpdateConcurrencyException) { db.ChangeTracker.Clear(); throw new TenantBoundaryException(TenantFailure.Concurrency); }
        catch (Exception ex) when (SqlNumber(ex) is 2601 or 2627)
        { db.ChangeTracker.Clear(); await DeniedAsync(); throw Missing(); }
        catch (Exception ex) when (SqlNumber(ex) == 1205)
        { db.ChangeTracker.Clear(); throw new TenantBoundaryException(TenantFailure.Conflict); }
        catch (Exception ex) when (SqlNumber(ex) is 547 or 515)
        { db.ChangeTracker.Clear(); throw new TenantBoundaryException(TenantFailure.InvalidRequest); }
    }
    private static int? SqlNumber(Exception ex) => ex is SqlException sql ? sql.Number : ex.InnerException is not null ? SqlNumber(ex.InnerException) : null;

    private async Task<bool> ExistsAsync<T>(Guid id, CancellationToken ct) where T : class
        => await Owned<T>().AsNoTracking().AnyAsync(e => EF.Property<Guid>(e, KeyProperty(typeof(T))) == id, ct);
    private async Task<bool> AnyKeyAsync<T>(Guid id, CancellationToken ct) where T : class
    {
        // Private scalar presence check for new-key collisions; no foreign entity/data is loaded.
        using var privileged = NewContext();
        return await privileged.Set<T>().AsNoTracking().AnyAsync(e => EF.Property<Guid>(e, KeyProperty(typeof(T))) == id, ct);
    }
    private async Task ValidateEntryAsync(EntityEntry entry, CancellationToken ct)
    {
        var type = entry.Metadata.ClrType;
        if (!Allowed(type) || bound is null) throw Missing();
        var tenantId = (Guid)entry.Property(ScopeProperty(type)).CurrentValue!;
        var id = (Guid)entry.Property(KeyProperty(type)).CurrentValue!;
        if (tenantId != bound.RestaurantId || id == Guid.Empty) throw Missing();
        if (entry.State != EntityState.Added &&
            ((Guid)entry.Property(ScopeProperty(type)).OriginalValue! != tenantId ||
             (Guid)entry.Property(KeyProperty(type)).OriginalValue! != id)) throw Missing();
        var exists = entry.Entity switch
        {
            Restaurant => await ExistsAsync<Restaurant>(id, ct),
            Category => await ExistsAsync<Category>(id, ct),
            MenuItem => await ExistsAsync<MenuItem>(id, ct),
            MenuItemImage => await ExistsAsync<MenuItemImage>(id, ct),
            RestaurantSettings => await ExistsAsync<RestaurantSettings>(id, ct),
            _ => false
        };
        if (entry.State == EntityState.Added)
        {
            var any = entry.Entity switch
            {
                Restaurant => true, // Owners cannot provision restaurants.
                Category => await AnyKeyAsync<Category>(id, ct),
                MenuItem => await AnyKeyAsync<MenuItem>(id, ct),
                MenuItemImage => await AnyKeyAsync<MenuItemImage>(id, ct),
                RestaurantSettings => await AnyKeyAsync<RestaurantSettings>(id, ct),
                _ => true
            };
            if (any) throw Missing();
        }
        else if (!exists) throw Missing();
        if (entry.Entity is Restaurant && entry.State != EntityState.Added)
        {
            var original = await Owned<Restaurant>().AsNoTracking().SingleAsync(r => r.Id == id, ct);
            foreach (var field in new[] { "Status", "Slug", "PublicCode", "CreatedAtUtc" })
                if (!Equals(entry.Property(field).Metadata.PropertyInfo!.GetValue(original), entry.Property(field).CurrentValue)) throw Missing();
            if (entry.State == EntityState.Deleted) throw Missing();
        }
        if (entry.Entity is MenuItem item && !await Owned<Category>().AnyAsync(c => c.Id == item.CategoryId && !c.IsDeleted, ct)) throw Missing();
        if (entry.Entity is MenuItemImage image)
        {
            if (!await Owned<MenuItem>().AnyAsync(i => i.Id == image.MenuItemId && !i.IsDeleted, ct) || !ValidMediaKey(image.ObjectKey)) throw Missing();
            if (entry.State != EntityState.Added)
            {
                var originalKey = await Owned<MenuItemImage>().AsNoTracking().Where(i => i.Id == id).Select(i => i.ObjectKey).SingleAsync(ct);
                if (!Equals(originalKey, image.ObjectKey)) throw Missing();
            }
        }
        if (entry.Entity is RestaurantSettings settings &&
            ((settings.LogoObjectKey is not null && !ValidMediaKey(settings.LogoObjectKey)) ||
             (settings.CoverObjectKey is not null && !ValidMediaKey(settings.CoverObjectKey)))) throw Missing();
    }
    private bool ValidMediaKey(string key) => bound is not null && key.Length <= 300 &&
        key.StartsWith(bound.RestaurantId.ToString("D") + "/", StringComparison.Ordinal) && key.Length > 37 &&
        !key.Contains("..", StringComparison.Ordinal) && key.All(c => char.IsAsciiLetterOrDigit(c) || c is '/' or '.' or '-' or '_');

    private async Task DeniedAsync()
    {
        try
        {
            using var audit = NewContext();
            audit.Add(new AuditEntry
            {
                ActorUserId = bound?.UserId,
                RestaurantId = bound?.RestaurantId,
                Action = "TenantAccessDenied",
                ResourceType = "TenantBoundary"
            });
            await audit.SaveChangesAsync();
        }
        catch (Exception) { logger.LogWarning("Tenant denial audit could not be persisted; access remains denied."); }
    }
    public void Dispose() => db.Dispose();
}
