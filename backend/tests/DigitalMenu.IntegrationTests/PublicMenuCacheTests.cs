using DigitalMenu.Application;
using DigitalMenu.Infrastructure.Persistence;

namespace DigitalMenu.IntegrationTests;

// Plain unit coverage for the byte-budgeted projection cache: no database.
public sealed class PublicMenuCacheTests
{
    private static PublicMenu Menu(string name) =>
        new(new PublicRestaurant(name, "slug", "#000000", "EGP", null), "ar", 1, Array.Empty<PublicCategory>());

    [Fact]
    public void Hits_are_exact_and_oversized_entries_are_rejected()
    {
        using var cache = new PublicMenuProjectionCache();
        var id = Guid.NewGuid();
        Assert.False(cache.TryGet(id, "ar", 1, out _));
        // Over the per-entry cap: served by the reader but never stored.
        Assert.False(cache.Set(id, "ar", 1, Menu("huge"), PublicMenuProjectionCache.MaxEntryBytes + 1));
        Assert.False(cache.TryGet(id, "ar", 1, out _));
        Assert.True(cache.Set(id, "ar", 1, Menu("small"), 1024));
        Assert.True(cache.TryGet(id, "ar", 1, out var hit));
        Assert.Equal("small", hit!.Restaurant.Name);
        // Keys are exact: a different language or version never hits.
        Assert.False(cache.TryGet(id, "en", 1, out _));
        Assert.False(cache.TryGet(id, "ar", 2, out _));
    }

    [Fact]
    public async Task The_byte_budget_evicts_under_pressure_instead_of_growing_without_bound()
    {
        using var cache = new PublicMenuProjectionCache();
        // Entries at the per-entry cap; 20 of them weigh 80 MB over a 64 MB budget.
        var each = PublicMenuProjectionCache.MaxEntryBytes;
        for (var i = 0; i < 20; i++)
            Assert.True(cache.Set(Guid.NewGuid(), "ar", 1, Menu("m" + i), each));
        // Over-capacity compaction is asynchronous; give it a bounded window.
        var capacity = (int)(PublicMenuProjectionCache.SizeBudgetBytes / each); // 16
        var deadline = DateTime.UtcNow.AddSeconds(5);
        while (cache.Count > capacity && DateTime.UtcNow < deadline)
            await Task.Delay(50);
        // The weighted byte budget holds: surviving entries fit within it.
        Assert.InRange(cache.Count, 1, capacity);
    }
}
