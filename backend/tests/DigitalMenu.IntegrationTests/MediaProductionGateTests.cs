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
        if (OperatingSystem.IsWindows()) return; // early return, not an xUnit skip
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

public sealed class MediaStorageContractTests
{
    private static LocalImageStorage Make(string root) =>
        new(root, Microsoft.Extensions.Logging.Abstractions.NullLogger<LocalImageStorage>.Instance);
    private static string NewRoot() => Path.Combine(Path.GetTempPath(), "dm-media-c-" + Guid.NewGuid().ToString("N"));

    [Fact]
    public void Relative_media_root_is_refused()
    {
        Assert.Throws<InvalidOperationException>(() => Make("relative/media"));
        Assert.Throws<InvalidOperationException>(() => Make(""));
    }

    [Fact]
    public async Task Non_canonical_keys_and_unknown_variants_give_400_and_create_no_tenant_directory()
    {
        var root = NewRoot();
        try
        {
            var s = Make(root);
            var tenant = Guid.NewGuid().ToString("D"); var id = Guid.NewGuid().ToString("N");
            var bad = new[]
            {
                Guid.Empty.ToString("D") + "/" + id + ".webp",
                tenant.ToUpperInvariant() + "/" + id + ".webp",
                tenant + "/" + id.ToUpperInvariant() + ".webp",
                tenant + "/" + id + ".png",
                tenant + "/" + id + ".webp/extra",
                tenant + "/",
                "",
            };
            foreach (var k in bad)
            {
                var ex = await Assert.ThrowsAsync<MediaException>(() => s.GetAsync(k, "main", default));
                Assert.Equal(400, ex.Status);
            }
            var good = tenant + "/" + id + ".webp";
            var v = await Assert.ThrowsAsync<MediaException>(() => s.GetAsync(good, "original", default));
            Assert.Equal(400, v.Status);
            // Scope: a rejected or absent key creates no tenant directory in an otherwise empty root. The constructor and every read still touch the filesystem (root creation, cleanup retry); no "no filesystem access" claim.
            Assert.Null(await s.GetAsync(good, "main", default));
            Assert.False(Directory.Exists(Path.Combine(root, tenant)));
        }
        finally { if (Directory.Exists(root)) Directory.Delete(root, true); }
    }

    [Fact]
    public async Task A_pending_deletion_bundle_is_gone_after_the_read_triggered_cleanup_retry()
    {
        var root = NewRoot();
        try
        {
            var s = Make(root);
            var tenant = Guid.NewGuid().ToString("D"); var id = Guid.NewGuid().ToString("N");
            var bundle = Path.Combine(root, tenant, id);
            Directory.CreateDirectory(bundle);
            File.WriteAllBytes(Path.Combine(bundle, "main.webp"), new byte[] { 9 });
            Assert.Equal(new byte[] { 9 }, await s.GetAsync(tenant + "/" + id + ".webp", "main", default));
            File.WriteAllText(Path.Combine(bundle, "delete.pending"), "");
            // Cleanup succeeds here, so this does not exercise the read guard while cleanup stays pending (deferred).
            Assert.Null(await s.GetAsync(tenant + "/" + id + ".webp", "main", default));
        }
        finally { if (Directory.Exists(root)) Directory.Delete(root, true); }
    }

    [Fact]
    public void Media_root_below_a_symlinked_directory_is_refused_and_no_files_are_written_in_the_target()
    {
        if (OperatingSystem.IsWindows()) return; // early return, not an xUnit skip: counts as Passed on Windows without asserting anything
        var real = NewRoot(); var link = NewRoot();
        try
        {
            Directory.CreateDirectory(real);
            Directory.CreateSymbolicLink(link, real);
            Assert.Throws<IOException>(() => Make(Path.Combine(link, "media")));
            // The constructor creates the root before it checks for links, so an EMPTY real/media directory may exist; only "no entries inside" is asserted.
            var created = Path.Combine(real, "media");
            Assert.False(Directory.Exists(created) && Directory.EnumerateFileSystemEntries(created).Any());
        }
        finally
        {
            if (Directory.Exists(link)) Directory.Delete(link);
            if (Directory.Exists(real)) Directory.Delete(real, true);
        }
    }
}
