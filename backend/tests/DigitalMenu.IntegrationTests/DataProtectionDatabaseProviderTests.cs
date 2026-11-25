using System.Security.Cryptography;
using System.Security.Cryptography.X509Certificates;
using DigitalMenu.Api;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace DigitalMenu.IntegrationTests;

// Certificates here are created in memory for the test and never written to disk or logged.
public sealed class DataProtectionDatabaseProviderTests
{
    static (string pfx, string pw) NewPfx(bool withKey = true)
    {
        using var rsa = RSA.Create(2048);
        var req = new CertificateRequest("CN=dm-test", rsa, HashAlgorithmName.SHA256, RSASignaturePadding.Pkcs1);
        using var cert = req.CreateSelfSigned(DateTimeOffset.UtcNow.AddDays(-1), DateTimeOffset.UtcNow.AddDays(30));
        var pw = Guid.NewGuid().ToString("N");
        var bytes = withKey ? cert.Export(X509ContentType.Pfx, pw) : cert.Export(X509ContentType.Cert);
        return (Convert.ToBase64String(bytes), pw);
    }

    [Fact]
    public void Valid_pfx_loads_with_private_key()
    {
        var (pfx, pw) = NewPfx();
        using var c = DataProtectionConfiguration.LoadCertificate(pfx, pw, "current");
        Assert.True(c.HasPrivateKey);
    }

    [Fact]
    public void Missing_wrong_password_bad_base64_and_public_only_all_fail_closed()
    {
        var (pfx, pw) = NewPfx();
        Assert.Throws<InvalidOperationException>(() => DataProtectionConfiguration.LoadCertificate(null, pw, "current"));
        Assert.Throws<InvalidOperationException>(() => DataProtectionConfiguration.LoadCertificate(pfx, "", "current"));
        Assert.Throws<InvalidOperationException>(() => DataProtectionConfiguration.LoadCertificate(pfx, "wrong", "current"));
        Assert.Throws<InvalidOperationException>(() => DataProtectionConfiguration.LoadCertificate("not-base64!!", pw, "current"));
        var (pub, pw2) = NewPfx(withKey: false);
        Assert.Throws<InvalidOperationException>(() => DataProtectionConfiguration.LoadCertificate(pub, pw2, "current"));
    }

    [Fact]
    public void Database_provider_in_production_requires_certificate_and_connection_string()
    {
        var content = Path.Combine(Path.GetTempPath(), "dm-content-" + Guid.NewGuid().ToString("N"));
        var baseCfg = new Dictionary<string, string?> { [DataProtectionConfiguration.ApplicationNameKey] = "t-db", [DataProtectionConfiguration.ProviderKey] = "Database" };
        Assert.Throws<InvalidOperationException>(() => Build(content, baseCfg));
        var (pfx, pw) = NewPfx();
        var withCert = new Dictionary<string, string?>(baseCfg) { [DataProtectionConfiguration.CertificateKey] = pfx, [DataProtectionConfiguration.CertificatePasswordKey] = pw };
        Assert.Throws<InvalidOperationException>(() => Build(content, withCert)); // no connection string
        withCert["ConnectionStrings:MenuDatabase"] = "Server=127.0.0.1;Database=x;User Id=u;Password=p;TrustServerCertificate=False";
        using var ok = Build(content, withCert); // registers without connecting
        Assert.NotNull(ok);
    }

    static ServiceProvider Build(string content, Dictionary<string, string?> cfg)
    {
        var configuration = new ConfigurationBuilder().AddInMemoryCollection(cfg).Build();
        var env = new Microsoft.Extensions.FileProviders.NullFileProvider();
        var services = new Microsoft.Extensions.DependencyInjection.ServiceCollection();
        DataProtectionConfiguration.Configure(services, new Env(content), configuration, isWindows: true);
        return services.BuildServiceProvider();
    }

    sealed class Env(string content) : Microsoft.Extensions.Hosting.IHostEnvironment
    {
        public string EnvironmentName { get; set; } = "Production";
        public string ApplicationName { get; set; } = "t";
        public string ContentRootPath { get; set; } = content;
        public Microsoft.Extensions.FileProviders.IFileProvider ContentRootFileProvider { get; set; } = new Microsoft.Extensions.FileProviders.NullFileProvider();
    }
}
