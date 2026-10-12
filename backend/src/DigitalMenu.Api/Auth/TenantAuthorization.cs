using DigitalMenu.Application;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Diagnostics;
using Microsoft.AspNetCore.Identity;
using Microsoft.Extensions.Options;

namespace DigitalMenu.Api.Auth;

public sealed class CookieAuthenticatedActor(IHttpContextAccessor accessor, IOptions<IdentityOptions> identity,
    IOptionsMonitor<CookieAuthenticationOptions> cookies) : IAuthenticatedActor
{
    public async Task<AuthenticatedActor?> GetAsync(CancellationToken cancellationToken = default)
    {
        var context = accessor.HttpContext;
        if (context is null || !context.Request.IsHttps) return null;
        var result = await context.AuthenticateAsync(IdentityConstants.ApplicationScheme);
        if (!result.Succeeded || result.Principal?.Identity?.IsAuthenticated != true) return null;
        var now = cookies.Get(IdentityConstants.ApplicationScheme).TimeProvider?.GetUtcNow() ?? DateTimeOffset.UtcNow;
        if (result.Properties?.ExpiresUtc is not { } expires || expires <= now) return null;
        var ids = result.Principal.FindAll(identity.Value.ClaimsIdentity.UserIdClaimType).ToArray();
        var stamps = result.Principal.FindAll(identity.Value.ClaimsIdentity.SecurityStampClaimType).ToArray();
        if (ids.Length != 1 || !Guid.TryParse(ids[0].Value, out var id) || id == Guid.Empty || stamps.Length != 1 || string.IsNullOrEmpty(stamps[0].Value)) return null;
        return new AuthenticatedActor(id, stamps[0].Value);
    }
}
public sealed class TenantOwnerRequirement : IAuthorizationRequirement;
public sealed class TenantRestaurantRequirement : IAuthorizationRequirement;
public sealed class TenantOwnerHandler(ITenantContext tenants) : AuthorizationHandler<TenantOwnerRequirement>
{
    protected override async Task HandleRequirementAsync(AuthorizationHandlerContext context, TenantOwnerRequirement requirement)
    {
        try { await tenants.RequireAsync(); context.Succeed(requirement); }
        catch (TenantBoundaryException) { context.Fail(); }
    }
}
public sealed class TenantRestaurantHandler(ITenantContext tenants) : AuthorizationHandler<TenantRestaurantRequirement, Guid>
{
    protected override async Task HandleRequirementAsync(AuthorizationHandlerContext context, TenantRestaurantRequirement requirement, Guid resource)
    {
        try
        {
            if ((await tenants.RequireAsync()).RestaurantId == resource) context.Succeed(requirement);
            else context.Fail();
        }
        catch (TenantBoundaryException) { context.Fail(); }
    }
}
public sealed class TenantProblemHandler : IExceptionHandler
{
    public async ValueTask<bool> TryHandleAsync(HttpContext httpContext, Exception exception, CancellationToken cancellationToken)
    {
        if (exception is not TenantBoundaryException boundary) return false;
        httpContext.Response.Headers.CacheControl = "no-store";
        httpContext.Response.Headers.XContentTypeOptions = "nosniff";
        httpContext.Response.Headers["X-Frame-Options"] = "DENY";
        httpContext.Response.Headers["Referrer-Policy"] = "no-referrer";
        httpContext.Response.Headers["Content-Security-Policy"] = "default-src 'none'; frame-ancestors 'none'";
        var (status, title) = boundary.Failure switch
        {
            TenantFailure.Unauthenticated => (401, "Unauthorized."),
            TenantFailure.Forbidden => (403, "Forbidden."),
            TenantFailure.NotFound => (404, "Resource not found."),
            TenantFailure.Concurrency => (412, "Resource changed. Reload before retrying."),
            TenantFailure.Conflict => (409, "Conflicting write. Retry."),
            _ => (400, "Invalid request.")
        };
        await Results.Problem(statusCode: status, title: title).ExecuteAsync(httpContext);
        return true;
    }
}
