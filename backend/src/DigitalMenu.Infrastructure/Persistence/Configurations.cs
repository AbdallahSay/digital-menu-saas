using DigitalMenu.Domain;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace DigitalMenu.Infrastructure.Persistence;

internal static class Configuration
{
    public static void Versioned<T>(EntityTypeBuilder<T> b) where T : VersionedEntity
    {
        b.HasKey(x => x.Id);
        b.Property(x => x.RowVersion).IsRowVersion();
    }
}

public sealed class RestaurantConfiguration : IEntityTypeConfiguration<Restaurant>
{
    public void Configure(EntityTypeBuilder<Restaurant> b)
    {
        Configuration.Versioned(b);
        b.ToTable("Restaurants", t =>
        {
            t.UseSqlOutputClause(false);
            t.HasCheckConstraint("CK_Restaurant_Status", "[Status] IN ('Active','Suspended')");
            t.HasCheckConstraint("CK_Restaurant_Version", "[PublishedMenuVersion] > 0");
            t.HasCheckConstraint("CK_Restaurant_Slug", "LEN([Slug]) > 0 AND [Slug] COLLATE Latin1_General_100_BIN2 NOT LIKE '%[^a-z0-9-]%'");
        });
        b.Property(x => x.Name).HasMaxLength(150).IsRequired();
        b.Property(x => x.Slug).HasMaxLength(100).IsRequired();
        b.Property(x => x.PublicCode).HasMaxLength(20).IsRequired();
        b.Property(x => x.Status).HasMaxLength(16).IsRequired();
        b.HasIndex(x => x.Slug).IsUnique();
        b.HasIndex(x => x.PublicCode).IsUnique();
        b.Property(x => x.PublicCode).Metadata.SetAfterSaveBehavior(Microsoft.EntityFrameworkCore.Metadata.PropertySaveBehavior.Throw);
    }
}

public sealed class MembershipConfiguration : IEntityTypeConfiguration<RestaurantUser>
{
    public void Configure(EntityTypeBuilder<RestaurantUser> b)
    {
        b.ToTable("RestaurantUsers", t => { t.UseSqlOutputClause(false); t.HasCheckConstraint("CK_Membership_Role", "[Role] = 'Owner'"); });
        b.HasKey(x => new { x.RestaurantId, x.UserId });
        b.Property(x => x.Role).HasMaxLength(16);
        b.HasOne<Restaurant>().WithMany().HasForeignKey(x => x.RestaurantId);
        b.HasOne<ApplicationUser>().WithMany().HasForeignKey(x => x.UserId);
        b.HasIndex(x => new { x.UserId, x.IsActive });
    }
}

public sealed class CategoryConfiguration : IEntityTypeConfiguration<Category>
{
    public void Configure(EntityTypeBuilder<Category> b)
    {
        Configuration.Versioned(b);
        b.ToTable("Categories", t => { t.UseSqlOutputClause(false); t.HasCheckConstraint("CK_Category_Sort", "[SortOrder] >= 0"); });
        b.HasAlternateKey(x => new { x.RestaurantId, x.Id });
        b.HasOne<Restaurant>().WithMany().HasForeignKey(x => x.RestaurantId);
        b.Property(x => x.NameAr).HasMaxLength(120).IsRequired();
        b.Property(x => x.NameEn).HasMaxLength(120);
        b.HasIndex(x => new { x.RestaurantId, x.IsDeleted, x.IsPublished, x.SortOrder });
    }
}

public sealed class ItemConfiguration : IEntityTypeConfiguration<MenuItem>
{
    public void Configure(EntityTypeBuilder<MenuItem> b)
    {
        Configuration.Versioned(b);
        b.ToTable("MenuItems", t =>
        {
            t.UseSqlOutputClause(false);
            t.HasCheckConstraint("CK_Item_Price", "[Price] >= 0");
            t.HasCheckConstraint("CK_Item_Sort", "[SortOrder] >= 0");
            t.HasCheckConstraint("CK_Item_Currency", "[CurrencyCode] = 'EGP'");
        });
        b.HasAlternateKey(x => new { x.RestaurantId, x.Id });
        b.HasOne<Restaurant>().WithMany().HasForeignKey(x => x.RestaurantId);
        b.HasOne<Category>().WithMany().HasForeignKey(x => new { x.RestaurantId, x.CategoryId })
            .HasPrincipalKey(x => new { x.RestaurantId, x.Id });
        b.Property(x => x.NameAr).HasMaxLength(150).IsRequired();
        b.Property(x => x.NameEn).HasMaxLength(150);
        b.Property(x => x.DescriptionAr).HasMaxLength(2000);
        b.Property(x => x.DescriptionEn).HasMaxLength(2000);
        b.Property(x => x.Price).HasPrecision(18, 2);
        b.Property(x => x.CurrencyCode).HasColumnType("char(3)").HasDefaultValue("EGP");
        b.HasIndex(x => new { x.RestaurantId, x.CategoryId, x.IsDeleted, x.IsPublished, x.IsAvailable, x.SortOrder });
    }
}

