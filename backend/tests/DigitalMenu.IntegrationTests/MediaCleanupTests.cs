using DigitalMenu.Api.Media;
using Microsoft.Extensions.Configuration;
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
    private readonly List<string> unreadable = new();
    private static readonly TimeSpan Time = TimeSpan.FromSeconds(30);
    private static readonly TimeSpan Day = TimeSpan.FromHours(24);
    public MediaCleanupTests() { storage = new LocalImageStorage(root, NullLogger<LocalImageStorage>.Instance); }
    public void Dispose()
    {
        storage.Dispose();
        if (!OperatingSystem.IsWindows())
            foreach (var d in unreadable) try { File.SetUnixFileMode(d, (UnixFileMode)0b111_000_000); } catch (IOException) { }
        if (Directory.Exists(root)) Directory.Delete(root, true);
    }

    // The budget splits 60/20/20 between pending, stuck and legacy: budget 5 gives 3, 1, 1 examined entries per pass.
    private LocalImageStorage.MaintenanceResult Pass(int budget = 500, TimeSpan? backoff = null, TimeSpan? revive = null, TimeSpan? legacy = null, CancellationToken ct = default) =>
        storage.RunPass(budget, Time, backoff ?? TimeSpan.Zero, revive ?? TimeSpan.Zero, legacy ?? TimeSpan.Zero, ct);
    private int Until(Func<bool> done, int max, Action<LocalImageStorage.MaintenanceResult>? each = null, Func<LocalImageStorage.MaintenanceResult>? pass = null)
    {
        var n = 0;
        while (n < max && !done()) { var r = (pass ?? (() => Pass(5)))(); each?.Invoke(r); n++; }
        return n;
    }
    [System.Runtime.Versioning.UnsupportedOSPlatform("windows")]
    private void Unreadable(string dir) { File.SetUnixFileMode(dir, UnixFileMode.None); unreadable.Add(dir); }
    [System.Runtime.Versioning.UnsupportedOSPlatform("windows")]
    private static void Readable(string dir) => File.SetUnixFileMode(dir, (UnixFileMode)0b111_000_000);

    // A bundle already marked for deletion, as RemoveAsync leaves it when the first attempt did not finish.
    private (string key, string bundle, string entry, string tenant, string id) Pending(bool withIndex = true, bool withMarker = true, string? tenant = null)
    {
        tenant ??= Guid.NewGuid().ToString("D"); var id = Guid.NewGuid().ToString("N");
        var bundle = Path.Combine(root, tenant, id);
        Directory.CreateDirectory(bundle);
        File.WriteAllBytes(Path.Combine(bundle, "main.webp"), new byte[] { 1 });
        File.WriteAllBytes(Path.Combine(bundle, "thumbnail.webp"), new byte[] { 2 });
        if (withMarker) File.WriteAllText(Path.Combine(bundle, "delete.pending"), "");
        var entry = Path.Combine(root, LocalImageStorage.PendingDirName, tenant + "_" + id);
        if (withIndex) { Directory.CreateDirectory(Path.GetDirectoryName(entry)!); File.WriteAllText(entry, ""); }
        return (tenant + "/" + id + ".webp", bundle, entry, tenant, id);
    }

    [Fact]
    public async Task Reads_never_scan_or_delete_other_bundles_and_hide_marked_or_indexed_bundles()
    {
        var other = Pending(); var markerOnly = Pending(withIndex: false); var indexOnly = Pending(withMarker: false);
        var live = Guid.NewGuid().ToString("D") + "/" + Guid.NewGuid().ToString("N") + ".webp";
        Assert.Null(await storage.GetAsync(live, "main", default));
        Assert.Null(await storage.GetAsync(markerOnly.key, "main", default));
        Assert.Null(await storage.GetAsync(indexOnly.key, "main", default));
        Assert.True(Directory.Exists(other.bundle));
        Assert.True(File.Exists(Path.Combine(markerOnly.bundle, "main.webp")));
        Assert.True(File.Exists(Path.Combine(indexOnly.bundle, "main.webp")));
    }

    [Fact]
    public async Task RemoveAsync_deletes_a_normal_bundle_and_its_index_entry_inline()
    {
        var p = Pending(withIndex: false, withMarker: false);
        await storage.RemoveAsync(p.key, default);
        Assert.False(Directory.Exists(p.bundle)); Assert.False(File.Exists(p.entry));
    }

    [Fact]
    public void A_pass_respects_the_examine_budget_resumes_forward_and_never_touches_live_bundles()
    {
        var live = Pending(withIndex: false, withMarker: false);
        var items = Enumerable.Range(0, 7).Select(_ => Pending()).ToList();
        var max = 0;
        var passes = Until(() => items.All(i => !Directory.Exists(i.bundle)), 12, r => max = Math.Max(max, r.Deleted));
        Assert.All(items, i => Assert.False(File.Exists(i.entry)));
        Assert.True(max <= 3, "pending slice for budget 5 is 3");
        Assert.True(passes >= 3 && passes <= 12);
        Assert.True(File.Exists(Path.Combine(live.bundle, "main.webp")));
    }

    [Fact]
    public void Cancellation_stops_the_pass_deletes_nothing_and_a_later_pass_works()
    {
        var p = Pending();
        using var cts = new CancellationTokenSource(); cts.Cancel();
        Assert.Throws<OperationCanceledException>(() => Pass(ct: cts.Token));
        Assert.True(Directory.Exists(p.bundle));
        Assert.Equal(1, Pass().Deleted);
    }

    [Fact]
    public void An_exhausted_time_budget_examines_nothing_and_reports_truncated()
    {
        Pending(); Pending();
        var r = storage.RunPass(10, TimeSpan.FromTicks(-1), TimeSpan.Zero, TimeSpan.Zero, TimeSpan.Zero, default);
        Assert.Equal(0, r.Examined); Assert.True(r.Truncated);
    }

    [Fact]
    public async Task Unknown_files_are_preserved_stay_hidden_wait_24h_and_cleanup_finishes_after_the_operator_removes_them()
    {
        var p = Pending();
        var unknown = Path.Combine(p.bundle, "operator-notes.txt"); File.WriteAllText(unknown, "keep");
        var stuckEntry = Path.Combine(root, LocalImageStorage.StuckDirName, Path.GetFileName(p.entry));
        Assert.Equal(1, Pass(revive: Day).Stuck);
        Assert.True(File.Exists(unknown)); Assert.True(File.Exists(Path.Combine(p.bundle, "main.webp")));
        Assert.True(File.Exists(Path.Combine(p.bundle, "delete.pending")));
        Assert.True(File.Exists(stuckEntry)); Assert.False(File.Exists(p.entry));
        Assert.Null(await storage.GetAsync(p.key, "main", default));
        var revived = 0; Until(() => false, 4, r => revived += r.Revived, () => Pass(revive: Day));
        Assert.Equal(0, revived);                                            // too recent
        storage.UtcNow = () => DateTime.UtcNow.AddHours(25);
        var again = 0; Until(() => again > 0, 4, r => again += r.Stuck, () => Pass(revive: Day));
        Assert.True(again >= 1);                                             // revived, still unknown, back to stuck
        Assert.True(File.Exists(unknown));
        File.Delete(unknown);
        storage.UtcNow = () => DateTime.UtcNow.AddHours(50);
        Until(() => !Directory.Exists(p.bundle), 6, null, () => Pass(revive: Day));
        Assert.False(Directory.Exists(p.bundle)); Assert.Equal(0, storage.CountStuck(10));
    }

    [UnixOnlyFact]
    public void A_symlink_under_a_known_name_is_never_followed_or_deleted_and_the_bundle_goes_stuck()
    {
        var p = Pending();
        var outside = Path.Combine(Path.GetTempPath(), "dm-out-" + Guid.NewGuid().ToString("N")); File.WriteAllText(outside, "SECRET");
        try
        {
            File.Delete(Path.Combine(p.bundle, "main.webp"));
            File.CreateSymbolicLink(Path.Combine(p.bundle, "main.webp"), outside);
            Assert.Equal(1, Pass().Stuck);
            Assert.Equal("SECRET", File.ReadAllText(outside));
            Assert.NotNull(new FileInfo(Path.Combine(p.bundle, "main.webp")).LinkTarget);
        }
        finally { File.Delete(outside); }
    }

    [UnixNonPrivilegedFact]
    [System.Runtime.Versioning.UnsupportedOSPlatform("windows")]
    public void A_failing_prefix_larger_than_the_budget_does_not_starve_later_entries_and_failures_are_retried()
    {
        var bad = Enumerable.Range(0, 6).Select(_ => Pending()).ToList(); var good = Enumerable.Range(0, 2).Select(_ => Pending()).ToList();
        foreach (var b in bad) Unreadable(b.bundle);
        storage.UtcNow = () => DateTime.UtcNow.AddMinutes(10);               // fresh entries are inside their backoff until then
        var failed = 0;
        Until(() => good.All(g => !Directory.Exists(g.bundle)), 3, r => failed += r.Failed, () => Pass(5, backoff: TimeSpan.FromMinutes(5)));
        Assert.All(good, g => Assert.False(Directory.Exists(g.bundle)));     // reached within ceil(8/3) passes whatever the OS order
        Assert.True(failed >= 1);
        Assert.All(bad, b => Assert.True(File.Exists(b.entry)));
        foreach (var b in bad) Readable(b.bundle);
        storage.UtcNow = () => DateTime.UtcNow.AddMinutes(20);
        Until(() => bad.All(b => !Directory.Exists(b.bundle)), 6, null, () => Pass(5, backoff: TimeSpan.FromMinutes(5)));
        Assert.All(bad, b => Assert.False(Directory.Exists(b.bundle)));
    }

    [Fact]
    public void A_young_stuck_prefix_larger_than_the_budget_does_not_starve_an_old_stuck_entry()
    {
        var dir = Path.Combine(root, LocalImageStorage.StuckDirName); Directory.CreateDirectory(dir);
        string Name() => Guid.NewGuid().ToString("D") + "_" + Guid.NewGuid().ToString("N");
        for (var i = 0; i < 5; i++) File.WriteAllText(Path.Combine(dir, Name()), "");
        var old = Path.Combine(dir, Name()); File.WriteAllText(old, ""); File.SetLastWriteTimeUtc(old, DateTime.UtcNow.AddHours(-30));
        var revived = 0;
        Until(() => revived > 0, 8, r => revived += r.Revived, () => Pass(5, revive: Day));   // stuck slice for budget 5 is 1 entry per pass
        Assert.Equal(1, revived);
    }

    [Fact]
    public void Legacy_marker_only_bundles_are_adopted_then_swept_live_bundles_untouched_and_the_walk_repeats_later()
    {
        var live = Pending(withIndex: false, withMarker: false);
        var legacy = Enumerable.Range(0, 3).Select(_ => Pending(withIndex: false)).ToList();
        var adopted = 0;
        Until(() => legacy.All(l => !Directory.Exists(l.bundle)), 20, r => adopted += r.Adopted, () => Pass(5, legacy: TimeSpan.FromHours(1)));
        Assert.Equal(3, adopted);
        Assert.All(legacy, l => Assert.False(Directory.Exists(l.bundle)));
        Assert.True(File.Exists(Path.Combine(live.bundle, "main.webp")));
        // A marker written later by an older build is not adopted before legacyEvery has passed, and is adopted after.
        var late = Pending(withIndex: false);
        var early = 0; Until(() => false, 5, r => early += r.Adopted, () => Pass(5, legacy: TimeSpan.FromHours(1)));
        Assert.Equal(0, early); Assert.True(Directory.Exists(late.bundle));
        storage.UtcNow = () => DateTime.UtcNow.AddHours(2);
        Until(() => !Directory.Exists(late.bundle), 20, null, () => Pass(5, legacy: TimeSpan.FromHours(1)));
        Assert.False(Directory.Exists(late.bundle));
    }

    [UnixNonPrivilegedFact]
    [System.Runtime.Versioning.UnsupportedOSPlatform("windows")]
    public void An_unreadable_tenant_is_reported_and_retried_on_the_next_traversal_not_skipped_for_good()
    {
        var tenant = Guid.NewGuid().ToString("D");
        var hidden = Pending(withIndex: false, tenant: tenant); var other = Pending(withIndex: false);
        Unreadable(Path.Combine(root, tenant));
        var failed = 0;
        Until(() => false, 8, r => failed += r.Failed, () => Pass(5, legacy: TimeSpan.FromHours(1)));   // enough passes for one complete traversal
        Assert.False(Directory.Exists(other.bundle));
        Assert.True(failed >= 1);
        Readable(Path.Combine(root, tenant));
        storage.UtcNow = () => DateTime.UtcNow.AddHours(2);
        var log = new List<string>();
        Until(() => !Directory.Exists(hidden.bundle), 20, r => log.Add(r.ToString()), () => Pass(5, legacy: TimeSpan.FromHours(1)));
        Assert.False(Directory.Exists(hidden.bundle), string.Join("\n", log.Take(6)) + "\nentry:" + Directory.EnumerateFiles(Path.Combine(root, LocalImageStorage.PendingDirName)).Count());
    }

    [UnixOnlyFact]
    public void Linked_index_entries_and_markers_are_reported_and_never_touched_or_followed()
    {
        var outside = Path.Combine(Path.GetTempPath(), "dm-out-" + Guid.NewGuid().ToString("N")); File.WriteAllText(outside, "SECRET");
        var stamp = new DateTime(2020, 1, 1, 0, 0, 0, DateTimeKind.Utc); File.SetLastWriteTimeUtc(outside, stamp);
        try
        {
            var pendingDir = Path.Combine(root, LocalImageStorage.PendingDirName); var stuckDir = Path.Combine(root, LocalImageStorage.StuckDirName);
            Directory.CreateDirectory(pendingDir); Directory.CreateDirectory(stuckDir);
            string Name() => Guid.NewGuid().ToString("D") + "_" + Guid.NewGuid().ToString("N");
            var pl = Path.Combine(pendingDir, Name()); File.CreateSymbolicLink(pl, outside);
            var sl = Path.Combine(stuckDir, Name()); File.CreateSymbolicLink(sl, outside);
            var legacy = Pending(withIndex: false); File.Delete(Path.Combine(legacy.bundle, "delete.pending"));
            File.CreateSymbolicLink(Path.Combine(legacy.bundle, "delete.pending"), outside);
            var anomalies = 0; Until(() => false, 6, r => anomalies += r.Anomalies, () => Pass(5, revive: TimeSpan.Zero));
            Assert.True(anomalies >= 3);
            Assert.Equal("SECRET", File.ReadAllText(outside)); Assert.Equal(stamp, File.GetLastWriteTimeUtc(outside));
            Assert.NotNull(new FileInfo(pl).LinkTarget); Assert.NotNull(new FileInfo(sl).LinkTarget);
            Assert.False(File.Exists(Path.Combine(pendingDir, Path.GetFileName(sl))));   // the stuck link was not moved to pending
            Assert.True(Directory.Exists(legacy.bundle));
        }
        finally { File.Delete(outside); }
    }

    [UnixOnlyFact]
    public void A_symlinked_index_directory_is_refused()
    {
        var real = Path.Combine(Path.GetTempPath(), "dm-real-" + Guid.NewGuid().ToString("N")); Directory.CreateDirectory(real);
        try
        {
            Directory.CreateSymbolicLink(Path.Combine(root, LocalImageStorage.StuckDirName), real);
            Assert.Throws<IOException>(() => storage.CountStuck(10));
            Assert.True(Pass().Anomalies >= 1);
        }
        finally { File.Delete(Path.Combine(root, LocalImageStorage.StuckDirName)); Directory.Delete(real, true); }
    }

    [Fact]
    public async Task A_second_concurrent_pass_is_excluded_while_one_is_running()
    {
        Pending();
        using var entered = new ManualResetEventSlim(); using var release = new ManualResetEventSlim();
        storage.OnExaminedForTests = () => { entered.Set(); release.Wait(TimeSpan.FromSeconds(10)); };
        var first = Task.Run(() => Pass());
        Assert.True(entered.Wait(TimeSpan.FromSeconds(10)));
        var second = Pass();
        release.Set();
        Assert.True(second.Skipped); Assert.Equal(0, second.Examined);
        Assert.False((await first).Skipped);
        storage.OnExaminedForTests = null;
    }

    [Fact]
    public async Task The_worker_cleans_pending_bundles_while_running_and_stops_cleanly()
    {
        var before = Pending();
        var cfg = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?> { ["Media:CleanupIntervalSeconds"] = "1" }).Build();
        var worker = new MediaCleanupWorker(storage, cfg, NullLogger<MediaCleanupWorker>.Instance);
        await worker.StartAsync(default);
        for (var i = 0; i < 100 && Directory.Exists(before.bundle); i++) await Task.Delay(100);
        Assert.False(Directory.Exists(before.bundle));
        var stop = worker.StopAsync(default);
        Assert.Same(stop, await Task.WhenAny(stop, Task.Delay(TimeSpan.FromSeconds(5))));
        var after = Pending();
        await Task.Delay(2500);
        Assert.True(Directory.Exists(after.bundle));                          // no pass runs after stop
        worker.Dispose();
    }
}
