using Microsoft.AspNetCore.DataProtection;

namespace DigitalMenu.Api;

/// <summary>
/// Persists ASP.NET Data Protection keys so auth cookies, antiforgery tokens and
/// one-time identity tokens survive restarts and are shared by instances.
/// Keys are secrets: the directory must be private to the service account and
/// must not be inside the web root, the media root or a publicly served path.
/// </summary>
public static class DataProtectionConfiguration
{
    public const string KeysPathKey = "DataProtection:KeysPath";
    public const string ApplicationName = "DigitalMenu";

    public static void Configure(IServiceCollection services, IHostEnvironment environment, IConfiguration configuration)
    {
        var builder = services.AddDataProtection().SetApplicationName(ApplicationName);
        if (configuration[KeysPathKey] is not { Length: > 0 } path) return;
        var full = Path.GetFullPath(path);
        foreach (var protectedRoot in new[] { environment.ContentRootPath, AppContext.BaseDirectory })
        {
            var root = Path.GetFullPath(protectedRoot).TrimEnd(Path.DirectorySeparatorChar);
            if (full.StartsWith(root + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase) ||
                string.Equals(full, root, StringComparison.OrdinalIgnoreCase))
                throw new InvalidOperationException("DataProtection key directory must be outside application directories.");
        }
        var mediaRoot = configuration["Media:LocalRoot"];
        if (mediaRoot is { Length: > 0 })
        {
            var media = Path.GetFullPath(mediaRoot).TrimEnd(Path.DirectorySeparatorChar);
            if (full.StartsWith(media + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase) ||
                string.Equals(full, media, StringComparison.OrdinalIgnoreCase))
                throw new InvalidOperationException("DataProtection key directory must not be inside the media root.");
        }
        Directory.CreateDirectory(full);
        if (!OperatingSystem.IsWindows())
            File.SetUnixFileMode(full, UnixFileMode.UserRead | UnixFileMode.UserWrite | UnixFileMode.UserExecute);
        builder.PersistKeysToFileSystem(new DirectoryInfo(full));
    }

    public static bool IsPersistent(IConfiguration configuration) => configuration[KeysPathKey] is { Length: > 0 };
}
