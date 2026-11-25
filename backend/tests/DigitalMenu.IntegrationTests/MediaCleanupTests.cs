using DigitalMenu.Api.Media;
using Microsoft.Extensions.Logging.Abstractions;
using Xunit;

namespace DigitalMenu.IntegrationTests;

/// <summary>Skipped on Windows and when the process is privileged (permission bits are not enforced for it).</summary>
public sealed class UnixNonPrivilegedFactAttribute : FactAttribute
{
    public UnixNonPrivilegedFactAttribute()
    {
        if (OperatingSystem.IsWindows()) Skip = "Unix-only behavior; not executed on Windows.";
        else if (Environment.IsPrivilegedProcess) Skip = "Needs an unprivileged process: directory permission bits are not enforced for a privileged one.";
    }
}

public sealed class MediaCleanupTests : IDisposable
{
    private readonly string root = Path.Combine(Path.GetTempPath(), "dm-clean-" + Guid.NewGuid().ToString("N"));
    private readonly LocalImageStorage storage;
    private static readonly TimeSpan Time = TimeSpan.FromSeconds(30);
    public MediaCleanupTests() { storage = new LocalImageStorage(root, NullLogger<LocalImageStorage>.Instance); }
    public void Dispose()
    {
        if (!Directory.Exists(root)) return;
        foreach (var d in Directory.EnumerateDirectories(root, "*", SearchOption.AllDirectories))
            if (!OperatingSystem.IsWindows()) try { File.SetUnixFileMode(d, (UnixFileMode)0b111_000_000); } catch (IOException) { }
        Directory.Delete(root, true);
    }

    // Builds a bundle that is already marked for deletion, as RemoveAsync leaves it when the first attempt did not finish.
    private (string key, string bundle, string entry) Pending(bool withIndex = true, bool withMarker = true)
    {
        var tenant = Guid.NewGuid().ToString("D"); var id = Guid.NewGuid().ToString("N");
        var bundle = Path.Combine(root, tenant, id);
        Directory.CreateDirectory(bundle);
        File.WriteAllBytes(Path.Combine(bundle, "main.webp"), new byte[] { 1 });
        File.WriteAllBytes(Path.Combine(bundle, "thumbnail.webp"), new byte[] { 2 });
        if (withMarker) File.WriteAllText(Path.Combine(bundle, "delete.pending"), "");
        var entry = Path.Combine(root, LocalImageStorage.PendingDirName, tenant + "_" + id);
        if (withIndex) { Directory.CreateDirectory(Path.GetDirectoryName(entry)!); File.WriteAllText(entry, ""); }
        return (tenant + "/" + id + ".webp", bundle, entry);
    }

    [Fact]
    public async Task Reads_never_scan_or_delete_other_bundles_and_hide_marked_or_indexed_bundles()
    {
        var other = Pending();
        var markerOnly = Pending(withIndex: false);
        var indexOnly = Pending(withMarker: false);
        var live = Guid.NewGuid().ToString("D") + "/" + Guid.NewGuid().ToString("N") + ".webp";
        Assert.Null(await storage.GetAsync(live, "main", default));
        Assert.Null(await storage.GetAsync(markerOnly.key, "main", default));
        Assert.Null(await storage.GetAsync(indexOnly.key, "main", default));
        Assert.True(Directory.Exists(other.bundle));
        Assert.True(File.Exists(Path.Combine(markerOnly.bundle, "main.webp")));
        Assert.True(File.Exists(Path.Combine(indexOnly.bundle, "main.webp")));
    }

    [Fact]
    public void Sweep_respects_the_visit_budget_and_finishes_over_several_passes_without_touching_live_bundles()
    {
        var live = Pending(withIndex: false, withMarker: false);
        var items = Enumerable.Range(0, 5).Select(_ => Pending()).ToList();
        var r1 = storage.Sweep(2, Time, TimeSpan.Zero, default);
        Assert.Equal(2, r1.Visited); Assert.Equal(2, r1.Deleted); Assert.True(r1.Incomplete);
        var r2 = storage.Sweep(2, Time, TimeSpan.Zero, default);
        Assert.Equal(2, r2.Deleted); Assert.True(r2.Incomplete);
        var r3 = storage.Sweep(2, Time, TimeSpan.Zero, default);
        Assert.Equal(1, r3.Deleted); Assert.False(r3.Incomplete);
        Assert.All(items, i => { Assert.False(Directory.Exists(i.bundle)); Assert.False(File.Exists(i.entry)); });
        Assert.True(File.Exists(Path.Combine(live.bundle, "main.webp")));
    }

    [Fact]
    public void Sweep_stops_on_cancellation_and_deletes_nothing()
    {
        var p = Pending();
        using var cts = new CancellationTokenSource(); cts.Cancel();
        Assert.Throws<OperationCanceledException>(() => storage.Sweep(10, Time, TimeSpan.Zero, cts.Token));
        Assert.True(Directory.Exists(p.bundle));
    }

