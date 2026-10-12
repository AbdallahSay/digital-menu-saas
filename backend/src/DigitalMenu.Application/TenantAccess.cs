using System.Linq.Expressions;

namespace DigitalMenu.Application;

public sealed record AuthenticatedActor(Guid UserId, string SecurityStamp)
{
    public override string ToString() => nameof(AuthenticatedActor);
}
public interface IAuthenticatedActor
{
    Task<AuthenticatedActor?> GetAsync(CancellationToken cancellationToken = default);
}
public sealed record TenantScope(Guid UserId, Guid RestaurantId)
{
    public override string ToString() => nameof(TenantScope);
}
public interface ITenantContext
{
    Task<TenantScope> RequireAsync(CancellationToken cancellationToken = default);
}
public enum TenantFailure { Unauthenticated, Forbidden, NotFound, Concurrency, Conflict, InvalidRequest }
public sealed class TenantBoundaryException(TenantFailure failure) : Exception("Tenant boundary rejected the operation.")
{
    public TenantFailure Failure { get; } = failure;
}

// No raw IQueryable, DbContext, bulk SQL or client-selectable tenant scope escapes this boundary.
public interface ITenantDataSession
{
    Task<IReadOnlyList<TResult>> ReadCategoriesAsync<TResult>(Expression<Func<DigitalMenu.Domain.Category, TResult>> projection,
        int page, int pageSize, CancellationToken cancellationToken = default);
    Task<IReadOnlyList<TResult>> ReadAsync<TEntity, TResult>(Expression<Func<TEntity, bool>> filter,
        Expression<Func<TEntity, TResult>> projection, int limit = 100, CancellationToken cancellationToken = default) where TEntity : class;
    Task<TEntity> EditAsync<TEntity>(Guid id, CancellationToken cancellationToken = default) where TEntity : class;
    Task<TEntity> EditAsync<TEntity>(Guid id, byte[] expectedRowVersion, CancellationToken cancellationToken = default) where TEntity : class;
    Task StageAsync<TEntity>(TEntity entity, bool isNew, CancellationToken cancellationToken = default) where TEntity : class;
    Task DeleteAsync<TEntity>(Guid id, CancellationToken cancellationToken = default) where TEntity : class;
    Task<int> CommitAsync(CancellationToken cancellationToken = default);
}
