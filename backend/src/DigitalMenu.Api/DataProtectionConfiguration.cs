using Microsoft.AspNetCore.DataProtection;
using Microsoft.EntityFrameworkCore;
using System.Security.Cryptography.X509Certificates;

namespace DigitalMenu.Api;

/// <summary>
/// Durable Data Protection keys (auth cookies, antiforgery, one-time identity tokens).
/// Policy: outside Development an explicit dedicated absolute key directory is required.
/// The directory is never chmod'ed if it already exists (it must already be private),
/// is created atomically with owner-only mode when missing, must not be a symlink or
/// reparse point, and must not overlap (contain or sit inside) the application, content
/// or media roots after symlink resolution. Keys are stored as plaintext XML: protection
/// at rest is filesystem permissions only (no key encryption is configured). Windows ACLs
/// are not validated here, so outside Development Windows is refused until a verified
/// ACL or protected-store policy exists.
/// </summary>
public static class DataProtectionConfiguration
{
    public const string KeysPathKey = "DataProtection:KeysPath";
    public const string ApplicationNameKey = "DataProtection:ApplicationName";
    public const string ProviderKey = "DataProtection:Provider";
    public const string CertificateKey = "DataProtection:Certificate:Pem";
    public const string CertificateKeyKey = "DataProtection:Certificate:KeyPem";
    // Historical decrypt-only certificates: DataProtection:PreviousCertificates:0:Pem / :KeyPem, then 1, 2, ...
    public const string PreviousCertificatesKey = "DataProtection:PreviousCertificates";

    // Database provider: key ring rows live in the application database and are wrapped with an RSA X.509
    // certificate supplied as PEM text (certificate) and PKCS#8 PEM text (private key) in configuration.
    // A PFX is deliberately not used: on the target IIS host PFX import fails except into the persistent machine
    // key store, while the PEM route builds the key in memory (CopyWithPrivateKey). In-memory import does not itself
    // write the key to an OS key store, but panel/IIS configuration may still persist the secret text; its
    // confidentiality is that of the host configuration. Explicit selection never falls back to the filesystem or
    // a plaintext ring: a missing or invalid value throws at startup in every environment. Startup does not contact
    // the database, so an unreachable database surfaces on first key use, not at startup.
    internal static void ConfigureDatabaseProvider(IDataProtectionBuilder builder, IConfiguration configuration)
    {
        var owned = new List<System.Security.Cryptography.X509Certificates.X509Certificate2>();
        try
        {
            var current = LoadCertificate(configuration[CertificateKey], configuration[CertificateKeyKey], "current");
            owned.Add(current);
            var previous = new List<System.Security.Cryptography.X509Certificates.X509Certificate2>();
            foreach (var child in configuration.GetSection(PreviousCertificatesKey).GetChildren().OrderBy(c => int.TryParse(c.Key, out var i) ? i : int.MaxValue))
            {
                // Strict: a previous entry with only one half, or neither, is an error and never silently ignored.
                var cert = LoadCertificate(child["Pem"], child["KeyPem"], $"previous #{child.Key}");
                owned.Add(cert); previous.Add(cert);
            }
            var connection = configuration.GetConnectionString("MenuDatabase");
            if (string.IsNullOrWhiteSpace(connection))
                throw new InvalidOperationException("ConnectionStrings:MenuDatabase is required for the Database data-protection provider.");
            builder.Services.AddDbContext<DigitalMenu.Infrastructure.Persistence.DataProtectionKeyDbContext>(
                o => o.UseSqlServer(connection, sql => sql.MigrationsHistoryTable(DigitalMenu.Infrastructure.Persistence.DataProtectionKeyDbContext.HistoryTable)));
            builder.PersistKeysToDbContext<DigitalMenu.Infrastructure.Persistence.DataProtectionKeyDbContext>();
            builder.ProtectKeysWithCertificate(current);
            // Decrypt-only: old certificates are kept until all retained ring keys and recovery needs allow retirement.
            if (previous.Count > 0) builder.UnprotectKeysWithAnyCertificate(previous.ToArray());
            builder.Services.AddSingleton(new CertificateOwner(owned)); // disposed with the container, after Data Protection use
        }
        catch { foreach (var c in owned) c.Dispose(); throw; }
    }

