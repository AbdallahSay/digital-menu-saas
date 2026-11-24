using DigitalMenu.Api;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Xunit;

namespace DigitalMenu.IntegrationTests;

public sealed class DataProtectionTests
{
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
            var cfg = new Dictionary<string, string?> { [DataProtectionConfiguration.KeysPathKey] = keys };
            string cipher;
            using (var a = Build(content, cfg)) cipher = a.GetRequiredService<IDataProtectionProvider>().CreateProtector("t").Protect("hello");
            Assert.NotEmpty(Directory.GetFiles(keys, "*.xml"));
            using var b = Build(content, cfg);
            Assert.Equal("hello", b.GetRequiredService<IDataProtectionProvider>().CreateProtector("t").Unprotect(cipher));
        }
        finally { if (Directory.Exists(keys)) Directory.Delete(keys, true); }
    }

    [Fact]
    public void Key_directory_inside_content_root_or_media_root_is_rejected()
    {
        var content = Path.Combine(Path.GetTempPath(), "dm-content-" + Guid.NewGuid().ToString("N"));
        Assert.Throws<InvalidOperationException>(() => Build(content, new() { [DataProtectionConfiguration.KeysPathKey] = Path.Combine(content, "keys") }));
        var media = Path.Combine(Path.GetTempPath(), "dm-media-" + Guid.NewGuid().ToString("N"));
        Assert.Throws<InvalidOperationException>(() => Build(content, new() { [DataProtectionConfiguration.KeysPathKey] = Path.Combine(media, "keys"), ["Media:LocalRoot"] = media }));
    }

    sealed class FakeEnv(string content) : IHostEnvironment
    {
        public string EnvironmentName { get; set; } = "Production";
        public string ApplicationName { get; set; } = "t";
        public string ContentRootPath { get; set; } = content;
        public Microsoft.Extensions.FileProviders.IFileProvider ContentRootFileProvider { get; set; } = null!;
    }
}
