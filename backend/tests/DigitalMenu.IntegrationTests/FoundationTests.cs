using System.Net;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;

namespace DigitalMenu.IntegrationTests;

public class FoundationTests
{
    [Theory]
    [InlineData("/api/health/live")]
    [InlineData("/api/health/ready")]
    public async Task Health_is_anonymous_and_contains_no_dependency_details(string path)
    {
        await using var factory = Factory("Development");
        using var response = await factory.CreateClient().GetAsync(path);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("Healthy", await response.Content.ReadAsStringAsync());
        Assert.Equal("nosniff", response.Headers.GetValues("X-Content-Type-Options").Single());
    }

    [Fact]
    public async Task Development_OpenApi_has_no_sample_CRUD()
    {
        await using var factory = Factory("Development");
        var response = await factory.CreateClient().GetAsync("/api/openapi/v1.json");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var json = await response.Content.ReadAsStringAsync();
        Assert.Contains("openapi", json);
        Assert.DoesNotContain("weatherforecast", json);
    }

    [Theory]
    [InlineData("/api/admin/restaurant")]
    [InlineData("/api/platform/restaurants")]
    [InlineData("/api/openapi/v1.json")]
    public async Task Production_has_no_anonymous_protected_surface(string path)
    {
        await using var factory = Factory("Production");
        var response = await factory.CreateClient(new() { AllowAutoRedirect = false }).GetAsync(path);
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        Assert.Null(response.Headers.Location);
    }

    private static WebApplicationFactory<Program> Factory(string environment) =>
        new WebApplicationFactory<Program>().WithWebHostBuilder(builder => builder.UseEnvironment(environment));
}