    sealed class CertificateOwner(IEnumerable<System.Security.Cryptography.X509Certificates.X509Certificate2> certs) : IDisposable
    {
        public void Dispose() { foreach (var c in certs) c.Dispose(); }
    }

    // Accepts real newlines or literal \n sequences (single-line environment values).
    static string NormalizePem(string value) => value.Trim().Replace("\\r", "").Replace("\\n", "\n");

    internal static System.Security.Cryptography.X509Certificates.X509Certificate2 LoadCertificate(string? certPem, string? keyPem, string label)
    {
        if (string.IsNullOrWhiteSpace(certPem) || string.IsNullOrWhiteSpace(keyPem))
            throw new InvalidOperationException($"DataProtection {label} certificate and private key (PEM) are both required for the Database provider.");
        System.Security.Cryptography.X509Certificates.X509Certificate2? pub = null;
        System.Security.Cryptography.RSA? priv = null;
        try
        {
            pub = System.Security.Cryptography.X509Certificates.X509Certificate2.CreateFromPem(NormalizePem(certPem));
            using var pubKey = pub.GetRSAPublicKey() ?? throw new InvalidOperationException($"DataProtection {label} certificate must contain an RSA key.");
            priv = System.Security.Cryptography.RSA.Create();
            priv.ImportFromPem(NormalizePem(keyPem));
            if (!pubKey.ExportParameters(false).Modulus!.AsSpan().SequenceEqual(priv.ExportParameters(false).Modulus!))
                throw new InvalidOperationException($"DataProtection {label} private key does not match the certificate.");
            var withKey = pub.CopyWithPrivateKey(priv);
            // Prove the pair is usable for wrapping and unwrapping now, not at first login.
            using (var rsa = withKey.GetRSAPrivateKey() ?? throw new InvalidOperationException($"DataProtection {label} private key is not usable."))
            {
                var probe = System.Security.Cryptography.RandomNumberGenerator.GetBytes(16);
                if (!rsa.Decrypt(rsa.Encrypt(probe, System.Security.Cryptography.RSAEncryptionPadding.OaepSHA256), System.Security.Cryptography.RSAEncryptionPadding.OaepSHA256).AsSpan().SequenceEqual(probe))
                    throw new InvalidOperationException($"DataProtection {label} certificate key pair failed a wrap/unwrap check.");
            }
            return withKey;
        }
        catch (Exception e) when (e is System.Security.Cryptography.CryptographicException or ArgumentException or FormatException)
        {
            throw new InvalidOperationException($"DataProtection {label} certificate or private key could not be loaded (must be RSA certificate PEM plus unencrypted PKCS#8 RSA key PEM).");
        }
        finally { priv?.Dispose(); pub?.Dispose(); }
    }

    public static void Configure(IServiceCollection services, IHostEnvironment environment, IConfiguration configuration)
        => Configure(services, environment, configuration, OperatingSystem.IsWindows());

