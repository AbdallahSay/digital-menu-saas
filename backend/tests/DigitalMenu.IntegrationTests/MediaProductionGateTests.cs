using DigitalMenu.Api.Media;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Hosting;
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
    [UnixOnlyFact]
    public async Task Leaf_symlink_in_a_bundle_reads_as_absent_and_never_outside_content()
    {
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

    [UnixOnlyFact]
    public void Media_root_below_a_symlinked_directory_is_refused_and_no_files_are_written_in_the_target()
    {
        var real = NewRoot(); var link = NewRoot();
        try
        {
            Directory.CreateDirectory(real);
            Directory.CreateSymbolicLink(link, real);
            Assert.Throws<IOException>(() => Make(Path.Combine(link, "media")));
            // Links in existing ancestors are checked before anything is created: nothing may exist in the target.
            Assert.False(Directory.Exists(Path.Combine(real, "media")));
        }
        finally
        {
            if (Directory.Exists(link)) Directory.Delete(link);
            if (Directory.Exists(real)) Directory.Delete(real, true);
        }
    }
}

public sealed class MediaRootPolicyTests
{
    private static IHostEnvironment Env(string content) => new HostingEnvironment { EnvironmentName = "Production", ContentRootPath = content };
    private static IConfiguration Cfg(string? keys = null) =>
        new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?> { ["DataProtection:KeysPath"] = keys }).Build();
    private static string Dir() { var d = Path.Combine(Path.GetTempPath(), "dm-pol-" + Guid.NewGuid().ToString("N")); Directory.CreateDirectory(d); return d; }

    [Fact]
    public void Roots_equal_inside_or_containing_content_base_or_key_directories_are_refused_and_a_sibling_is_accepted()
    {
        var parent = Dir(); var content = Path.Combine(parent, "app"); var keys = Path.Combine(parent, "keys"); var sibling = Path.Combine(parent, "media");
        Directory.CreateDirectory(content);
        try
        {
            void Refused(string root, string? k = null) => Assert.Throws<InvalidOperationException>(() => MediaEndpoints.ValidateRoot(root, Env(content), Cfg(k)));
            Refused(content);
            Refused(Path.Combine(content, "media"));
            Refused(parent);                                   // contains the content root
            Refused(keys, keys);                                // equals the key directory (not yet created)
            Refused(Path.Combine(keys, "m"), keys);
            Refused(parent, keys);
            Refused("relative/media");
            MediaEndpoints.ValidateRoot(sibling, Env(content), Cfg(keys));
        }
        finally { Directory.Delete(parent, true); }
    }

    [UnixOnlyFact]
    public void A_symlink_alias_of_the_content_root_is_resolved_before_comparing()
    {
        var parent = Dir(); var content = Path.Combine(parent, "app"); var alias = Path.Combine(parent, "alias");
        Directory.CreateDirectory(content); Directory.CreateSymbolicLink(alias, content);
        try { Assert.Throws<InvalidOperationException>(() => MediaEndpoints.ValidateRoot(Path.Combine(alias, "media"), Env(content), Cfg())); }
        finally { Directory.Delete(alias); Directory.Delete(parent, true); }
    }
}
