namespace DigitalMenu.Api.Media;

public interface IImageStorage
{
    Task PutAsync(string key, NormalizedImage image, CancellationToken ct);
    Task RemoveAsync(string key, CancellationToken ct);
    /// <summary>Reads one immutable variant ("main" or "thumbnail"); null when absent.</summary>
    Task<byte[]?> GetAsync(string key, string variant, CancellationToken ct);
}
public sealed class UnavailableImageStorage : IImageStorage
{
    public Task PutAsync(string key, NormalizedImage image, CancellationToken ct) => throw new MediaException(503);
    public Task RemoveAsync(string key, CancellationToken ct) => throw new MediaException(503);
    public Task<byte[]?> GetAsync(string key, string variant, CancellationToken ct) => throw new MediaException(503);
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
        // Refuse links in existing ancestors before creating anything, then check again after creation.
        // Narrows, does not close, the window for another writer to swap a component.
        RejectLinks(this.root);
        Directory.CreateDirectory(this.root);
        RejectLinks(this.root);
    }
    private static void RejectLinks(string path)
    {
        for (var current = new DirectoryInfo(path); current is not null; current = current.Parent)
            if (current.Exists && (current.Attributes & FileAttributes.ReparsePoint) != 0)
                throw new IOException("Media path is not permitted.");
    }
    private string Bundle(string key) => Locate(key).path;
    private (string path, string tenant, string id) Locate(string key)
    {
        var parts = key.Split('/');
        if (parts.Length != 2 || !Guid.TryParseExact(parts[0], "D", out var tenant) || tenant == Guid.Empty || parts[0] != tenant.ToString("D") ||
            parts[1].Length != 37 || !parts[1].EndsWith(".webp", StringComparison.Ordinal) ||
            !Guid.TryParseExact(parts[1][..32], "N", out var id) || parts[1][..32] != id.ToString("N")) throw new MediaException(400);
        var path = Path.GetFullPath(Path.Combine(root, parts[0], parts[1][..32]));
        if (!path.StartsWith(root.TrimEnd(Path.DirectorySeparatorChar) + Path.DirectorySeparatorChar, StringComparison.Ordinal)) throw new MediaException(400);
        RejectLinks(path);
        return (path, parts[0], parts[1][..32]);
    }
    public async Task PutAsync(string key, NormalizedImage image, CancellationToken ct)
    {
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
    public async Task<byte[]?> GetAsync(string key, string variant, CancellationToken ct)
    {
        if (variant is not ("main" or "thumbnail")) throw new MediaException(400);
        var (bundle, tenant, id) = Locate(key);
        // A bundle whose deletion is pending or stuck is already gone for readers. Three exact-path checks, no directory scan.
        if (File.Exists(Path.Combine(bundle, "delete.pending")) || File.Exists(IndexEntry(PendingDirName, tenant, id)) || File.Exists(IndexEntry(StuckDirName, tenant, id))) return null;
        try
        {
            var file = Path.Combine(bundle, variant + ".webp");
            // Leaf links are never followed: a replaced symlink/reparse file reads as absent, not as outside content.
            var info = new FileInfo(file);
            if (info.Exists && (info.Attributes.HasFlag(FileAttributes.ReparsePoint) || info.LinkTarget is not null)) return null;
            return await File.ReadAllBytesAsync(file, ct);
        }
        catch (FileNotFoundException) { return null; }
        catch (DirectoryNotFoundException) { return null; }
    }
    // Durable deletion intent lives in two places: delete.pending inside the bundle and an index file under
    // <root>/.cleanup-pending named "<tenant>_<id>" (opaque ids only). A bundle with either, or with an entry under
    // <root>/.cleanup-stuck, is hidden from readers until its directory is gone. The index is what the cleanup worker
    // enumerates, so it never walks tenant directories.
    internal const string PendingDirName = ".cleanup-pending";
    internal const string StuckDirName = ".cleanup-stuck";
    private static readonly string[] KnownFiles = { "main.webp", "thumbnail.webp", "reservation" };
    private string IndexEntry(string dir, string tenant, string id) => Path.Combine(root, dir, tenant + "_" + id);
    internal Func<DateTime> UtcNow { get; set; } = () => DateTime.UtcNow;
    private readonly SemaphoreSlim sweepGate = new(1, 1);

    private void EnsureIndexDir(string name)
    {
        var dir = Path.Combine(root, name);
        RejectLinks(dir);
        Directory.CreateDirectory(dir);
        RejectLinks(dir);
    }
    private static void CreateEmpty(string file)
    {
        var info = new FileInfo(file);
        if (info.Exists)
        {
            if (info.Attributes.HasFlag(FileAttributes.ReparsePoint) || info.LinkTarget is not null) throw new IOException("Media path is not permitted.");
            return;
        }
        using var _ = new FileStream(file, FileMode.CreateNew, FileAccess.Write, FileShare.None);
    }

    public async Task RemoveAsync(string key, CancellationToken ct)
    {
        var (path, tenant, id) = Locate(key);
        if (!Directory.Exists(path)) return;
        // Durable deletion intent only after metadata absence is known; the callers guarantee that order.
        EnsureIndexDir(PendingDirName);
        var entry = IndexEntry(PendingDirName, tenant, id);
        CreateEmpty(entry);
        var marker = Path.Combine(path, "delete.pending");
        if (File.Exists(marker) && (File.GetAttributes(marker) & FileAttributes.ReparsePoint) != 0) throw new IOException("Media path is not permitted.");
        await File.WriteAllTextAsync(marker, "", ct);
        // Best-effort inline attempt. A transient failure throws and leaves the durable intent for the worker.
        if (FinishDelete(path) == Outcome.Done) File.Delete(entry);
        else { MoveToStuck(entry); logger.LogWarning("Private media cleanup is stuck for one bundle; see the {Dir} directory.", StuckDirName); }
    }

    private enum Outcome { Done, Unknown }

    // Deletes only the known file names, the marker and the empty directory. Anything else (unknown names, a
    // directory or link under a known name) is preserved and reported as Unknown; nothing is removed in that case.
    // The index entry, not the marker, keeps the bundle hidden while the marker is removed before the directory.
    private Outcome FinishDelete(string path)
    {
        if (!Directory.Exists(path)) return Outcome.Done;
        RejectLinks(path);
        foreach (var e in new DirectoryInfo(path).EnumerateFileSystemInfos())
            if ((Array.IndexOf(KnownFiles, e.Name) < 0 && e.Name != "delete.pending") || e is DirectoryInfo ||
                e.Attributes.HasFlag(FileAttributes.ReparsePoint) || e.LinkTarget is not null)
                return Outcome.Unknown;
        foreach (var name in KnownFiles) File.Delete(Path.Combine(path, name));
        File.Delete(Path.Combine(path, "delete.pending"));
        Directory.Delete(path, false);
        return Outcome.Done;
    }

    private void MoveToStuck(string entry)
    {
        EnsureIndexDir(StuckDirName);
        var dest = Path.Combine(root, StuckDirName, Path.GetFileName(entry));
        File.Move(entry, dest, true);
        File.SetLastWriteTimeUtc(dest, UtcNow());
    }

    internal readonly record struct SweepResult(int Visited, int Deleted, int Stuck, int Failed, bool Incomplete);

    /// <summary>
    /// One serial, cancelable pass over the pending index. Entries whose last attempt is newer than <paramref name="backoff"/>
    /// are skipped without counting against <paramref name="maxVisited"/>; a failing entry is touched, so the next pass
    /// reaches later entries instead of the same ones. Enumeration is lazy and never sorted or materialized. A second
    /// concurrent call returns an empty result.
    /// </summary>
    internal SweepResult Sweep(int maxVisited, TimeSpan maxTime, TimeSpan backoff, CancellationToken ct)
    {
        if (!sweepGate.Wait(0)) return default;
        try
        {
            var pendingDir = Path.Combine(root, PendingDirName);
            if (!Directory.Exists(pendingDir)) return default;
            RejectLinks(pendingDir);
            var clock = System.Diagnostics.Stopwatch.StartNew();
            int visited = 0, deleted = 0, stuck = 0, failed = 0; var incomplete = false;
            foreach (var file in Directory.EnumerateFiles(pendingDir))
            {
                ct.ThrowIfCancellationRequested();
                if (clock.Elapsed > maxTime) { incomplete = true; break; }
                if (UtcNow() - File.GetLastWriteTimeUtc(file) < backoff) continue;
                if (visited >= maxVisited) { incomplete = true; break; }
                visited++;
                var name = Path.GetFileName(file);
                try
                {
                    if (name.Length != 69 || name[36] != '_' || !Guid.TryParseExact(name[..36], "D", out _) || !Guid.TryParseExact(name[37..], "N", out _))
                    { MoveToStuck(file); stuck++; continue; }
                    var path = Path.GetFullPath(Path.Combine(root, name[..36], name[37..]));
                    if (FinishDelete(path) == Outcome.Done) { File.Delete(file); deleted++; }
                    else { MoveToStuck(file); stuck++; }
                }
                catch (Exception e) when (e is IOException or UnauthorizedAccessException)
                {
                    failed++;
                    try { File.SetLastWriteTimeUtc(file, UtcNow()); } catch (Exception t) when (t is IOException or UnauthorizedAccessException) { }
                }
            }
            return new SweepResult(visited, deleted, stuck, failed, incomplete);
        }
        finally { sweepGate.Release(); }
    }

    /// <summary>Moves stuck entries older than <paramref name="minAge"/> back to the pending index for one more attempt. Nothing is deleted.</summary>
    internal int ReviveStuck(int maxEntries, TimeSpan minAge, CancellationToken ct)
    {
        var stuckDir = Path.Combine(root, StuckDirName);
        if (!Directory.Exists(stuckDir)) return 0;
        RejectLinks(stuckDir);
        EnsureIndexDir(PendingDirName);
        int seen = 0, moved = 0;
        foreach (var file in Directory.EnumerateFiles(stuckDir))
        {
            ct.ThrowIfCancellationRequested();
            if (++seen > maxEntries) break;
            if (UtcNow() - File.GetLastWriteTimeUtc(file) < minAge) continue;
            try { File.Move(file, Path.Combine(root, PendingDirName, Path.GetFileName(file)), true); moved++; }
            catch (Exception e) when (e is IOException or UnauthorizedAccessException) { }
        }
        return moved;
    }

    internal int CountStuck(int limit)
    {
        var stuckDir = Path.Combine(root, StuckDirName);
        return Directory.Exists(stuckDir) ? Directory.EnumerateFiles(stuckDir).Take(limit).Count() : 0;
    }
}

