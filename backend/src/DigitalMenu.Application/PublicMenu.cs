namespace DigitalMenu.Application;

public sealed record PublicRestaurant(string Name, string Slug, string PrimaryColor, string Currency);
public sealed record PublicItem(Guid Id, string Name, string Description, decimal Price);
public sealed record PublicCategory(Guid Id, string Name, IReadOnlyList<PublicItem> Items);
public sealed record PublicMenu(PublicRestaurant Restaurant, string Language, long PublishedMenuVersion, IReadOnlyList<PublicCategory> Categories);
public interface IPublicMenuReader
{
    Task<PublicMenu?> ReadAsync(string identifier, bool bySlug, string language, CancellationToken ct);
}
public sealed class PublicMenuUnavailableException : Exception
{
    public PublicMenuUnavailableException() : base("Public menu unavailable.") { }
}
