using System.Security.Cryptography;
using System.Security.Cryptography.X509Certificates;
using DigitalMenu.Api;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace DigitalMenu.IntegrationTests;

// Keys and certificates are created in memory for each test and never written to disk or logged.
public sealed class DataProtectionDatabaseProviderTests
{
    const string Pw = "test-pass-1";
    static readonly PbeParameters Pbe = new(PbeEncryptionAlgorithm.Aes256Cbc, HashAlgorithmName.SHA256, 10000);
    const string Conn = "ConnectionStrings:MenuDatabase";
    const string ConnValue = "Server=127.0.0.1;Database=x;User Id=u;Password=p;";

    static (string cert, string key) NewRsa()
    {
        using var rsa = RSA.Create(2048);
        var req = new CertificateRequest("CN=dm-test", rsa, HashAlgorithmName.SHA256, RSASignaturePadding.Pkcs1);
        using var c = req.CreateSelfSigned(DateTimeOffset.UtcNow.AddDays(-1), DateTimeOffset.UtcNow.AddDays(30));
        return (c.ExportCertificatePem(), rsa.ExportEncryptedPkcs8PrivateKeyPem(Pw, Pbe));
    }

    static (string cert, string key) NewEcdsa()
    {
        using var ec = ECDsa.Create(ECCurve.NamedCurves.nistP256);
        var req = new CertificateRequest("CN=dm-ec", ec, HashAlgorithmName.SHA256);
        using var c = req.CreateSelfSigned(DateTimeOffset.UtcNow.AddDays(-1), DateTimeOffset.UtcNow.AddDays(30));
        return (c.ExportCertificatePem(), ec.ExportEncryptedPkcs8PrivateKeyPem(Pw, Pbe));
    }

    static (string cert, string key) NewRsaPlain()
    {
        using var rsa = RSA.Create(2048);
        var req = new CertificateRequest("CN=dm-test", rsa, HashAlgorithmName.SHA256, RSASignaturePadding.Pkcs1);
        using var c = req.CreateSelfSigned(DateTimeOffset.UtcNow.AddDays(-1), DateTimeOffset.UtcNow.AddDays(30));
        return (c.ExportCertificatePem(), rsa.ExportPkcs8PrivateKeyPem());
    }

    [Fact]
    public void Plaintext_pkcs8_loads_only_when_explicit_and_without_password()
    {
        var (c, k) = NewRsaPlain();
        using (var cert = DataProtectionConfiguration.LoadCertificate(c, k.Replace("\n", "\\n"), "current", null, "PlaintextPkcs8")) Assert.True(cert.HasPrivateKey);
        // Default (unset) mode stays encrypted-only and refuses a plaintext key.
        Assert.Throws<InvalidOperationException>(() => DataProtectionConfiguration.LoadCertificate(c, k, "current", Pw));
        Assert.Throws<InvalidOperationException>(() => DataProtectionConfiguration.LoadCertificate(c, k, "current", null));
        Assert.Throws<InvalidOperationException>(() => DataProtectionConfiguration.LoadCertificate(c, k, "current", Pw, "EncryptedPkcs8"));
        // Ambiguous mix: plaintext mode with a password is rejected, not tolerated.
        Assert.Throws<InvalidOperationException>(() => DataProtectionConfiguration.LoadCertificate(c, k, "current", Pw, "PlaintextPkcs8"));
        // Unknown or wrong-case values are rejected.
        Assert.Throws<InvalidOperationException>(() => DataProtectionConfiguration.LoadCertificate(c, k, "current", null, "plaintextpkcs8"));
        Assert.Throws<InvalidOperationException>(() => DataProtectionConfiguration.LoadCertificate(c, k, "current", null, "Pfx"));
    }

    [Fact]
    public void Plaintext_mode_rejects_an_encrypted_key_and_a_mismatched_key_and_never_falls_back()
    {
        var (c, enc) = NewRsa();
        Assert.Throws<InvalidOperationException>(() => DataProtectionConfiguration.LoadCertificate(c, enc, "current", null, "PlaintextPkcs8"));
        var (_, other) = NewRsaPlain();
        Assert.Throws<InvalidOperationException>(() => DataProtectionConfiguration.LoadCertificate(c, other, "current", null, "PlaintextPkcs8"));
    }

