using DigitalMenu.Api.Auth;
using DigitalMenu.Api.Platform;
using Microsoft.AspNetCore.Antiforgery;
using Microsoft.AspNetCore.Authorization;

var builder = WebApplication.CreateBuilder(args);
builder.Services.AddOpenApi();
builder.Services.AddProblemDetails();
builder.Services.Configure<Microsoft.AspNetCore.Routing.RouteHandlerOptions>(options => options.ThrowOnBadRequest = false);
builder.Services.AddHealthChecks();
builder.Services.AddMenuIdentity(builder.Configuration);
builder.Services.AddDevelopmentOnboarding(builder.Environment, builder.Configuration);
builder.Services.AddSingleton<IRestaurantPublicCodeGenerator, CryptographicPublicCodeGenerator>();
builder.Services.Configure<Microsoft.AspNetCore.Identity.DataProtectionTokenProviderOptions>(options =>
    options.TokenLifespan = TimeSpan.FromHours(1));
builder.Services.AddAuthorization(options =>
{
    options.FallbackPolicy = new AuthorizationPolicyBuilder().RequireAuthenticatedUser().Build();
    options.AddPolicy("PlatformAdmin", policy => policy.RequireAuthenticatedUser().RequireRole("PlatformAdmin"));
    options.AddPolicy("Owner", policy => policy.RequireAuthenticatedUser().RequireRole("Owner"));
});

var app = builder.Build();
if (args.Contains("--bootstrap-admin=true", StringComparer.Ordinal))
{
    await DevelopmentBootstrap.RunAsync(app.Services, app.Environment, app.Configuration);
    return;
}
app.UseExceptionHandler();
app.UseStatusCodePages();
app.Use(async (context, next) =>
{
    context.Response.Headers.XContentTypeOptions = "nosniff";
    context.Response.Headers.CacheControl = "no-store";
    context.Response.Headers["X-Frame-Options"] = "DENY";
    context.Response.Headers["Referrer-Policy"] = "no-referrer";
    context.Response.Headers["Content-Security-Policy"] = "default-src 'none'; frame-ancestors 'none'";
    await next(context);
});
app.UseAuthentication();
app.UseAuthorization();
app.UseRateLimiter();
app.Use(async (context, next) =>
{
    if ((context.Request.Path.StartsWithSegments("/api/v1/auth") || context.Request.Path.StartsWithSegments("/api/v1/platform")) && !context.Request.IsHttps)
    {
        await Results.Problem(statusCode: 400, title: "HTTPS is required.").ExecuteAsync(context);
        return;
    }
    if ((context.Request.Path.StartsWithSegments("/api/v1/auth") || context.Request.Path.StartsWithSegments("/api/v1/platform")) &&
        context.Features.Get<Microsoft.AspNetCore.Http.Features.IHttpMaxRequestBodySizeFeature>() is { IsReadOnly: false } bodySize)
        bodySize.MaxRequestBodySize = 8192;
    if (context.Request.Path.StartsWithSegments("/api") &&
        !HttpMethods.IsGet(context.Request.Method) && !HttpMethods.IsHead(context.Request.Method) && !HttpMethods.IsOptions(context.Request.Method))
    {
        if (!context.Request.IsHttps)
        {
            await Results.Problem(statusCode: 400, title: "HTTPS is required.").ExecuteAsync(context);
            return;
        }
        try { await context.RequestServices.GetRequiredService<IAntiforgery>().ValidateRequestAsync(context); }
        catch (AntiforgeryValidationException)
        {
            await Results.Problem(statusCode: 400, title: "Invalid CSRF token.").ExecuteAsync(context);
            return;
        }
    }
    await next(context);
});
app.MapMenuAuthentication();
app.MapPlatformProvisioning();
app.MapHealthChecks("/api/health/live").AllowAnonymous();
// No external dependencies yet; readiness currently equals liveness.
app.MapHealthChecks("/api/health/ready").AllowAnonymous();
if (app.Environment.IsDevelopment())
{
    app.MapOpenApi("/api/openapi/{documentName}.json").AllowAnonymous();
}
app.Run();

public partial class Program;
