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

public sealed class MediaLeafLinkTests
{
    [Fact]
    public async Task Leaf_symlink_in_a_bundle_reads_as_absent_and_never_outside_content()
    {
        if (OperatingSystem.IsWindows()) return;
        var root = Path.Combine(Path.GetTempPath(), "dm-media-" + Guid.NewGuid().ToString("N"));
        var outside = Path.Combine(Path.GetTempPath(), "dm-outside-" + Guid.NewGuid().ToString("N") + ".webp");
        try
        {
            File.WriteAllText(outside, "SECRET");
            var storage = new LocalImageStorage(root, Microsoft.Extensions.Logging.Abstractions.NullLogger<LocalImageStorage>.Instance);
            var tenant = Guid.NewGuid().ToString("D"); var id = Guid.NewGuid().ToString("N");
            var key = tenant + "/" + id + ".webp";
            var bundle = Path.Combine(root, tenant, id);
            Directory.CreateDirectory(bundle);
            File.WriteAllBytes(Path.Combine(bundle, "thumbnail.webp"), new byte[] { 1, 2, 3 });
            File.CreateSymbolicLink(Path.Combine(bundle, "main.webp"), outside);
            Assert.Null(await storage.GetAsync(key, "main", default));
            Assert.Equal(new byte[] { 1, 2, 3 }, await storage.GetAsync(key, "thumbnail", default));
        }
        finally
        {
            if (Directory.Exists(root)) Directory.Delete(root, true);
            File.Delete(outside);
        }
    }
}