    [Fact]
    public void Sweep_stops_at_the_time_budget()
    {
        Pending(); Pending();
        var r = storage.Sweep(10, TimeSpan.FromTicks(-1), TimeSpan.Zero, default);
        Assert.Equal(0, r.Visited); Assert.True(r.Incomplete);
    }

    [Fact]
    public async Task Unknown_files_are_preserved_stay_hidden_are_not_retried_within_24h_and_cleanup_finishes_after_the_operator_removes_them()
    {
        var p = Pending();
        var unknown = Path.Combine(p.bundle, "operator-notes.txt");
        File.WriteAllText(unknown, "keep");
        var stuckEntry = Path.Combine(root, LocalImageStorage.StuckDirName, Path.GetFileName(p.entry));
        var r = storage.Sweep(10, Time, TimeSpan.Zero, default);
        Assert.Equal(1, r.Stuck); Assert.Equal(0, r.Deleted);
        Assert.True(File.Exists(unknown));
        Assert.True(File.Exists(Path.Combine(p.bundle, "main.webp")));   // nothing was removed
        Assert.True(File.Exists(Path.Combine(p.bundle, "delete.pending")));
        Assert.True(File.Exists(stuckEntry)); Assert.False(File.Exists(p.entry));
        Assert.Null(await storage.GetAsync(p.key, "main", default));
        Assert.Equal(0, storage.Sweep(10, Time, TimeSpan.Zero, default).Visited);
        Assert.Equal(0, storage.ReviveStuck(10, TimeSpan.FromHours(24), default));   // too recent
        Assert.Equal(1, storage.CountStuck(10));
        storage.UtcNow = () => DateTime.UtcNow.AddHours(25);
        Assert.Equal(1, storage.ReviveStuck(10, TimeSpan.FromHours(24), default));
        Assert.Equal(1, storage.Sweep(10, Time, TimeSpan.Zero, default).Stuck);        // still unknown: back to stuck
        Assert.True(File.Exists(unknown));
        File.Delete(unknown);
        storage.UtcNow = () => DateTime.UtcNow.AddHours(50);
        Assert.Equal(1, storage.ReviveStuck(10, TimeSpan.FromHours(24), default));
        Assert.Equal(1, storage.Sweep(10, Time, TimeSpan.Zero, default).Deleted);
        Assert.False(Directory.Exists(p.bundle)); Assert.Equal(0, storage.CountStuck(10));
    }

    [UnixOnlyFact]
    public void A_symlink_under_a_known_name_is_never_followed_or_deleted_and_the_bundle_goes_stuck()
    {
        var p = Pending();
        var outside = Path.Combine(Path.GetTempPath(), "dm-out-" + Guid.NewGuid().ToString("N"));
        File.WriteAllText(outside, "SECRET");
        try
        {
            File.Delete(Path.Combine(p.bundle, "main.webp"));
            File.CreateSymbolicLink(Path.Combine(p.bundle, "main.webp"), outside);
            Assert.Equal(1, storage.Sweep(10, Time, TimeSpan.Zero, default).Stuck);
            Assert.True(File.Exists(outside));
            Assert.NotNull(new FileInfo(Path.Combine(p.bundle, "main.webp")).LinkTarget);
        }
        finally { File.Delete(outside); }
    }

    [UnixNonPrivilegedFact]
    [System.Runtime.Versioning.UnsupportedOSPlatform("windows")]
    public void A_failing_bundle_is_isolated_backed_off_and_retried_later_while_others_complete()
    {
        var bad = Pending(); var good1 = Pending(); var good2 = Pending();
        File.SetUnixFileMode(bad.bundle, UnixFileMode.None);
        storage.UtcNow = () => DateTime.UtcNow.AddMinutes(10);   // fresh entries are inside their backoff until then
        try
        {
            var r1 = storage.Sweep(10, Time, TimeSpan.FromMinutes(5), default);
            Assert.Equal(1, r1.Failed); Assert.Equal(2, r1.Deleted);
            Assert.False(Directory.Exists(good1.bundle)); Assert.False(Directory.Exists(good2.bundle));
            Assert.True(File.Exists(bad.entry));
            var r2 = storage.Sweep(10, Time, TimeSpan.FromMinutes(5), default);       // inside backoff: not visited
            Assert.Equal(0, r2.Visited);
        }
        finally { File.SetUnixFileMode(bad.bundle, (UnixFileMode)0b111_000_000); }
        storage.UtcNow = () => DateTime.UtcNow.AddMinutes(16);
        var r3 = storage.Sweep(10, Time, TimeSpan.FromMinutes(5), default);
        Assert.Equal(1, r3.Deleted);
        Assert.False(Directory.Exists(bad.bundle));
    }

    [Fact]
    public async Task RemoveAsync_deletes_a_normal_bundle_and_its_index_entry_inline()
    {
        var p = Pending(withIndex: false, withMarker: false);
        await storage.RemoveAsync(p.key, default);
        Assert.False(Directory.Exists(p.bundle));
        Assert.False(File.Exists(p.entry));
    }
}
