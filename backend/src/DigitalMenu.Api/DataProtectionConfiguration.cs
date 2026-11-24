using Microsoft.AspNetCore.DataProtection;

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

    public static void Configure(IServiceCollection services, IHostEnvironment environment, IConfiguration configuration)
        => Configure(services, environment, configuration, OperatingSystem.IsWindows());

    // The platform is a parameter so the Windows policy can be exercised on any OS (contract tests). Behaviour is unchanged.
    public static void Configure(IServiceCollection services, IHostEnvironment environment, IConfiguration configuration, bool isWindows)
    {
        var name = configuration[ApplicationNameKey];
        if (string.IsNullOrWhiteSpace(name))
        {
            if (!environment.IsDevelopment())
                throw new InvalidOperationException("DataProtection:ApplicationName is required outside Development and must differ per deployment (for example staging vs production) so rings are isolated.");
            name = "DigitalMenu-Development";
        }
        var builder = services.AddDataProtection().SetApplicationName(name.Trim());
        var path = configuration[KeysPathKey];
        if (string.IsNullOrWhiteSpace(path))
        {
            if (environment.IsDevelopment()) return;
            throw new InvalidOperationException("DataProtection:KeysPath is required outside Development.");
        }
        if (isWindows && !environment.IsDevelopment())
            throw new InvalidOperationException("Windows key-directory ACLs are not validated by this build; durable key storage on Windows is not supported yet.");
        var dir = PrepareDirectory(path, environment, configuration);
        builder.PersistKeysToFileSystem(new DirectoryInfo(dir));
    }

    internal static string PrepareDirectory(string path, IHostEnvironment environment, IConfiguration configuration)
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
        if (Directory.Exists(full) || File.Exists(full))
        {
            var info = new DirectoryInfo(full);
            if (!info.Exists) throw new InvalidOperationException("DataProtection key path is not a directory.");
            if (info.Attributes.HasFlag(FileAttributes.ReparsePoint) || info.LinkTarget is not null)
                throw new InvalidOperationException("DataProtection key directory must not be a symlink or reparse point.");
            if (!OperatingSystem.IsWindows() &&
                (File.GetUnixFileMode(full) & (UnixFileMode.GroupRead | UnixFileMode.GroupWrite | UnixFileMode.GroupExecute | UnixFileMode.OtherRead | UnixFileMode.OtherWrite | UnixFileMode.OtherExecute)) != 0)
                throw new InvalidOperationException("Existing DataProtection key directory must be private (mode 0700); it is not modified automatically.");
            if (!OperatingSystem.IsWindows() && OwnerUid(full) != CurrentUid())
                throw new InvalidOperationException("Existing DataProtection key directory must be owned by the service account.");
        }
        else if (OperatingSystem.IsWindows()) Directory.CreateDirectory(full);
        else Directory.CreateDirectory(full, UnixFileMode.UserRead | UnixFileMode.UserWrite | UnixFileMode.UserExecute);
        return full;
    }

    // Linux/macOS: owner uid via coreutils/BSD stat, and effective uid via id. Fails closed if unavailable.
    static string Run(string file, params string[] args)
    {
        var psi = new System.Diagnostics.ProcessStartInfo(file) { RedirectStandardOutput = true, RedirectStandardError = true };
        foreach (var a in args) psi.ArgumentList.Add(a);
        using var p = System.Diagnostics.Process.Start(psi) ?? throw new InvalidOperationException("Cannot verify key directory ownership.");
        var o = p.StandardOutput.ReadToEnd().Trim();
        if (!p.WaitForExit(5000) || p.ExitCode != 0 || o.Length == 0) throw new InvalidOperationException("Cannot verify key directory ownership.");
        return o;
    }
    static string OwnerUid(string path) => OperatingSystem.IsMacOS() ? Run("stat", "-f", "%u", path) : Run("stat", "-c", "%u", path);
    static string CurrentUid() => Run("id", "-u");

    static bool Overlaps(string a, string b)
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

    static string ResolveLoose(string path)
    {
        var full = Path.GetFullPath(path).TrimEnd(Path.DirectorySeparatorChar);
        var probe = full; var tail = "";
        while (!Directory.Exists(probe) && Path.GetDirectoryName(probe) is { } up)
        { tail = Path.DirectorySeparatorChar + Path.GetFileName(probe) + tail; probe = up; }
        return Resolve(probe) + tail;
    }
}
