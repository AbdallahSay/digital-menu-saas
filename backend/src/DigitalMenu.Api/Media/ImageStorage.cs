namespace DigitalMenu.Api.Media;

public interface IImageStorage
{
    Task PutAsync(string key, NormalizedImage image, CancellationToken ct);
    Task RemoveAsync(string key, CancellationToken ct);
}
public sealed class UnavailableImageStorage : IImageStorage
{
    public Task PutAsync(string key, NormalizedImage image, CancellationToken ct) => throw new MediaException(503);
    public Task RemoveAsync(string key, CancellationToken ct) => throw new MediaException(503);
}

// Private local adapter; no HTTP/static-file serving. Trusted OS user owns this directory.
public sealed class LocalImageStorage : IImageStorage
{
    private readonly string root;
    private readonly ILogger<LocalImageStorage> logger;
    public LocalImageStorage(string root, ILogger<LocalImageStorage> logger)
    {
        if (!Path.IsPathFullyQualified(root)) throw new InvalidOperationException("Media root must be absolute.");
        this.root = Path.GetFullPath(root);
        this.logger = logger;
        Directory.CreateDirectory(this.root);
        RejectLinks(this.root);
    }
    private static void RejectLinks(string path)
    {
        for (var current = new DirectoryInfo(path); current is not null; current = current.Parent)
            if (current.Exists && (current.Attributes & FileAttributes.ReparsePoint) != 0)
                throw new IOException("Media path is not permitted.");
    }
    private string Bundle(string key)
    {
        var parts = key.Split('/');
        if (parts.Length != 2 || !Guid.TryParseExact(parts[0], "D", out var tenant) || tenant == Guid.Empty || parts[0] != tenant.ToString("D") ||
            parts[1].Length != 37 || !parts[1].EndsWith(".webp", StringComparison.Ordinal) ||
            !Guid.TryParseExact(parts[1][..32], "N", out var id) || parts[1][..32] != id.ToString("N")) throw new MediaException(400);
        var path = Path.GetFullPath(Path.Combine(root, parts[0], parts[1][..32]));
        if (!path.StartsWith(root.TrimEnd(Path.DirectorySeparatorChar) + Path.DirectorySeparatorChar, StringComparison.Ordinal)) throw new MediaException(400);
        RejectLinks(path);
        return path;
    }
    public async Task PutAsync(string key, NormalizedImage image, CancellationToken ct)
    {
        RetryMarkedCleanup();
        var path = Bundle(key);
        // Reserve the server-owned random key exclusively; never overwrite an existing object.
        Directory.CreateDirectory(path);
        var reservation = Path.Combine(path, "reservation");
        await using (var reserve = new FileStream(reservation, FileMode.CreateNew, FileAccess.Write, FileShare.None))
            await reserve.FlushAsync(ct);
        try
        {
            await WriteNew(Path.Combine(path, "main.webp"), image.Main, ct);
            await WriteNew(Path.Combine(path, "thumbnail.webp"), image.Thumbnail, ct);
        }
        catch
        {
            try { await RemoveAsync(key, CancellationToken.None); }
            catch (Exception) { logger.LogWarning("Private media cleanup pending."); }
            throw;
        }
    }
    private static async Task WriteNew(string path, byte[] bytes, CancellationToken ct)
    {
        await using var file = new FileStream(path, FileMode.CreateNew, FileAccess.Write, FileShare.None);
        await file.WriteAsync(bytes, ct);
        await file.FlushAsync(ct);
    }
    public async Task RemoveAsync(string key, CancellationToken ct)
    {
        var path = Bundle(key);
        if (!Directory.Exists(path)) return;
        // Durable deletion intent only after metadata absence is known; retries never inspect pending uploads.
        var marker = Path.Combine(path, "delete.pending");
        if (File.Exists(marker) && (File.GetAttributes(marker) & FileAttributes.ReparsePoint) != 0) throw new IOException("Media path is not permitted.");
        await File.WriteAllTextAsync(marker, "", ct);
        DeleteMarked(path);
    }
    private static void DeleteMarked(string path)
    {
        RejectLinks(path);
        foreach (var name in new[] { "main.webp", "thumbnail.webp", "reservation" })
        {
            var file = Path.Combine(path, name);
            if (File.Exists(file) && (File.GetAttributes(file) & FileAttributes.ReparsePoint) != 0) throw new IOException("Media path is not permitted.");
            File.Delete(file);
        }
        File.Delete(Path.Combine(path, "delete.pending"));
        try { Directory.Delete(path, false); }
        catch { File.WriteAllText(Path.Combine(path, "delete.pending"), ""); throw; }
    }
    private void RetryMarkedCleanup()
    {
        var processed = 0;
        foreach (var tenant in Directory.EnumerateDirectories(root))
        {
            if (!Guid.TryParseExact(Path.GetFileName(tenant), "D", out _)) continue;
            RejectLinks(tenant);
            foreach (var bundle in Directory.EnumerateDirectories(tenant))
            {
                if (!Guid.TryParseExact(Path.GetFileName(bundle), "N", out _) || !File.Exists(Path.Combine(bundle, "delete.pending"))) continue;
                if (++processed > 100) return;
                try { DeleteMarked(bundle); }
                catch (IOException) { logger.LogWarning("Private media cleanup pending."); }
                catch (UnauthorizedAccessException) { logger.LogWarning("Private media cleanup pending."); }
            }
        }
    }
}
