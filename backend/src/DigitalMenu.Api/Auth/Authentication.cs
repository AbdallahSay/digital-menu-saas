using System.ComponentModel.DataAnnotations;
using System.Threading.RateLimiting;
using DigitalMenu.Domain;
using DigitalMenu.Infrastructure.Persistence;
using Microsoft.AspNetCore.Antiforgery;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;

namespace DigitalMenu.Api.Auth;

public sealed record LoginRequest(string? Email, string? Password);

public static class Authentication
{
    public static IServiceCollection AddMenuIdentity(this IServiceCollection services, IConfiguration config)
    {
        services.AddDbContext<MenuDbContext>(options => options.UseSqlServer(config.GetConnectionString("MenuDatabase")));
        services.AddIdentity<ApplicationUser, IdentityRole<Guid>>(options =>
        {
            options.User.RequireUniqueEmail = true;
            options.Password.RequiredLength = 12;
            options.Lockout.MaxFailedAccessAttempts = 5;
            options.Lockout.DefaultLockoutTimeSpan = TimeSpan.FromMinutes(15);
        }).AddEntityFrameworkStores<MenuDbContext>().AddDefaultTokenProviders();
        services.Configure<SecurityStampValidatorOptions>(options => options.ValidationInterval = TimeSpan.Zero);
        services.ConfigureApplicationCookie(options =>
        {
            options.Cookie.Name = "__Host-DigitalMenu.Session";
            options.Cookie.HttpOnly = true;
            options.Cookie.SecurePolicy = CookieSecurePolicy.Always;
            options.Cookie.SameSite = SameSiteMode.Strict;
            options.ExpireTimeSpan = TimeSpan.FromMinutes(30);
            options.SlidingExpiration = false;
            options.Events.OnRedirectToLogin = c => { c.Response.StatusCode = 401; return Task.CompletedTask; };
            options.Events.OnRedirectToAccessDenied = c => { c.Response.StatusCode = 403; return Task.CompletedTask; };
            options.Events.OnValidatePrincipal = async context =>
            {
                await SecurityStampValidator.ValidatePrincipalAsync(context);
                // Stamp validation must not extend the absolute session lifetime.
                context.ShouldRenew = false;
                if (context.Principal?.Identity?.IsAuthenticated != true) return;
                var users = context.HttpContext.RequestServices.GetRequiredService<UserManager<ApplicationUser>>();
                var user = await users.GetUserAsync(context.Principal);
                if (user is null || !await SessionAllowed(user, users, context.HttpContext.RequestServices.GetRequiredService<MenuDbContext>()))
                {
                    context.RejectPrincipal();
                    await context.HttpContext.SignOutAsync(IdentityConstants.ApplicationScheme);
                }
            };
        });
        services.AddAntiforgery(options =>
        {
            options.HeaderName = "X-XSRF-TOKEN";
            options.Cookie.Name = "__Host-DigitalMenu.Antiforgery";
            options.Cookie.SecurePolicy = CookieSecurePolicy.Always;
            options.Cookie.HttpOnly = true;
            options.Cookie.SameSite = SameSiteMode.Strict;
        });
        services.AddRateLimiter(options =>
        {
            options.OnRejected = (context, _) => new ValueTask(Results.Problem(statusCode: 429, title: "Too many requests.").ExecuteAsync(context.HttpContext));
            options.AddPolicy("auth", context => RateLimitPartition.GetFixedWindowLimiter(
                context.Connection.RemoteIpAddress?.ToString() ?? "unknown", _ => new FixedWindowRateLimiterOptions
                { PermitLimit = 10, Window = TimeSpan.FromMinutes(1), QueueLimit = 0, AutoReplenishment = true }));
        });
        return services;
    }

    private static async Task<bool> SessionAllowed(ApplicationUser user, UserManager<ApplicationUser> users, MenuDbContext db)
    {
        if (await users.IsLockedOutAsync(user)) return false;
        if (await users.IsInRoleAsync(user, "PlatformAdmin")) return true;
        return await (from membership in db.Set<RestaurantUser>().AsNoTracking()
                      join restaurant in db.Set<Restaurant>().AsNoTracking() on membership.RestaurantId equals restaurant.Id
                      where membership.UserId == user.Id && membership.IsActive && membership.Role == "Owner" && restaurant.Status == "Active"
                      select membership).AnyAsync();
    }

