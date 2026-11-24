using DigitalMenu.Api.Media;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Hosting.Internal;
using Xunit;

namespace DigitalMenu.IntegrationTests;

public sealed class MediaProductionGateTests
{
    [Theory]
    [InlineData("Development", null, true)]
    [InlineData("Production", null, false)]
    [InlineData("Production", "false", false)]
    [InlineData("Production", "yes", false)]
    [InlineData("Production", "true", true)]
    public void Local_disk_is_enabled_only_in_Development_or_with_explicit_ack(string env, string? flag, bool expected)
    {
        var cfg = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?> { ["Media:AllowLocalDisk"] = flag }).Build();
        Assert.Equal(expected, MediaEndpoints.LocalDiskEnabled(new HostingEnvironment { EnvironmentName = env }, cfg));
    }
}
