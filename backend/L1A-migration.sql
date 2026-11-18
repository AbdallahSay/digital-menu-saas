BEGIN TRANSACTION;
IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261118184305_AddRestaurantThemeKey'
)
BEGIN
    ALTER TABLE [RestaurantSettings] ADD [ThemeKey] nvarchar(16) NOT NULL DEFAULT N'grill';
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261118184305_AddRestaurantThemeKey'
)
BEGIN
    EXEC(N'ALTER TABLE [RestaurantSettings] ADD CONSTRAINT [CK_Settings_Theme] CHECK ([ThemeKey] IN (''grill'',''cafe''))');
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261118184305_AddRestaurantThemeKey'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20261118184305_AddRestaurantThemeKey', N'10.0.11');
END;

COMMIT;
GO