    [Fact]
    public void Plaintext_wrapped_ring_round_trips_with_a_plaintext_previous_certificate_via_the_provider()
    {
        var (c, k) = NewRsaPlain();
        using var cert = DataProtectionConfiguration.LoadCertificate(c, k, "current", null, "PlaintextPkcs8");
        var dir = Path.Combine(Path.GetTempPath(), "dm-dpdb-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(dir);
        try
        {
            var p1 = DataProtectionProvider.Create(new DirectoryInfo(dir), o => o.ProtectKeysWithCertificate(cert).SetApplicationName("t"));
            var enc = p1.CreateProtector("p").Protect("hello");
            var p2 = DataProtectionProvider.Create(new DirectoryInfo(dir), o => o.UnprotectKeysWithAnyCertificate(cert).SetApplicationName("t"));
            Assert.Equal("hello", p2.CreateProtector("p").Unprotect(enc));
        }
        finally { Directory.Delete(dir, true); }
    }

    [Fact]
    public void Valid_rsa_pem_pair_loads_and_wraps_a_real_key_ring_round_trip()
    {
        var (c, k) = NewRsa();
        using var cert = DataProtectionConfiguration.LoadCertificate(c, k, "current", Pw);
        Assert.True(cert.HasPrivateKey);
        var dir = Path.Combine(Path.GetTempPath(), "dm-dpdb-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(dir);
        try
        {
            var p1 = DataProtectionProvider.Create(new DirectoryInfo(dir), o => o.ProtectKeysWithCertificate(cert).SetApplicationName("t"));
            var enc = p1.CreateProtector("p").Protect("hello");
            var xml = string.Concat(Directory.GetFiles(dir).Select(File.ReadAllText));
            Assert.Contains("EncryptedData", xml);
            Assert.DoesNotContain("<masterKey", xml);
            var p2 = DataProtectionProvider.Create(new DirectoryInfo(dir), o => o.UnprotectKeysWithAnyCertificate(cert).SetApplicationName("t"));
            Assert.Equal("hello", p2.CreateProtector("p").Unprotect(enc));
        }
        finally { Directory.Delete(dir, true); }
    }

    [Fact]
    public void Single_line_env_style_pem_with_literal_backslash_n_loads()
    {
        var (c, k) = NewRsa();
        using var cert = DataProtectionConfiguration.LoadCertificate(c.Replace("\n", "\\n"), k.Replace("\n", "\\n"), "current", Pw);
        Assert.True(cert.HasPrivateKey);
    }

    [Fact]
    public void Missing_ecdsa_mismatched_public_only_and_garbage_all_fail_closed()
    {
        var (c, k) = NewRsa(); var (c2, k2) = NewRsa(); var (ec, eck) = NewEcdsa();
        Assert.Throws<InvalidOperationException>(() => DataProtectionConfiguration.LoadCertificate(null, k, "current", Pw));
        Assert.Throws<InvalidOperationException>(() => DataProtectionConfiguration.LoadCertificate(c, "", "current", Pw));
        Assert.Throws<InvalidOperationException>(() => DataProtectionConfiguration.LoadCertificate(ec, eck, "current", Pw));      // ECDSA cert and key
        Assert.Throws<InvalidOperationException>(() => DataProtectionConfiguration.LoadCertificate(c, eck, "current", Pw));       // RSA cert, EC key
        Assert.Throws<InvalidOperationException>(() => DataProtectionConfiguration.LoadCertificate(c, k2, "current", Pw));        // key does not match
        Assert.Throws<InvalidOperationException>(() => DataProtectionConfiguration.LoadCertificate(c, c, "current", Pw));         // certificate given as key
        Assert.Throws<InvalidOperationException>(() => DataProtectionConfiguration.LoadCertificate("not pem", "not pem", "current", Pw));
    }

    static Dictionary<string, string?> Good(out (string, string) pair)
    {
        pair = NewRsa();
        return new()
        {
            [DataProtectionConfiguration.ApplicationNameKey] = "t-db",
            [DataProtectionConfiguration.ProviderKey] = "Database",
            [DataProtectionConfiguration.CertificateKey] = pair.Item1,
            [DataProtectionConfiguration.CertificateKeyKey] = pair.Item2,
            [DataProtectionConfiguration.CertificatePasswordKey] = Pw,
            [Conn] = ConnValue,
        };
    }

    [Theory]
    [InlineData("Production")]
    [InlineData("Development")]
    public void Explicit_database_provider_never_falls_back_in_any_environment(string env)
    {
        Assert.Throws<InvalidOperationException>(() => Build(env, new() { [DataProtectionConfiguration.ApplicationNameKey] = "t-db", [DataProtectionConfiguration.ProviderKey] = "Database" }));
        var cfg = Good(out _); cfg.Remove(DataProtectionConfiguration.CertificateKeyKey);
        Assert.Throws<InvalidOperationException>(() => Build(env, cfg));
        cfg = Good(out _); cfg.Remove(Conn);
        Assert.Throws<InvalidOperationException>(() => Build(env, cfg));
        cfg = Good(out _);
        using var ok = Build(env, cfg); // registers without contacting the database
        Assert.NotNull(ok);
    }

    [Fact]
    public void Development_without_explicit_database_provider_keeps_original_behavior()
    {
        using var sp = Build("Development", new());
        Assert.NotNull(sp.GetService<IDataProtectionProvider>());
    }

    [Fact]
    public void Historical_certificate_collection_is_strict()
    {
        var cfg = Good(out _);
        var (o1, k1) = NewRsa(); var (o2, k2) = NewRsa();
        var pre = DataProtectionConfiguration.PreviousCertificatesKey;
        cfg[pre + ":0:Pem"] = o1; cfg[pre + ":0:KeyPem"] = k1; cfg[pre + ":0:KeyPassword"] = Pw;
        cfg[pre + ":1:Pem"] = o2; cfg[pre + ":1:KeyPem"] = k2; cfg[pre + ":1:KeyPassword"] = Pw;
        using (var many = Build("Production", cfg)) Assert.NotNull(many);
        cfg.Remove(pre + ":1:KeyPem"); // half-configured entry must not be silently ignored
        Assert.Throws<InvalidOperationException>(() => Build("Production", cfg));
        cfg[pre + ":1:KeyPem"] = k1; // mismatched pair
        Assert.Throws<InvalidOperationException>(() => Build("Production", cfg));
        cfg[pre + ":1:Pem"] = ""; cfg[pre + ":1:KeyPem"] = ""; // empty entry
        Assert.Throws<InvalidOperationException>(() => Build("Production", cfg));
    }

    [Fact]
    public void Encrypted_pkcs8_key_loads_only_with_the_right_password()
    {
        using var rsa = RSA.Create(2048);
        var req = new CertificateRequest("CN=dm-enc", rsa, HashAlgorithmName.SHA256, RSASignaturePadding.Pkcs1);
        using var c = req.CreateSelfSigned(DateTimeOffset.UtcNow.AddDays(-1), DateTimeOffset.UtcNow.AddDays(30));
        var enc = rsa.ExportEncryptedPkcs8PrivateKeyPem("test-pass-1", Pbe);
        var plain = rsa.ExportPkcs8PrivateKeyPem();
        Assert.Throws<InvalidOperationException>(() => DataProtectionConfiguration.LoadCertificate(c.ExportCertificatePem(), plain, "current", "test-pass-1"));
        Assert.Throws<InvalidOperationException>(() => DataProtectionConfiguration.LoadCertificate(c.ExportCertificatePem(), plain, "current", null));
        using var ok = DataProtectionConfiguration.LoadCertificate(c.ExportCertificatePem(), enc, "current", "test-pass-1");
        Assert.True(ok.HasPrivateKey);
        Assert.Throws<InvalidOperationException>(() => DataProtectionConfiguration.LoadCertificate(c.ExportCertificatePem(), enc, "current", "wrong"));
        Assert.Throws<InvalidOperationException>(() => DataProtectionConfiguration.LoadCertificate(c.ExportCertificatePem(), enc, "current", null));
    }

    [Fact]
    public void Certificate_owner_is_resolved_with_the_host_and_disposed_with_the_container()
    {
        var (c, k) = NewRsa();
        var sp = Build("Production", new() { [DataProtectionConfiguration.ApplicationNameKey] = "t-own", [DataProtectionConfiguration.ProviderKey] = "Database", [DataProtectionConfiguration.CertificateKey] = c, [DataProtectionConfiguration.CertificateKeyKey] = k, [DataProtectionConfiguration.CertificatePasswordKey] = Pw, [Conn] = ConnValue });
        var owner = sp.GetServices<Microsoft.Extensions.Hosting.IHostedService>().OfType<DataProtectionConfiguration.CertificateOwner>().Single();
        Assert.False(owner.IsDisposed);
        sp.Dispose();
        Assert.True(owner.IsDisposed);
    }

    static ServiceProvider Build(string environment, Dictionary<string, string?> cfg)
    {
        var configuration = new ConfigurationBuilder().AddInMemoryCollection(cfg).Build();
        var services = new ServiceCollection();
        DataProtectionConfiguration.Configure(services, new Env(environment), configuration, isWindows: true);
        return services.BuildServiceProvider();
    }

    sealed class Env(string name) : Microsoft.Extensions.Hosting.IHostEnvironment
    {
        public string EnvironmentName { get; set; } = name;
        public string ApplicationName { get; set; } = "t";
        public string ContentRootPath { get; set; } = Path.GetTempPath();
        public Microsoft.Extensions.FileProviders.IFileProvider ContentRootFileProvider { get; set; } = new Microsoft.Extensions.FileProviders.NullFileProvider();
    }
}
