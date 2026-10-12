param([string]$DataDirectory = 'E:\Codex-F04-Sql', [int]$Port = 5443)
$ErrorActionPreference = 'Stop'
$repo = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$api = Join-Path $repo 'backend/src/DigitalMenu.Api/bin/Release/net10.0/DigitalMenu.Api.dll'
$server = $null
$http = $null
$previousConnection = $env:F02_SQL_CONNECTION
function Start-LocalProcess([string[]]$Arguments, [hashtable]$Variables) {
    $info = [Diagnostics.ProcessStartInfo]::new('dotnet')
    $info.WorkingDirectory = $repo
    $info.UseShellExecute = $false
    $info.CreateNoWindow = $true
    $info.RedirectStandardOutput = $true
    $info.RedirectStandardError = $true
    foreach ($argument in $Arguments) { $info.ArgumentList.Add($argument) }
    foreach ($key in $Variables.Keys) { $info.Environment[$key] = $Variables[$key] }
    $process = [Diagnostics.Process]::Start($info)
    # Drain output only in memory; never echo provider errors or write credential-bearing files.
    $stdout = $process.StandardOutput.ReadToEndAsync()
    $stderr = $process.StandardError.ReadToEndAsync()
    return @{ Process = $process; Stdout = $stdout; Stderr = $stderr }
}
function Send-Json([string]$Path, [object]$Body) {
    $json = $Body | ConvertTo-Json -Compress
    return $http.PostAsync($Path, [Net.Http.StringContent]::new($json, [Text.Encoding]::UTF8, 'application/json')).GetAwaiter().GetResult()
}
try {
    if (![OperatingSystem]::IsWindows() -or ![IO.Path]::IsPathFullyQualified($DataDirectory) -or $Port -lt 1024 -or $Port -gt 65535) {
        throw 'Dedicated Windows LocalDB and an absolute local data directory are required.'
    }
    [IO.Directory]::CreateDirectory($DataDirectory) | Out-Null
    $suffix = [Guid]::NewGuid().ToString('N')
    $database = 'DigitalMenu_Dev_F04_Local_' + $suffix
    $file = Join-Path $DataDirectory ($database + '.mdf')
    $connection = "Server=(localdb)\DigitalMenuF02;Database=$database;AttachDbFilename=$file;Integrated Security=true;Encrypt=false"
    $env:F02_SQL_CONNECTION = $connection
    $migration = Start-LocalProcess @('ef', 'database', 'update', '--project', 'backend/src/DigitalMenu.Infrastructure', '--configuration', 'Release', '--no-build') @{}
    $migration.Process.WaitForExit()
    if ($migration.Process.ExitCode -ne 0) { throw 'Disposable database preparation failed.' }
    $adminPassword = 'Local!' + [Convert]::ToHexString([Security.Cryptography.RandomNumberGenerator]::GetBytes(24))
    $ownerPassword = 'Owner!' + [Convert]::ToHexString([Security.Cryptography.RandomNumberGenerator]::GetBytes(24))
    $variables = @{ ASPNETCORE_ENVIRONMENT = 'Development'; ConnectionStrings__MenuDatabase = $connection }
    $bootstrapVariables = $variables.Clone()
    $bootstrapVariables['Bootstrap__Email'] = 'admin@example.test'
    $bootstrapVariables['Bootstrap__Password'] = $adminPassword
    $bootstrap = Start-LocalProcess @($api, '--bootstrap-admin=true') $bootstrapVariables
    $bootstrap.Process.WaitForExit()
    if ($bootstrap.Process.ExitCode -ne 0) { throw 'Local bootstrap failed.' }
    $pipeName = 'DigitalMenu.Onboarding.' + $suffix
    $variables['DevelopmentOnboarding__Enabled'] = 'true'
    $variables['DevelopmentOnboarding__PipeName'] = $pipeName
    $origin = "https://localhost:$Port"
    $running = Start-LocalProcess @($api, '--urls', $origin) $variables
    $server = $running.Process
    $handler = [Net.Http.HttpClientHandler]::new()
    $handler.AllowAutoRedirect = $false
    $handler.CookieContainer = [Net.CookieContainer]::new()
    $http = [Net.Http.HttpClient]::new($handler)
    $http.BaseAddress = [Uri]$origin
    $ready = $false
    for ($attempt = 0; $attempt -lt 40; $attempt++) {
        try { $ready = [int]$http.GetAsync('/api/health/live').GetAwaiter().GetResult().StatusCode -eq 200 } catch { }
        if ($ready) { break }
        Start-Sleep -Milliseconds 250
    }
    if (!$ready) { throw 'Local HTTPS server unavailable; trust the development certificate.' }
    $csrf = $http.GetAsync('/api/v1/auth/csrf').GetAwaiter().GetResult()
    if ([int]$csrf.StatusCode -ne 200) { throw 'CSRF handshake failed.' }
    $http.DefaultRequestHeaders.Add('X-XSRF-TOKEN', [Uri]::UnescapeDataString($handler.CookieContainer.GetCookies([Uri]$origin)['XSRF-TOKEN'].Value))
    if ([int](Send-Json '/api/v1/auth/login' @{ email = 'admin@example.test'; password = $adminPassword }).StatusCode -ne 204) { throw 'Admin login failed.' }
    $http.DefaultRequestHeaders.Remove('X-XSRF-TOKEN') | Out-Null
    $csrf = $http.GetAsync('/api/v1/auth/csrf').GetAwaiter().GetResult()
    $request = @{ name = 'Local verification restaurant'; slug = 'local-' + $suffix; ownerEmail = 'owner@example.test' }
    if ([int](Send-Json '/api/v1/platform/restaurants' $request).StatusCode -ne 400) { throw 'Missing CSRF was not rejected.' }
    $http.DefaultRequestHeaders.Add('X-XSRF-TOKEN', [Uri]::UnescapeDataString($handler.CookieContainer.GetCookies([Uri]$origin)['XSRF-TOKEN'].Value))
    $created = Send-Json '/api/v1/platform/restaurants' $request
    if ([int]$created.StatusCode -ne 201) { throw 'Provisioning failed.' }
    $publicResponse = $created.Content.ReadAsStringAsync().GetAwaiter().GetResult()
    if ($publicResponse -match '"token"|"password"|"ownerEmail"') { throw 'Unsafe provisioning response.' }
    $second = @{ name = 'Rejected second restaurant'; slug = 'second-' + $suffix; ownerEmail = 'OWNER@example.test' }
    if ([int](Send-Json '/api/v1/platform/restaurants' $second).StatusCode -ne 409) { throw 'Existing owner email rule was not enforced.' }
    Write-Output 'PASS: HTTPS admin login; provisioning 201; missing CSRF 400; existing owner email second restaurant 409.'
    & (Join-Path $PSScriptRoot 'Complete-LocalOnboarding.ps1') -ApiOrigin $origin -PipeName $pipeName -Password (ConvertTo-SecureString $ownerPassword -AsPlainText -Force) -VerifyReplay
    Write-Output "Disposable development database retained for inspection: $database"
} catch {
    throw 'Local end-to-end verification failed. Check SDK/tools, dedicated LocalDB, HTTPS certificate trust and local port availability.'
} finally {
    if ($http) { $http.Dispose() }
    if ($server -and !$server.HasExited) { $server.Kill($true); $server.WaitForExit() }
    $env:F02_SQL_CONNECTION = $previousConnection
    $adminPassword = $ownerPassword = $bootstrapVariables = $null
}
