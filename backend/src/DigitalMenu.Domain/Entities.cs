namespace DigitalMenu.Domain;

public abstract class VersionedEntity
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAtUtc { get; set; } = DateTime.UtcNow;
    public byte[] RowVersion { get; set; } = [];
}

public sealed class Restaurant : VersionedEntity
{
    public string Name { get; set; } = "";
    public string Slug { get; set; } = "";
    public string PublicCode { get; set; } = "";
    public string Status { get; set; } = "Active";
    public bool IsPublished { get; set; }
    public long PublishedMenuVersion { get; set; } = 1;
}

public sealed class RestaurantUser
{
    public Guid RestaurantId { get; set; }
    public Guid UserId { get; set; }
    public string Role { get; set; } = "Owner";
    public bool IsActive { get; set; } = true;
}

public sealed class Category : VersionedEntity
{
    public Guid RestaurantId { get; set; }
    public string NameAr { get; set; } = "";
    public string? NameEn { get; set; }
    public int SortOrder { get; set; }
    public bool IsPublished { get; set; }
    public bool IsDeleted { get; set; }
}

public sealed class MenuItem : VersionedEntity
{
    public Guid RestaurantId { get; set; }
    public Guid CategoryId { get; set; }
    public string NameAr { get; set; } = "";
    public string? NameEn { get; set; }
    public string? DescriptionAr { get; set; }
    public string? DescriptionEn { get; set; }
    public decimal Price { get; set; }
    public string CurrencyCode { get; set; } = "EGP";
    public int SortOrder { get; set; }
    public bool IsPublished { get; set; }
    public bool IsAvailable { get; set; } = true;
    public bool IsDeleted { get; set; }
}

public sealed class MenuItemImage
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid RestaurantId { get; set; }
    public Guid MenuItemId { get; set; }
    public string ObjectKey { get; set; } = "";
    public string? AltAr { get; set; }
    public string? AltEn { get; set; }
    public int SortOrder { get; set; }
    public int Width { get; set; }
    public int Height { get; set; }
    public string ContentType { get; set; } = "image/webp";
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
}

public sealed class RestaurantSettings
{
    public Guid RestaurantId { get; set; }
    public string PrimaryColor { get; set; } = "#0F766E";
    public string? LogoObjectKey { get; set; }
    public string? CoverObjectKey { get; set; }
    public string? ContactPhoneOptional { get; set; }
    public string? AddressOptional { get; set; }
    public int PublishedContactDetailsFlags { get; set; }
    public string DefaultLocale { get; set; } = "ar";
    public string? Description { get; set; }
    public byte[] RowVersion { get; set; } = [];
}

public sealed class AuditEntry
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid? ActorUserId { get; set; }
    public Guid? RestaurantId { get; set; }
    public string Action { get; set; } = "";
    public string ResourceType { get; set; } = "";
    public Guid? ResourceId { get; set; }
    public DateTime TimestampUtc { get; set; } = DateTime.UtcNow;
    public string? CorrelationId { get; set; }
}
