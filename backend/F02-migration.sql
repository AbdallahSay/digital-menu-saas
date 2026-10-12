IF OBJECT_ID(N'[__EFMigrationsHistory]') IS NULL
BEGIN
    CREATE TABLE [__EFMigrationsHistory] (
        [MigrationId] nvarchar(150) NOT NULL,
        [ProductVersion] nvarchar(32) NOT NULL,
        CONSTRAINT [PK___EFMigrationsHistory] PRIMARY KEY ([MigrationId])
    );
END;
GO

BEGIN TRANSACTION;
IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261012030220_InitialTenantModel'
)
BEGIN
    CREATE TABLE [AspNetRoles] (
        [Id] uniqueidentifier NOT NULL,
        [Name] nvarchar(256) NULL,
        [NormalizedName] nvarchar(256) NULL,
        [ConcurrencyStamp] nvarchar(max) NULL,
        CONSTRAINT [PK_AspNetRoles] PRIMARY KEY ([Id])
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261012030220_InitialTenantModel'
)
BEGIN
    CREATE TABLE [AspNetUsers] (
        [Id] uniqueidentifier NOT NULL,
        [UserName] nvarchar(256) NULL,
        [NormalizedUserName] nvarchar(256) NULL,
        [Email] nvarchar(256) NULL,
        [NormalizedEmail] nvarchar(256) NULL,
        [EmailConfirmed] bit NOT NULL,
        [PasswordHash] nvarchar(max) NULL,
        [SecurityStamp] nvarchar(max) NULL,
        [ConcurrencyStamp] nvarchar(max) NULL,
        [PhoneNumber] nvarchar(max) NULL,
        [PhoneNumberConfirmed] bit NOT NULL,
        [TwoFactorEnabled] bit NOT NULL,
        [LockoutEnd] datetimeoffset NULL,
        [LockoutEnabled] bit NOT NULL,
        [AccessFailedCount] int NOT NULL,
        CONSTRAINT [PK_AspNetUsers] PRIMARY KEY ([Id])
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261012030220_InitialTenantModel'
)
BEGIN
    CREATE TABLE [Restaurants] (
        [Id] uniqueidentifier NOT NULL,
        [Name] nvarchar(150) NOT NULL,
        [Slug] nvarchar(100) NOT NULL,
        [PublicCode] nvarchar(20) NOT NULL,
        [Status] nvarchar(16) NOT NULL,
        [IsPublished] bit NOT NULL,
        [PublishedMenuVersion] bigint NOT NULL,
        [CreatedAtUtc] datetime2 NOT NULL,
        [UpdatedAtUtc] datetime2 NOT NULL,
        [RowVersion] rowversion NOT NULL,
        CONSTRAINT [PK_Restaurants] PRIMARY KEY ([Id]),
        CONSTRAINT [CK_Restaurant_Slug] CHECK (LEN([Slug]) > 0 AND [Slug] COLLATE Latin1_General_100_BIN2 NOT LIKE '%[^a-z0-9-]%'),
        CONSTRAINT [CK_Restaurant_Status] CHECK ([Status] IN ('Active','Suspended')),
        CONSTRAINT [CK_Restaurant_Version] CHECK ([PublishedMenuVersion] > 0)
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261012030220_InitialTenantModel'
)
BEGIN
    CREATE TABLE [AspNetRoleClaims] (
        [Id] int NOT NULL IDENTITY,
        [RoleId] uniqueidentifier NOT NULL,
        [ClaimType] nvarchar(max) NULL,
        [ClaimValue] nvarchar(max) NULL,
        CONSTRAINT [PK_AspNetRoleClaims] PRIMARY KEY ([Id]),
        CONSTRAINT [FK_AspNetRoleClaims_AspNetRoles_RoleId] FOREIGN KEY ([RoleId]) REFERENCES [AspNetRoles] ([Id])
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261012030220_InitialTenantModel'
)
BEGIN
    CREATE TABLE [AspNetUserClaims] (
        [Id] int NOT NULL IDENTITY,
        [UserId] uniqueidentifier NOT NULL,
        [ClaimType] nvarchar(max) NULL,
        [ClaimValue] nvarchar(max) NULL,
        CONSTRAINT [PK_AspNetUserClaims] PRIMARY KEY ([Id]),
        CONSTRAINT [FK_AspNetUserClaims_AspNetUsers_UserId] FOREIGN KEY ([UserId]) REFERENCES [AspNetUsers] ([Id])
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261012030220_InitialTenantModel'
)
BEGIN
    CREATE TABLE [AspNetUserLogins] (
        [LoginProvider] nvarchar(450) NOT NULL,
        [ProviderKey] nvarchar(450) NOT NULL,
        [ProviderDisplayName] nvarchar(max) NULL,
        [UserId] uniqueidentifier NOT NULL,
        CONSTRAINT [PK_AspNetUserLogins] PRIMARY KEY ([LoginProvider], [ProviderKey]),
        CONSTRAINT [FK_AspNetUserLogins_AspNetUsers_UserId] FOREIGN KEY ([UserId]) REFERENCES [AspNetUsers] ([Id])
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261012030220_InitialTenantModel'
)
BEGIN
    CREATE TABLE [AspNetUserRoles] (
        [UserId] uniqueidentifier NOT NULL,
        [RoleId] uniqueidentifier NOT NULL,
        CONSTRAINT [PK_AspNetUserRoles] PRIMARY KEY ([UserId], [RoleId]),
        CONSTRAINT [FK_AspNetUserRoles_AspNetRoles_RoleId] FOREIGN KEY ([RoleId]) REFERENCES [AspNetRoles] ([Id]),
        CONSTRAINT [FK_AspNetUserRoles_AspNetUsers_UserId] FOREIGN KEY ([UserId]) REFERENCES [AspNetUsers] ([Id])
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261012030220_InitialTenantModel'
)
BEGIN
    CREATE TABLE [AspNetUserTokens] (
        [UserId] uniqueidentifier NOT NULL,
        [LoginProvider] nvarchar(450) NOT NULL,
        [Name] nvarchar(450) NOT NULL,
        [Value] nvarchar(max) NULL,
        CONSTRAINT [PK_AspNetUserTokens] PRIMARY KEY ([UserId], [LoginProvider], [Name]),
        CONSTRAINT [FK_AspNetUserTokens_AspNetUsers_UserId] FOREIGN KEY ([UserId]) REFERENCES [AspNetUsers] ([Id])
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261012030220_InitialTenantModel'
)
BEGIN
    CREATE TABLE [AuditEntries] (
        [Id] uniqueidentifier NOT NULL,
        [ActorUserId] uniqueidentifier NULL,
        [RestaurantId] uniqueidentifier NULL,
        [Action] nvarchar(100) NOT NULL,
        [ResourceType] nvarchar(100) NOT NULL,
        [ResourceId] uniqueidentifier NULL,
        [TimestampUtc] datetime2 NOT NULL,
        [CorrelationId] nvarchar(100) NULL,
        CONSTRAINT [PK_AuditEntries] PRIMARY KEY ([Id]),
        CONSTRAINT [FK_AuditEntries_AspNetUsers_ActorUserId] FOREIGN KEY ([ActorUserId]) REFERENCES [AspNetUsers] ([Id]),
        CONSTRAINT [FK_AuditEntries_Restaurants_RestaurantId] FOREIGN KEY ([RestaurantId]) REFERENCES [Restaurants] ([Id])
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261012030220_InitialTenantModel'
)
BEGIN
    CREATE TABLE [Categories] (
        [Id] uniqueidentifier NOT NULL,
        [RestaurantId] uniqueidentifier NOT NULL,
        [NameAr] nvarchar(120) NOT NULL,
        [NameEn] nvarchar(120) NULL,
        [SortOrder] int NOT NULL,
        [IsPublished] bit NOT NULL,
        [IsDeleted] bit NOT NULL,
        [CreatedAtUtc] datetime2 NOT NULL,
        [UpdatedAtUtc] datetime2 NOT NULL,
        [RowVersion] rowversion NOT NULL,
        CONSTRAINT [PK_Categories] PRIMARY KEY ([Id]),
        CONSTRAINT [AK_Categories_RestaurantId_Id] UNIQUE ([RestaurantId], [Id]),
        CONSTRAINT [CK_Category_Sort] CHECK ([SortOrder] >= 0),
        CONSTRAINT [FK_Categories_Restaurants_RestaurantId] FOREIGN KEY ([RestaurantId]) REFERENCES [Restaurants] ([Id])
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261012030220_InitialTenantModel'
)
BEGIN
    CREATE TABLE [RestaurantSettings] (
        [RestaurantId] uniqueidentifier NOT NULL,
        [PrimaryColor] nvarchar(7) NOT NULL,
        [LogoObjectKey] nvarchar(300) NULL,
        [CoverObjectKey] nvarchar(300) NULL,
        [ContactPhoneOptional] nvarchar(32) NULL,
        [AddressOptional] nvarchar(500) NULL,
        [PublishedContactDetailsFlags] int NOT NULL,
        [DefaultLocale] nvarchar(2) NOT NULL,
        [Description] nvarchar(2000) NULL,
        [RowVersion] rowversion NOT NULL,
        CONSTRAINT [PK_RestaurantSettings] PRIMARY KEY ([RestaurantId]),
        CONSTRAINT [CK_Settings_Color] CHECK (LEN([PrimaryColor]) = 7 AND LEFT([PrimaryColor],1) = '#' AND SUBSTRING([PrimaryColor],2,6) COLLATE Latin1_General_100_BIN2 NOT LIKE '%[^0-9A-Fa-f]%'),
        CONSTRAINT [CK_Settings_Contacts] CHECK ([PublishedContactDetailsFlags] BETWEEN 0 AND 3),
        CONSTRAINT [CK_Settings_Locale] CHECK ([DefaultLocale] IN ('ar','en')),
        CONSTRAINT [FK_RestaurantSettings_Restaurants_RestaurantId] FOREIGN KEY ([RestaurantId]) REFERENCES [Restaurants] ([Id])
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261012030220_InitialTenantModel'
)
BEGIN
    CREATE TABLE [RestaurantUsers] (
        [RestaurantId] uniqueidentifier NOT NULL,
        [UserId] uniqueidentifier NOT NULL,
        [Role] nvarchar(16) NOT NULL,
        [IsActive] bit NOT NULL,
        CONSTRAINT [PK_RestaurantUsers] PRIMARY KEY ([RestaurantId], [UserId]),
        CONSTRAINT [CK_Membership_Role] CHECK ([Role] = 'Owner'),
        CONSTRAINT [FK_RestaurantUsers_AspNetUsers_UserId] FOREIGN KEY ([UserId]) REFERENCES [AspNetUsers] ([Id]),
        CONSTRAINT [FK_RestaurantUsers_Restaurants_RestaurantId] FOREIGN KEY ([RestaurantId]) REFERENCES [Restaurants] ([Id])
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261012030220_InitialTenantModel'
)
BEGIN
    CREATE TABLE [MenuItems] (
        [Id] uniqueidentifier NOT NULL,
        [RestaurantId] uniqueidentifier NOT NULL,
        [CategoryId] uniqueidentifier NOT NULL,
        [NameAr] nvarchar(150) NOT NULL,
        [NameEn] nvarchar(150) NULL,
        [DescriptionAr] nvarchar(2000) NULL,
        [DescriptionEn] nvarchar(2000) NULL,
        [Price] decimal(18,2) NOT NULL,
        [CurrencyCode] char(3) NOT NULL DEFAULT 'EGP',
        [SortOrder] int NOT NULL,
        [IsPublished] bit NOT NULL,
        [IsAvailable] bit NOT NULL,
        [IsDeleted] bit NOT NULL,
        [CreatedAtUtc] datetime2 NOT NULL,
        [UpdatedAtUtc] datetime2 NOT NULL,
        [RowVersion] rowversion NOT NULL,
        CONSTRAINT [PK_MenuItems] PRIMARY KEY ([Id]),
        CONSTRAINT [AK_MenuItems_RestaurantId_Id] UNIQUE ([RestaurantId], [Id]),
        CONSTRAINT [CK_Item_Currency] CHECK ([CurrencyCode] = 'EGP'),
        CONSTRAINT [CK_Item_Price] CHECK ([Price] >= 0),
        CONSTRAINT [CK_Item_Sort] CHECK ([SortOrder] >= 0),
        CONSTRAINT [FK_MenuItems_Categories_RestaurantId_CategoryId] FOREIGN KEY ([RestaurantId], [CategoryId]) REFERENCES [Categories] ([RestaurantId], [Id]),
        CONSTRAINT [FK_MenuItems_Restaurants_RestaurantId] FOREIGN KEY ([RestaurantId]) REFERENCES [Restaurants] ([Id])
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261012030220_InitialTenantModel'
)
BEGIN
    CREATE TABLE [MenuItemImages] (
        [Id] uniqueidentifier NOT NULL,
        [RestaurantId] uniqueidentifier NOT NULL,
        [MenuItemId] uniqueidentifier NOT NULL,
        [ObjectKey] nvarchar(300) NOT NULL,
        [AltAr] nvarchar(300) NULL,
        [AltEn] nvarchar(300) NULL,
        [SortOrder] int NOT NULL,
        [Width] int NOT NULL,
        [Height] int NOT NULL,
        [ContentType] nvarchar(32) NOT NULL,
        [CreatedAtUtc] datetime2 NOT NULL,
        CONSTRAINT [PK_MenuItemImages] PRIMARY KEY ([Id]),
        CONSTRAINT [AK_MenuItemImages_RestaurantId_Id] UNIQUE ([RestaurantId], [Id]),
        CONSTRAINT [CK_Image_Dimensions] CHECK ([Width] > 0 AND [Height] > 0 AND [SortOrder] >= 0),
        CONSTRAINT [CK_Image_Key] CHECK (LEFT([ObjectKey],37) = CONVERT(nvarchar(36),[RestaurantId]) + '/' AND LEN([ObjectKey]) > 37 AND [ObjectKey] NOT LIKE '%..%' AND [ObjectKey] NOT LIKE '%\%'),
        CONSTRAINT [CK_Image_Type] CHECK ([ContentType] IN ('image/jpeg','image/png','image/webp')),
        CONSTRAINT [FK_MenuItemImages_MenuItems_RestaurantId_MenuItemId] FOREIGN KEY ([RestaurantId], [MenuItemId]) REFERENCES [MenuItems] ([RestaurantId], [Id])
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261012030220_InitialTenantModel'
)
BEGIN
    CREATE INDEX [IX_AspNetRoleClaims_RoleId] ON [AspNetRoleClaims] ([RoleId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261012030220_InitialTenantModel'
)
BEGIN
    EXEC(N'CREATE UNIQUE INDEX [RoleNameIndex] ON [AspNetRoles] ([NormalizedName]) WHERE [NormalizedName] IS NOT NULL');
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261012030220_InitialTenantModel'
)
BEGIN
    CREATE INDEX [IX_AspNetUserClaims_UserId] ON [AspNetUserClaims] ([UserId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261012030220_InitialTenantModel'
)
BEGIN
    CREATE INDEX [IX_AspNetUserLogins_UserId] ON [AspNetUserLogins] ([UserId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261012030220_InitialTenantModel'
)
BEGIN
    CREATE INDEX [IX_AspNetUserRoles_RoleId] ON [AspNetUserRoles] ([RoleId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261012030220_InitialTenantModel'
)
BEGIN
    CREATE INDEX [EmailIndex] ON [AspNetUsers] ([NormalizedEmail]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261012030220_InitialTenantModel'
)
BEGIN
    EXEC(N'CREATE UNIQUE INDEX [UserNameIndex] ON [AspNetUsers] ([NormalizedUserName]) WHERE [NormalizedUserName] IS NOT NULL');
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261012030220_InitialTenantModel'
)
BEGIN
    CREATE INDEX [IX_AuditEntries_ActorUserId] ON [AuditEntries] ([ActorUserId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261012030220_InitialTenantModel'
)
BEGIN
    CREATE INDEX [IX_AuditEntries_RestaurantId_TimestampUtc] ON [AuditEntries] ([RestaurantId], [TimestampUtc]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261012030220_InitialTenantModel'
)
BEGIN
    CREATE INDEX [IX_Categories_RestaurantId_IsDeleted_IsPublished_SortOrder] ON [Categories] ([RestaurantId], [IsDeleted], [IsPublished], [SortOrder]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261012030220_InitialTenantModel'
)
BEGIN
    CREATE UNIQUE INDEX [IX_MenuItemImages_ObjectKey] ON [MenuItemImages] ([ObjectKey]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261012030220_InitialTenantModel'
)
BEGIN
    CREATE INDEX [IX_MenuItemImages_RestaurantId_MenuItemId_SortOrder] ON [MenuItemImages] ([RestaurantId], [MenuItemId], [SortOrder]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261012030220_InitialTenantModel'
)
BEGIN
    CREATE INDEX [IX_MenuItems_RestaurantId_CategoryId_IsDeleted_IsPublished_IsAvailable_SortOrder] ON [MenuItems] ([RestaurantId], [CategoryId], [IsDeleted], [IsPublished], [IsAvailable], [SortOrder]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261012030220_InitialTenantModel'
)
BEGIN
    CREATE UNIQUE INDEX [IX_Restaurants_PublicCode] ON [Restaurants] ([PublicCode]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261012030220_InitialTenantModel'
)
BEGIN
    CREATE UNIQUE INDEX [IX_Restaurants_Slug] ON [Restaurants] ([Slug]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261012030220_InitialTenantModel'
)
BEGIN
    CREATE INDEX [IX_RestaurantUsers_UserId_IsActive] ON [RestaurantUsers] ([UserId], [IsActive]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261012030220_InitialTenantModel'
)
BEGIN
    CREATE TRIGGER [TR_Categories_ImmutableTenant] ON [Categories] AFTER UPDATE AS
    BEGIN
        SET NOCOUNT ON;
        IF UPDATE(RestaurantId)
            THROW 51000, 'Restaurant ownership is immutable.', 1;
    END
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261012030220_InitialTenantModel'
)
BEGIN
    CREATE TRIGGER [TR_MenuItems_ImmutableTenant] ON [MenuItems] AFTER UPDATE AS
    BEGIN
        SET NOCOUNT ON;
        IF UPDATE(RestaurantId)
            THROW 51000, 'Restaurant ownership is immutable.', 1;
    END
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261012030220_InitialTenantModel'
)
BEGIN
    CREATE TRIGGER [TR_MenuItemImages_ImmutableTenant] ON [MenuItemImages] AFTER UPDATE AS
    BEGIN
        SET NOCOUNT ON;
        IF UPDATE(RestaurantId)
            THROW 51000, 'Restaurant ownership is immutable.', 1;
    END
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261012030220_InitialTenantModel'
)
BEGIN
    CREATE TRIGGER [TR_RestaurantSettings_ImmutableTenant] ON [RestaurantSettings] AFTER UPDATE AS
    BEGIN
        SET NOCOUNT ON;
        IF UPDATE(RestaurantId)
            THROW 51000, 'Restaurant ownership is immutable.', 1;
    END
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261012030220_InitialTenantModel'
)
BEGIN
    CREATE TRIGGER [TR_RestaurantUsers_ImmutableTenant] ON [RestaurantUsers] AFTER UPDATE AS
    BEGIN
        SET NOCOUNT ON;
        IF UPDATE(RestaurantId)
            THROW 51000, 'Restaurant ownership is immutable.', 1;
    END
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261012030220_InitialTenantModel'
)
BEGIN
    CREATE TRIGGER [TR_AuditEntries_ImmutableTenant] ON [AuditEntries] AFTER UPDATE AS
    BEGIN
        SET NOCOUNT ON;
        IF UPDATE(RestaurantId)
            THROW 51000, 'Restaurant ownership is immutable.', 1;
    END
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261012030220_InitialTenantModel'
)
BEGIN
    CREATE TRIGGER [TR_Restaurants_ImmutablePublicCode] ON [Restaurants] AFTER UPDATE AS
    BEGIN
        SET NOCOUNT ON;
        IF UPDATE(PublicCode)
            THROW 51000, 'Public code is immutable.', 1;
    END
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261012030220_InitialTenantModel'
)
BEGIN
    CREATE TRIGGER [TR_MenuItemImages_ImmutableObjectKey] ON [MenuItemImages] AFTER UPDATE AS
    BEGIN
        SET NOCOUNT ON;
        IF UPDATE(ObjectKey)
            THROW 51000, 'Image object key is immutable.', 1;
    END
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261012030220_InitialTenantModel'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20261012030220_InitialTenantModel', N'10.0.11');
END;

COMMIT;
GO

