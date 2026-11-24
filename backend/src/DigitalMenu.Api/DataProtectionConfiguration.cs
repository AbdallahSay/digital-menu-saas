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
    public const string ApplicationName = "DigitalMenu";

    public static void Configure(IServiceCollection services, IHostEnvironment environment, IConfiguration configuration)
    {
        var builder = services.AddDataProtection().SetApplicationName(ApplicationName);
        var path = configuration[KeysPathKey];
        if (string.IsNullOrWhiteSpace(path))
        {
            if (environment.IsDevelopment()) return;
            throw new InvalidOperationException("DataProtection:KeysPath is required outside Development.");
        }
        if (OperatingSystem.IsWindows() && !environment.IsDevelopment())
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
        }
        else if (OperatingSystem.IsWindows()) Directory.CreateDirectory(full);
        else Directory.CreateDirectory(full, UnixFileMode.UserRead | UnixFileMode.UserWrite | UnixFileMode.UserExecute);
        return full;
    }

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
