using DigitalMenu.Api;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Xunit;

namespace DigitalMenu.IntegrationTests;

public sealed class DataProtectionTests
{
    public static string TempKeys() => Path.Combine(Path.GetTempPath(), "dm-keys-test-" + Guid.NewGuid().ToString("N"));

    [Fact]
    public void Production_without_a_key_path_fails_closed_and_Development_does_not()
    {
        var content = Path.Combine(Path.GetTempPath(), "dm-content-" + Guid.NewGuid().ToString("N"));
        Assert.Throws<InvalidOperationException>(() => Build(content, new() { [DataProtectionConfiguration.ApplicationNameKey] = "t-prod" }));
        using var dev = BuildEnv(content, new(), "Development");
        Assert.NotNull(dev.GetService<IDataProtectionProvider>());
    }

    [Fact]
    public void Application_name_is_required_in_production_and_isolates_rings()
    {
        var content = Tmp("content"); var keys = Tmp("keys");
        try
        {
            Assert.Throws<InvalidOperationException>(() => Build(content, new() { [DataProtectionConfiguration.KeysPathKey] = keys }));
            string cipher;
            using (var a = Build(content, new() { [DataProtectionConfiguration.KeysPathKey] = keys, [DataProtectionConfiguration.ApplicationNameKey] = "staging" }))
                cipher = a.GetRequiredService<IDataProtectionProvider>().CreateProtector("t").Protect("x");
            using var other = Build(content, new() { [DataProtectionConfiguration.KeysPathKey] = keys, [DataProtectionConfiguration.ApplicationNameKey] = "production" });
            Assert.ThrowsAny<System.Security.Cryptography.CryptographicException>(() => other.GetRequiredService<IDataProtectionProvider>().CreateProtector("t").Unprotect(cipher));
        }
        finally { if (Directory.Exists(keys)) Directory.Delete(keys, true); }
    }

    static ServiceProvider BuildEnv(string content, Dictionary<string, string?> cfg, string envName)
    {
        var services = new ServiceCollection();
        DataProtectionConfiguration.Configure(services, new FakeEnv(content) { EnvironmentName = envName }, new ConfigurationBuilder().AddInMemoryCollection(cfg).Build());
        return services.BuildServiceProvider();
    }

    static ServiceProvider Build(string content, Dictionary<string, string?> cfg)
    {
        var services = new ServiceCollection();
        var env = new FakeEnv(content);
        DataProtectionConfiguration.Configure(services, env, new ConfigurationBuilder().AddInMemoryCollection(cfg).Build());
        return services.BuildServiceProvider();
    }

    [Fact]
    public void Persisted_keys_survive_a_new_provider_and_files_are_created()
    {
        var content = Path.Combine(Path.GetTempPath(), "dm-content-" + Guid.NewGuid().ToString("N"));
        var keys = Path.Combine(Path.GetTempPath(), "dm-keys-" + Guid.NewGuid().ToString("N"));
        try
        {
            var cfg = new Dictionary<string, string?> { [DataProtectionConfiguration.KeysPathKey] = keys, [DataProtectionConfiguration.ApplicationNameKey] = "t-prod" };
            string cipher;
            using (var a = Build(content, cfg)) cipher = a.GetRequiredService<IDataProtectionProvider>().CreateProtector("t").Protect("hello");
            Assert.NotEmpty(Directory.GetFiles(keys, "*.xml"));
            using var b = Build(content, cfg);
            Assert.Equal("hello", b.GetRequiredService<IDataProtectionProvider>().CreateProtector("t").Unprotect(cipher));
        }
        finally { if (Directory.Exists(keys)) Directory.Delete(keys, true); }
    }

    static string Tmp(string n) => Path.Combine(Path.GetTempPath(), "dm-" + n + "-" + Guid.NewGuid().ToString("N"));

    [Fact]
    public void Unsafe_key_directories_are_rejected_without_touching_permissions()
    {
        if (OperatingSystem.IsWindows()) return;
        var content = Tmp("content"); var media = Tmp("media"); Directory.CreateDirectory(content); Directory.CreateDirectory(media);
        var shared = Tmp("shared"); Directory.CreateDirectory(shared);
        File.SetUnixFileMode(shared, (UnixFileMode)Convert.ToInt32("755", 8));
        void Rejects(string path) => Assert.Throws<InvalidOperationException>(() => Build(content, new() { [DataProtectionConfiguration.ApplicationNameKey] = "t-prod", [DataProtectionConfiguration.KeysPathKey] = path, ["Media:LocalRoot"] = media }));
        Rejects("relative/keys");
        Rejects("/");
        Rejects(Path.Combine(content, "keys"));
        Rejects(Path.Combine(media, "keys"));
        Rejects(Path.GetTempPath().TrimEnd('/'));          // ancestor of content/media
        Rejects(shared);                                    // existing shared 0755 dir
        Assert.Equal(Convert.ToInt32("755", 8), (int)File.GetUnixFileMode(shared) & 0x1FF);
        Rejects(Path.Combine(Tmp("missing-parent"), "keys"));
        var link = Tmp("link"); Directory.CreateSymbolicLink(link, content);
        Rejects(Path.Combine(link, "keys"));                // resolves into content root
        var direct = Tmp("direct"); Directory.CreateSymbolicLink(direct, Tmp("elsewhere"));
        Rejects(direct);
    }

    [Fact]
    public void New_key_directory_is_created_private_and_existing_private_one_is_reused()
    {
        if (OperatingSystem.IsWindows()) return;
        var content = Tmp("content"); var keys = Tmp("keys");
        try
        {
            using (Build(content, new() { [DataProtectionConfiguration.KeysPathKey] = keys, [DataProtectionConfiguration.ApplicationNameKey] = "t-prod" })) { }
            Assert.Equal(Convert.ToInt32("700", 8), (int)File.GetUnixFileMode(keys) & 0x1FF);
            using var again = Build(content, new() { [DataProtectionConfiguration.KeysPathKey] = keys, [DataProtectionConfiguration.ApplicationNameKey] = "t-prod" });
        }
        finally { if (Directory.Exists(keys)) Directory.Delete(keys, true); }
    }

    sealed class FakeEnv(string content) : IHostEnvironment
    {
        public string EnvironmentName { get; set; } = "Production";
        public string ApplicationName { get; set; } = "t";
        public string ContentRootPath { get; set; } = content;
        public Microsoft.Extensions.FileProviders.IFileProvider ContentRootFileProvider { get; set; } = null!;
    }
}