public sealed class ImageConfiguration : IEntityTypeConfiguration<MenuItemImage>
{
    public void Configure(EntityTypeBuilder<MenuItemImage> b)
    {
        b.ToTable("MenuItemImages", t =>
        {
            t.UseSqlOutputClause(false);
            t.HasCheckConstraint("CK_Image_Dimensions", "[Width] > 0 AND [Height] > 0 AND [SortOrder] >= 0");
            t.HasCheckConstraint("CK_Image_Type", "[ContentType] IN ('image/jpeg','image/png','image/webp')");
            t.HasCheckConstraint("CK_Image_Key", "LEFT([ObjectKey],37) = CONVERT(nvarchar(36),[RestaurantId]) + '/' AND LEN([ObjectKey]) > 37 AND [ObjectKey] NOT LIKE '%..%' AND [ObjectKey] NOT LIKE '%\\%'");
        });
        b.HasKey(x => x.Id);
        b.HasAlternateKey(x => new { x.RestaurantId, x.Id });
        b.HasOne<MenuItem>().WithMany().HasForeignKey(x => new { x.RestaurantId, x.MenuItemId })
            .HasPrincipalKey(x => new { x.RestaurantId, x.Id });
        b.Property(x => x.ObjectKey).HasMaxLength(300).IsRequired();
        b.Property(x => x.ObjectKey).Metadata.SetAfterSaveBehavior(Microsoft.EntityFrameworkCore.Metadata.PropertySaveBehavior.Throw);
        b.HasIndex(x => x.ObjectKey).IsUnique();
        b.Property(x => x.AltAr).HasMaxLength(300);
        b.Property(x => x.AltEn).HasMaxLength(300);
        b.Property(x => x.ContentType).HasMaxLength(32);
        b.HasIndex(x => new { x.RestaurantId, x.MenuItemId, x.SortOrder });
    }
}

public sealed class SettingsConfiguration : IEntityTypeConfiguration<RestaurantSettings>
{
    public void Configure(EntityTypeBuilder<RestaurantSettings> b)
    {
        b.ToTable("RestaurantSettings", t =>
        {
            t.UseSqlOutputClause(false);
            t.HasCheckConstraint("CK_Settings_Locale", "[DefaultLocale] IN ('ar','en')");
            t.HasCheckConstraint("CK_Settings_Color", "LEN([PrimaryColor]) = 7 AND LEFT([PrimaryColor],1) = '#' AND SUBSTRING([PrimaryColor],2,6) COLLATE Latin1_General_100_BIN2 NOT LIKE '%[^0-9A-Fa-f]%'");
            t.HasCheckConstraint("CK_Settings_Contacts", "[PublishedContactDetailsFlags] BETWEEN 0 AND 3");
        });
        b.HasKey(x => x.RestaurantId);
        b.HasOne<Restaurant>().WithOne().HasForeignKey<RestaurantSettings>(x => x.RestaurantId);
        b.Property(x => x.PrimaryColor).HasMaxLength(7);
        b.Property(x => x.LogoObjectKey).HasMaxLength(300);
        b.Property(x => x.CoverObjectKey).HasMaxLength(300);
        b.Property(x => x.ContactPhoneOptional).HasMaxLength(32);
        b.Property(x => x.AddressOptional).HasMaxLength(500);
        b.Property(x => x.Description).HasMaxLength(2000);
        b.Property(x => x.DefaultLocale).HasMaxLength(2);
        b.Property(x => x.RowVersion).IsRowVersion();
    }
}

public sealed class AuditConfiguration : IEntityTypeConfiguration<AuditEntry>
{
    public void Configure(EntityTypeBuilder<AuditEntry> b)
    {
        b.ToTable("AuditEntries", t => t.UseSqlOutputClause(false));
        b.HasKey(x => x.Id);
        b.HasOne<Restaurant>().WithMany().HasForeignKey(x => x.RestaurantId);
        b.HasOne<ApplicationUser>().WithMany().HasForeignKey(x => x.ActorUserId);
        b.Property(x => x.Action).HasMaxLength(100);
        b.Property(x => x.ResourceType).HasMaxLength(100);
        b.Property(x => x.CorrelationId).HasMaxLength(100);
        b.HasIndex(x => new { x.RestaurantId, x.TimestampUtc });
    }
}