    // Test seam only (internal): the platform is a parameter so the Windows policy decision can be exercised on any OS. Production entry is the three-argument overload bound to the real OS. Directory preparation still reads the real OS.
    internal static void Configure(IServiceCollection services, IHostEnvironment environment, IConfiguration configuration, bool isWindows, Action<string>? afterCreateForTests = null)
    {
        var name = configuration[ApplicationNameKey];
        if (string.IsNullOrWhiteSpace(name))
        {
            if (!environment.IsDevelopment())
                throw new InvalidOperationException("DataProtection:ApplicationName is required outside Development and must differ per deployment (for example staging vs production) so rings are isolated.");
            name = "DigitalMenu-Development";
        }
        var builder = services.AddDataProtection().SetApplicationName(name.Trim());
        if (string.Equals(configuration[ProviderKey], "Database", StringComparison.OrdinalIgnoreCase))
        {
            ConfigureDatabaseProvider(builder, configuration);
            return;
        }
        var path = configuration[KeysPathKey];
        if (string.IsNullOrWhiteSpace(path))
        {
            if (environment.IsDevelopment()) return;
            throw new InvalidOperationException("DataProtection:KeysPath is required outside Development.");
        }
        if (isWindows && !environment.IsDevelopment())
            throw new InvalidOperationException("Windows key-directory ACLs are not validated by this build; durable key storage on Windows is not supported yet.");
        var dir = PrepareDirectory(path, environment, configuration, afterCreateForTests);
        builder.PersistKeysToFileSystem(new DirectoryInfo(dir));
    }

    internal static string PrepareDirectory(string path, IHostEnvironment environment, IConfiguration configuration, Action<string>? afterCreateForTests = null)
    {
        if (!Path.IsPathRooted(path)) throw new InvalidOperationException("DataProtection key directory must be an absolute path.");
        var full = Path.GetFullPath(path).TrimEnd(Path.DirectorySeparatorChar);
        if (full.Length == 0 || Path.GetPathRoot(full)!.TrimEnd(Path.DirectorySeparatorChar) == full)
            throw new InvalidOperationException("DataProtection key directory cannot be a filesystem root.");
        var parent = Path.GetDirectoryName(full)!;
        if (!Directory.Exists(parent)) throw new InvalidOperationException("DataProtection key directory parent must already exist.");
        var real = Resolve(parent) + Path.DirectorySeparatorChar + Path.GetFileName(full);
        var protectedRoots = new List<string> { environment.ContentRootPath, AppContext.BaseDirectory };
        if (configuration["Media:LocalRoot"] is { Length: > 0 } media) protectedRoots.Add(media);
        foreach (var r in protectedRoots)
        {
            var rr = ResolveLoose(r);
            if (Overlaps(real, rr)) throw new InvalidOperationException("DataProtection key directory must not overlap application, content or media directories.");
        }
        if (Directory.Exists(full) || File.Exists(full)) ValidateExistingDirectory(full);
        else
        {
            if (OperatingSystem.IsWindows()) Directory.CreateDirectory(full);
            else Directory.CreateDirectory(full, UnixFileMode.UserRead | UnixFileMode.UserWrite | UnixFileMode.UserExecute);
            afterCreateForTests?.Invoke(full);
            // Revalidate what actually exists now. This narrows, but does not close, the window in which another
            // writer of the parent directory could replace the path: only a trusted, dedicated parent is safe.
            ValidateExistingDirectory(full);
        }
        return full;
    }

    static void ValidateExistingDirectory(string full)
    {
        var info = new DirectoryInfo(full);
        if (!info.Exists) throw new InvalidOperationException("DataProtection key path is not a directory.");
        if (info.Attributes.HasFlag(FileAttributes.ReparsePoint) || info.LinkTarget is not null)
            throw new InvalidOperationException("DataProtection key directory must not be a symlink or reparse point.");
        if (!OperatingSystem.IsWindows() &&
            (File.GetUnixFileMode(full) & (UnixFileMode.GroupRead | UnixFileMode.GroupWrite | UnixFileMode.GroupExecute | UnixFileMode.OtherRead | UnixFileMode.OtherWrite | UnixFileMode.OtherExecute)) != 0)
            throw new InvalidOperationException("Existing DataProtection key directory must be private (no group or other access); it is not modified automatically.");
        if (!OperatingSystem.IsWindows() && OwnerUid(full) != CurrentUid())
            throw new InvalidOperationException("Existing DataProtection key directory must be owned by the service account.");
    }

