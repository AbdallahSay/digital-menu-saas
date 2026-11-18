BEGIN TRANSACTION;
IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261118192703_L1bPublicImagesAndTheme'
)
BEGIN
    ALTER TABLE [RestaurantSettings] ADD [CoverHeight] int NULL;
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261118192703_L1bPublicImagesAndTheme'
)
BEGIN
    ALTER TABLE [RestaurantSettings] ADD [CoverWidth] int NULL;
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261118192703_L1bPublicImagesAndTheme'
)
BEGIN
    ALTER TABLE [RestaurantSettings] ADD [LogoHeight] int NULL;
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261118192703_L1bPublicImagesAndTheme'
)
BEGIN
    ALTER TABLE [RestaurantSettings] ADD [LogoWidth] int NULL;
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261118192703_L1bPublicImagesAndTheme'
)
BEGIN
    ALTER TABLE [RestaurantSettings] ADD [ThemeKey] varchar(16) NOT NULL DEFAULT 'teal';
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261118192703_L1bPublicImagesAndTheme'
)
BEGIN
    EXEC(N'ALTER TABLE [RestaurantSettings] ADD CONSTRAINT [CK_Settings_CoverSize] CHECK (([CoverWidth] IS NULL AND [CoverHeight] IS NULL) OR ([CoverWidth] IS NOT NULL AND [CoverHeight] IS NOT NULL AND [CoverWidth] BETWEEN 1 AND 6000 AND [CoverHeight] BETWEEN 1 AND 6000))');
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261118192703_L1bPublicImagesAndTheme'
)
BEGIN
    EXEC(N'ALTER TABLE [RestaurantSettings] ADD CONSTRAINT [CK_Settings_LogoSize] CHECK (([LogoWidth] IS NULL AND [LogoHeight] IS NULL) OR ([LogoWidth] IS NOT NULL AND [LogoHeight] IS NOT NULL AND [LogoWidth] BETWEEN 1 AND 6000 AND [LogoHeight] BETWEEN 1 AND 6000))');
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261118192703_L1bPublicImagesAndTheme'
)
BEGIN
    EXEC(N'ALTER TABLE [RestaurantSettings] ADD CONSTRAINT [CK_Settings_Theme] CHECK ([ThemeKey] IN (''teal'',''amber'',''burgundy''))');
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261118192703_L1bPublicImagesAndTheme'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20261118192703_L1bPublicImagesAndTheme', N'10.0.11');
END;

COMMIT;
GO

