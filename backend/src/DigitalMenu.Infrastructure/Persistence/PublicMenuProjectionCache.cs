using DigitalMenu.Application;
using Microsoft.Extensions.Caching.Memory;

namespace DigitalMenu.Infrastructure.Persistence;

// Dedicated projection cache with a deliberate byte budget; the app's shared
// IMemoryCache is untouched, so menu projections can never pressure unrelated
// cache entries (and vice versa). Entries are weighted by their serialized
// size and capped individually: an oversized projection is served without
// caching rather than silently consuming the worker's memory budget.
public sealed class PublicMenuProjectionCache : IDisposable
{
    public const long SizeBudgetBytes = 64L * 1024 * 1024;
    public const long MaxEntryBytes = 4L * 1024 * 1024;
    private static readonly TimeSpan Backstop = TimeSpan.FromSeconds(60);
    private readonly MemoryCache cache = new(new MemoryCacheOptions { SizeLimit = SizeBudgetBytes });

    public bool TryGet(Guid restaurantId, string language, long version, out PublicMenu? menu) =>
        cache.TryGetValue((restaurantId, language, version), out menu) && menu is not null;

    public bool Set(Guid restaurantId, string language, long version, PublicMenu menu, long estimatedBytes)
    {
        if (estimatedBytes > MaxEntryBytes) return false;
        cache.Set((restaurantId, language, version), menu,
            new MemoryCacheEntryOptions { AbsoluteExpirationRelativeToNow = Backstop, Size = estimatedBytes });
        return true;
    }

    public int Count => cache.Count;

    public void Dispose() => cache.Dispose();
}
