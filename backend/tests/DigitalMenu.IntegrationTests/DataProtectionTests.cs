using DigitalMenu.Api;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Xunit;

namespace DigitalMenu.IntegrationTests;

/// <summary>Reported as Skipped (never as passed) on Windows, where the behavior under test is Unix-only.</summary>
public sealed class UnixOnlyFactAttribute : FactAttribute
{
    public UnixOnlyFactAttribute() { if (OperatingSystem.IsWindows()) Skip = "Unix-only behavior; not executed on Windows."; }
}

/// <summary>Reported as Skipped on Windows: the test starts the app in a non-Development environment with a key path, which Windows refuses by design.</summary>
public sealed class UnixOnlyTheoryAttribute : TheoryAttribute
{
    public UnixOnlyTheoryAttribute() { if (OperatingSystem.IsWindows()) Skip = "Needs a non-Development key path, refused on Windows by design (see the explicit policy tests)."; }
}

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

    [UnixOnlyFact, System.Runtime.Versioning.UnsupportedOSPlatform("windows")]
    public void Unsafe_key_directories_are_rejected_without_touching_permissions()
    {
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

    [UnixOnlyFact, System.Runtime.Versioning.UnsupportedOSPlatform("windows")]
    public void New_key_directory_is_created_private_and_existing_private_one_is_reused()
    {
        var content = Tmp("content"); var keys = Tmp("keys");
        try
        {
            using (Build(content, new() { [DataProtectionConfiguration.KeysPathKey] = keys, [DataProtectionConfiguration.ApplicationNameKey] = "t-prod" })) { }
            Assert.Equal(Convert.ToInt32("700", 8), (int)File.GetUnixFileMode(keys) & 0x1FF);
            using var again = Build(content, new() { [DataProtectionConfiguration.KeysPathKey] = keys, [DataProtectionConfiguration.ApplicationNameKey] = "t-prod" });
        }
        finally { if (Directory.Exists(keys)) Directory.Delete(keys, true); }
    }

    // Contract (platform-neutral, runs on any OS): outside Development, a configured key path on Windows is refused
    // until an ACL or protected-store policy exists. This documents the CURRENT limit; it is not a Windows strategy.
    [Fact]
    public void Windows_production_with_a_key_path_is_refused_and_the_message_says_why()
    {
        var content = Tmp("content");
        var ex = Assert.Throws<InvalidOperationException>(() =>
            DataProtectionConfiguration.Configure(new ServiceCollection(), new FakeEnv(content),
                new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?> { [DataProtectionConfiguration.ApplicationNameKey] = "t-prod", [DataProtectionConfiguration.KeysPathKey] = Path.Combine(Path.GetTempPath(), "abs-keys") }).Build(), isWindows: true));
        Assert.Contains("Windows", ex.Message);
        Assert.Contains("not supported", ex.Message);
    }

    [Fact]
    public void Windows_development_does_not_require_a_key_path_and_production_without_path_still_fails_first()
    {
        var content = Tmp("content");
        var cfg = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>()).Build();
        DataProtectionConfiguration.Configure(new ServiceCollection(), new FakeEnv(content) { EnvironmentName = "Development" }, cfg, isWindows: true);
        var ex = Assert.Throws<InvalidOperationException>(() =>
            DataProtectionConfiguration.Configure(new ServiceCollection(), new FakeEnv(content),
                new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?> { [DataProtectionConfiguration.ApplicationNameKey] = "t-prod" }).Build(), isWindows: true));
        Assert.Contains("KeysPath", ex.Message);
    }

    [Fact]
    public void Blank_or_whitespace_application_name_is_rejected_outside_Development()
    {
        var content = Tmp("content");
        foreach (var name in new[] { null, "", "   " })
            Assert.Throws<InvalidOperationException>(() => DataProtectionConfiguration.Configure(new ServiceCollection(), new FakeEnv(content),
                new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?> { [DataProtectionConfiguration.ApplicationNameKey] = name, [DataProtectionConfiguration.KeysPathKey] = Path.Combine(Path.GetTempPath(), "x") }).Build(), isWindows: false));
    }

    // Checks directory mode only (not key file mode). Plaintext keys are protected by
    // filesystem permissions only, so the directory (0700) is the control; this asserts the directory stays private.
    [UnixOnlyFact, System.Runtime.Versioning.UnsupportedOSPlatform("windows")]
    public void Generated_key_files_live_inside_a_private_directory_on_Unix()
    {
        var content = Tmp("content"); var keys = Tmp("keys");
        try
        {
            using (var sp = Build(content, new() { [DataProtectionConfiguration.KeysPathKey] = keys, [DataProtectionConfiguration.ApplicationNameKey] = "t-prod" }))
                sp.GetRequiredService<IDataProtectionProvider>().CreateProtector("t").Protect("x");
            Assert.NotEmpty(Directory.GetFiles(keys, "*.xml"));
            Assert.Equal(0, (int)File.GetUnixFileMode(keys) & 0x3F); // no group/other access to the directory
        }
        finally { if (Directory.Exists(keys)) Directory.Delete(keys, true); }
    }

    [UnixOnlyFact, System.Runtime.Versioning.UnsupportedOSPlatform("windows")]
    public void Missing_directory_is_revalidated_after_creation_and_a_swapped_in_shared_directory_is_rejected()
    {
        var content = Tmp("content"); var keys = Tmp("keys");
        try
        {
            DataProtectionConfiguration.PostCreateTestHook = dir => File.SetUnixFileMode(dir, (UnixFileMode)Convert.ToInt32("755", 8));
            Assert.Throws<InvalidOperationException>(() => Build(content, new() { [DataProtectionConfiguration.KeysPathKey] = keys, [DataProtectionConfiguration.ApplicationNameKey] = "t-prod" }));
        }
        finally { DataProtectionConfiguration.PostCreateTestHook = null; if (Directory.Exists(keys)) Directory.Delete(keys, true); }
    }

    [UnixOnlyFact, System.Runtime.Versioning.UnsupportedOSPlatform("windows")]
    public void Missing_directory_replaced_by_a_symlink_after_creation_is_rejected()
    {
        var content = Tmp("content"); var keys = Tmp("keys"); var other = Tmp("other");
        Directory.CreateDirectory(other); File.SetUnixFileMode(other, UnixFileMode.UserRead | UnixFileMode.UserWrite | UnixFileMode.UserExecute);
        try
        {
            DataProtectionConfiguration.PostCreateTestHook = dir => { Directory.Delete(dir); Directory.CreateSymbolicLink(dir, other); };
            Assert.Throws<InvalidOperationException>(() => Build(content, new() { [DataProtectionConfiguration.KeysPathKey] = keys, [DataProtectionConfiguration.ApplicationNameKey] = "t-prod" }));
        }
        finally { DataProtectionConfiguration.PostCreateTestHook = null; if (File.Exists(keys) || Directory.Exists(keys)) { try { Directory.Delete(keys); } catch { File.Delete(keys); } } if (Directory.Exists(other)) Directory.Delete(other, true); }
    }

    [UnixOnlyFact, System.Runtime.Versioning.UnsupportedOSPlatform("windows")]
    public void Helper_execution_is_bounded_and_fails_closed()
    {
        var sleep = new[] { "/usr/bin/sleep", "/bin/sleep" }.FirstOrDefault(File.Exists);
        Assert.NotNull(sleep);
        var clock = System.Diagnostics.Stopwatch.StartNew();
        var timeout = Assert.Throws<InvalidOperationException>(() => DataProtectionConfiguration.RunBounded(sleep!, TimeSpan.FromMilliseconds(400), "30"));
        Assert.Contains("timed out", timeout.Message);
        Assert.True(clock.Elapsed < TimeSpan.FromSeconds(8), "the helper timeout must bound the call");
        Assert.Throws<InvalidOperationException>(() => DataProtectionConfiguration.RunBounded("/definitely/not/an/executable", TimeSpan.FromSeconds(1)));
        var falseExe = new[] { "/usr/bin/false", "/bin/false" }.First(File.Exists);
        Assert.Throws<InvalidOperationException>(() => DataProtectionConfiguration.RunBounded(falseExe, TimeSpan.FromSeconds(2)));
    }

    [UnixOnlyFact, System.Runtime.Versioning.UnsupportedOSPlatform("windows")]
    public void A_background_child_holding_the_pipe_open_does_not_hang_the_helper()
    {
        var sh = new[] { "/usr/bin/sh", "/bin/sh" }.FirstOrDefault(File.Exists);
        Assert.NotNull(sh);
        var clock = System.Diagnostics.Stopwatch.StartNew();
        Assert.Throws<InvalidOperationException>(() => DataProtectionConfiguration.RunBounded(sh!, TimeSpan.FromSeconds(2), "-c", "sleep 30 & echo 1"));
        Assert.True(clock.Elapsed < TimeSpan.FromSeconds(10));
    }

    [UnixOnlyFact, System.Runtime.Versioning.UnsupportedOSPlatform("windows")]
    public void Owner_check_reports_the_current_user_for_a_directory_this_process_created()
    {
        var content = Tmp("content"); var keys = Tmp("keys");
        try
        {
            using (Build(content, new() { [DataProtectionConfiguration.KeysPathKey] = keys, [DataProtectionConfiguration.ApplicationNameKey] = "t-prod" })) { }
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
