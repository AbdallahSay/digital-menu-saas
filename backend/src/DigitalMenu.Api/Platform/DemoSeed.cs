using System.ComponentModel.DataAnnotations;
using System.Text.RegularExpressions;
using DigitalMenu.Domain;
using DigitalMenu.Infrastructure.Persistence;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;

namespace DigitalMenu.Api.Platform;

/// <summary>
/// Optional demo seed (DemoSeed:Enabled): one owner account and one published
/// restaurant with a small menu, created once so a fresh deployment is
/// immediately browsable. Idempotent: an existing slug or user skips the seed
/// entirely, and the seed never updates or deletes existing rows. The owner
/// password comes only from configuration (DemoSeed:OwnerPassword) and is
/// never logged; the operator signs in once and rotates it, then disables the
/// seed. This does NOT widen the production onboarding boundary: the public
/// signup endpoint still requires a configured delivery (Provisioning).
/// </summary>
public static partial class DemoSeed
{
    public static async Task RunAsync(IServiceProvider services, IConfiguration configuration)
    {
        if (!configuration.GetValue<bool>("DemoSeed:Enabled")) return;
        var email = configuration["DemoSeed:OwnerEmail"]?.Trim();
        var password = configuration["DemoSeed:OwnerPassword"];
        var slug = configuration["DemoSeed:Slug"]?.Trim().ToLowerInvariant() ?? "demo-restaurant";
        var restaurantName = configuration["DemoSeed:RestaurantName"]?.Trim();
        if (string.IsNullOrWhiteSpace(email) || email.Length > 256 || !new EmailAddressAttribute().IsValid(email) ||
            string.IsNullOrEmpty(password) || password.Length < 12 ||
            string.IsNullOrEmpty(slug) || slug.Length > 100 || !SlugPattern().IsMatch(slug) ||
            string.IsNullOrWhiteSpace(restaurantName) || restaurantName.Length > 150 || restaurantName.Any(char.IsControl))
            throw new InvalidOperationException(
                "DemoSeed requires a valid DemoSeed:OwnerEmail, a DemoSeed:OwnerPassword of 12+ characters, a valid DemoSeed:Slug and DemoSeed:RestaurantName.");
        using var scope = services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<MenuDbContext>();
        var users = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
        // Idempotence: a seeded (or real) tenant with this slug or email is never touched.
        if (await db.Set<Restaurant>().AnyAsync(r => r.Slug == slug) || await users.FindByEmailAsync(email) is not null)
            return;
        await using var transaction = await db.Database.BeginTransactionAsync(System.Data.IsolationLevel.Serializable);
        var owner = new ApplicationUser { Id = Guid.NewGuid(), UserName = email, Email = email };
        Ensure(await users.CreateAsync(owner, password));
        var restaurant = new Restaurant { Name = restaurantName, Slug = slug, PublicCode = Provisioning.NewPublicCode(), IsPublished = true };
        var drinks = new Category { RestaurantId = restaurant.Id, NameAr = "مشروبات", NameEn = "Drinks", SortOrder = 0, IsPublished = true };
        var mains = new Category { RestaurantId = restaurant.Id, NameAr = "أطباق رئيسية", NameEn = "Main dishes", SortOrder = 1, IsPublished = true };
        db.AddRange(restaurant, new RestaurantUser { RestaurantId = restaurant.Id, UserId = owner.Id },
            new RestaurantSettings { RestaurantId = restaurant.Id }, drinks, mains,
            new MenuItem { RestaurantId = restaurant.Id, CategoryId = drinks.Id, NameAr = "قهوة تركية", NameEn = "Turkish coffee", Price = 25, SortOrder = 0, IsPublished = true },
            new MenuItem { RestaurantId = restaurant.Id, CategoryId = drinks.Id, NameAr = "عصير مانجو طازج", NameEn = "Fresh mango juice", Price = 35, SortOrder = 1, IsPublished = true },
            new MenuItem { RestaurantId = restaurant.Id, CategoryId = mains.Id, NameAr = "كشري", NameEn = "Koshari", DescriptionAr = "كشري مصري تقليدي", DescriptionEn = "Traditional Egyptian koshari", Price = 55, SortOrder = 0, IsPublished = true },
            new MenuItem { RestaurantId = restaurant.Id, CategoryId = mains.Id, NameAr = "شاورما فراخ", NameEn = "Chicken shawarma", Price = 75, SortOrder = 1, IsPublished = true });
        await db.SaveChangesAsync();
        await transaction.CommitAsync();
    }

    private static void Ensure(IdentityResult result)
    {
        if (!result.Succeeded) throw new InvalidOperationException("Demo seed validation failed; nothing was committed.");
    }

    [GeneratedRegex("^[a-z0-9]+(?:-[a-z0-9]+)*$")]
    private static partial Regex SlugPattern();
}