/// <summary>
/// Runs the bounded cleanup pass once at host start (restart catch-up) and then on an interval. It sweeps only the
/// index of bundles already marked for deletion and never touches live bundles or pending uploads. No interval or
/// completion time is promised under backlog or downtime.
/// </summary>
public sealed class MediaCleanupWorker(IImageStorage storage, IConfiguration configuration, ILogger<MediaCleanupWorker> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken ct)
    {
        if (storage is not LocalImageStorage local) return;
        await Task.Yield();
        var seconds = int.TryParse(configuration["Media:CleanupIntervalSeconds"], out var s) ? Math.Clamp(s, 5, 3600) : 300;
        var interval = TimeSpan.FromSeconds(seconds);
        var lastRevive = DateTime.MinValue;
        while (!ct.IsCancellationRequested)
        {
            try
            {
                if (DateTime.UtcNow - lastRevive >= TimeSpan.FromHours(24))
                {
                    lastRevive = DateTime.UtcNow;
                    local.ReviveStuck(100, TimeSpan.FromHours(24), ct);
                }
                var r = local.Sweep(500, TimeSpan.FromSeconds(5), interval, ct);
                if (r.Stuck > 0 || r.Failed > 0 || r.Incomplete)
                    logger.LogWarning("Private media cleanup pass: visited {Visited}, deleted {Deleted}, stuck {Stuck}, failed {Failed}, incomplete {Incomplete}; stuck total {StuckTotal}.",
                        r.Visited, r.Deleted, r.Stuck, r.Failed, r.Incomplete, local.CountStuck(1000));
            }
            catch (OperationCanceledException) { break; }
            catch (Exception e) { logger.LogWarning("Private media cleanup pass failed: {Type}.", e.GetType().Name); }
            try { await Task.Delay(interval, ct); } catch (OperationCanceledException) { break; }
        }
    }
}