    // Linux/macOS: owner uid via coreutils/BSD stat, and effective uid via id, always by absolute path (never PATH).
    // Fails closed when no known absolute executable exists or the call does not finish in time.
    static readonly TimeSpan HelperTimeout = TimeSpan.FromSeconds(5);
    static string FindExecutable(params string[] candidates) =>
        candidates.FirstOrDefault(File.Exists) ?? throw new InvalidOperationException("Cannot verify key directory ownership.");

    internal static string RunBounded(string file, TimeSpan timeout, params string[] args)
    {
        var psi = new System.Diagnostics.ProcessStartInfo(file) { RedirectStandardOutput = true, RedirectStandardError = true, UseShellExecute = false };
        foreach (var a in args) psi.ArgumentList.Add(a);
        System.Diagnostics.Process? started;
        try { started = System.Diagnostics.Process.Start(psi); }
        catch (System.ComponentModel.Win32Exception) { throw new InvalidOperationException("Cannot verify key directory ownership (helper could not start)."); }
        using var p = started ?? throw new InvalidOperationException("Cannot verify key directory ownership.");
        var stdout = p.StandardOutput.ReadToEndAsync();
        var stderr = p.StandardError.ReadToEndAsync();
        if (!p.WaitForExit(timeout))
        {
            var killed = true;
            try { p.Kill(entireProcessTree: true); }
            catch (Exception e) when (e is InvalidOperationException or System.ComponentModel.Win32Exception or NotSupportedException) { killed = false; }
            if (killed) p.WaitForExit(TimeSpan.FromSeconds(2));
            throw new InvalidOperationException(killed
                ? "Cannot verify key directory ownership (helper timed out and was killed)."
                : "Cannot verify key directory ownership (helper timed out and could not be killed).");
        }
        // The process exited; a descendant could still hold the pipes open, so the reads are bounded too.
        // This only bounds the wait: it does not stop or clean up such a descendant.
        if (!Task.WhenAll(stdout, stderr).Wait(TimeSpan.FromSeconds(2)))
            throw new InvalidOperationException("Cannot verify key directory ownership (helper output did not close).");
        var o = stdout.Result.Trim();
        if (p.ExitCode != 0 || o.Length == 0 || o.Length > 64) throw new InvalidOperationException("Cannot verify key directory ownership.");
        return o;
    }
    static string OwnerUid(string path) => RunBounded(FindExecutable("/usr/bin/stat", "/bin/stat"), HelperTimeout,
        OperatingSystem.IsMacOS() ? new[] { "-f", "%u", path } : new[] { "-c", "%u", path });
    static string CurrentUid() => RunBounded(FindExecutable("/usr/bin/id", "/bin/id"), HelperTimeout, "-u");

    internal static bool Overlaps(string a, string b)
    {
        static string N(string s) => s.TrimEnd(Path.DirectorySeparatorChar) + Path.DirectorySeparatorChar;
        var x = N(a); var y = N(b);
        return x.StartsWith(y, StringComparison.OrdinalIgnoreCase) || y.StartsWith(x, StringComparison.OrdinalIgnoreCase);
    }

    // Resolve every existing component, following symlinks.
    static string Resolve(string path)
    {
        var full = Path.GetFullPath(path);
        var info = new DirectoryInfo(full);
        var target = info.ResolveLinkTarget(returnFinalTarget: true) as DirectoryInfo;
        if (target is not null) return target.FullName.TrimEnd(Path.DirectorySeparatorChar);
        var parent = info.Parent;
        return parent is null ? full.TrimEnd(Path.DirectorySeparatorChar) : Resolve(parent.FullName) + Path.DirectorySeparatorChar + info.Name;
    }

    internal static string ResolveLoose(string path)
    {
        var full = Path.GetFullPath(path).TrimEnd(Path.DirectorySeparatorChar);
        var probe = full; var tail = "";
        while (!Directory.Exists(probe) && Path.GetDirectoryName(probe) is { } up)
        { tail = Path.DirectorySeparatorChar + Path.GetFileName(probe) + tail; probe = up; }
        return Resolve(probe) + tail;
    }
}