    public static void MapMenuAuthentication(this WebApplication app)
    {
        var group = app.MapGroup("/api/v1/auth").RequireRateLimiting("auth");
        group.MapGet("/csrf", (HttpContext context, IAntiforgery antiforgery) =>
        {
            if (!context.Request.IsHttps) return Results.Problem(statusCode: 400, title: "HTTPS is required.");
            var tokens = antiforgery.GetAndStoreTokens(context);
            context.Response.Cookies.Append("XSRF-TOKEN", tokens.RequestToken!, new CookieOptions
            { Secure = true, HttpOnly = false, SameSite = SameSiteMode.Strict, Path = "/" });
            return Results.Ok(new { headerName = "X-XSRF-TOKEN" });
        }).AllowAnonymous();
        group.MapPost("/login", async (LoginRequest request, HttpContext context, IConfiguration config,
            UserManager<ApplicationUser> users, SignInManager<ApplicationUser> signIn, MenuDbContext db) =>
        {
            if (string.IsNullOrWhiteSpace(config.GetConnectionString("MenuDatabase")))
                return Results.Problem(statusCode: 503, title: "Authentication is not configured.");
            if (request.Email is null || request.Email.Length > 256 || !new EmailAddressAttribute().IsValid(request.Email) ||
                string.IsNullOrEmpty(request.Password) || request.Password.Length > 256)
                return Results.Problem(statusCode: 400, title: "Invalid login request.");
            if (context.User.Identity?.IsAuthenticated == true)
                return Results.Problem(statusCode: 409, title: "Sign out before signing in again.");
            var user = await users.FindByEmailAsync(request.Email);
            if (user is null)
            {
                // Consume the password hashing work factor for unknown accounts too.
                users.PasswordHasher.HashPassword(new ApplicationUser(), request.Password);
                return Results.Problem(statusCode: 401, title: "Invalid credentials.");
            }
            var result = await signIn.CheckPasswordSignInAsync(user, request.Password, lockoutOnFailure: true);
            if (!result.Succeeded || user.TwoFactorEnabled || !await SessionAllowed(user, users, db))
                return Results.Problem(statusCode: 401, title: "Invalid credentials.");
            await signIn.SignInAsync(user, isPersistent: false);
            return Results.NoContent();
        }).AllowAnonymous();
        group.MapPost("/logout", async (HttpContext context, UserManager<ApplicationUser> users, SignInManager<ApplicationUser> signIn) =>
        {
            var user = await users.GetUserAsync(context.User);
            if (user is null) return Results.Problem(statusCode: 401, title: "Unauthorized.");
            var result = await users.UpdateSecurityStampAsync(user);
            if (!result.Succeeded) return Results.Problem(statusCode: 409, title: "Session invalidation failed.");
            await signIn.SignOutAsync();
            context.Response.Cookies.Delete("XSRF-TOKEN", new CookieOptions { Secure = true, SameSite = SameSiteMode.Strict, Path = "/" });
            return Results.NoContent();
        });
        group.MapGet("/me", async (HttpContext context, UserManager<ApplicationUser> users, MenuDbContext db) =>
        {
            var user = await users.GetUserAsync(context.User);
            if (user is null) return Results.Problem(statusCode: 401, title: "Unauthorized.");
            var platform = await users.IsInRoleAsync(user, "PlatformAdmin");
            var restaurants = await (from m in db.Set<RestaurantUser>().AsNoTracking()
                                     join r in db.Set<Restaurant>().AsNoTracking() on m.RestaurantId equals r.Id
                                     where m.UserId == user.Id && m.IsActive && r.Status == "Active"
                                     select new { r.Name }).Take(10).ToListAsync();
            return Results.Ok(new { role = platform ? "PlatformAdmin" : "Owner", restaurants });
        });
    }
}
