param(
    [string]$ApiOrigin = 'https://localhost:5443',
    [string]$PipeName = 'DigitalMenu.Onboarding',
    [SecureString]$Password,
    [switch]$VerifyReplay
)
$ErrorActionPreference = 'Stop'
$client = $null
$pipe = $null
try {
    $origin = [Uri]$ApiOrigin
    if ($origin.Scheme -ne 'https' -or $origin.Host -notin @('localhost', '127.0.0.1', '[::1]') -or
        $origin.AbsolutePath -ne '/' -or $origin.Query -or $origin.UserInfo -or $origin.Fragment) {
        throw 'A loopback HTTPS origin is required.'
    }
    if ($PipeName -notmatch '^[A-Za-z0-9.-]{1,80}$') { throw 'Invalid pipe name.' }
    $pipe = [System.IO.Pipes.NamedPipeClientStream]::new('.', $PipeName,
        [System.IO.Pipes.PipeDirection]::In,
        [System.IO.Pipes.PipeOptions]::Asynchronous -bor [System.IO.Pipes.PipeOptions]::CurrentUserOnly)
    $pipe.Connect(30000)
    $reader = [IO.StreamReader]::new($pipe)
    $line = $reader.ReadLineAsync().WaitAsync([TimeSpan]::FromMinutes(5)).GetAwaiter().GetResult()
    if (!$line -or $line.Length -gt 8192) { throw 'Invalid local invitation.' }
    $invitation = $line | ConvertFrom-Json
    if (!$invitation.token -or !$invitation.userId -or !$invitation.email) { throw 'No usable invitation.' }
    if (!$Password) { $Password = Read-Host 'Owner password (Identity policy: 12+ characters)' -AsSecureString }
    $plainPassword = [System.Net.NetworkCredential]::new('', $Password).Password
    $handler = [System.Net.Http.HttpClientHandler]::new()
    $handler.AllowAutoRedirect = $false
    $handler.CookieContainer = [System.Net.CookieContainer]::new()
    # Uses normal certificate validation. Never add a certificate bypass callback.
    $client = [System.Net.Http.HttpClient]::new($handler)
    $client.BaseAddress = $origin
    $csrf = $client.GetAsync('/api/v1/auth/csrf').GetAwaiter().GetResult()
    if ([int]$csrf.StatusCode -ne 200) { throw 'CSRF handshake failed.' }
    $token = [Uri]::UnescapeDataString($handler.CookieContainer.GetCookies($origin)['XSRF-TOKEN'].Value)
    $client.DefaultRequestHeaders.Add('X-XSRF-TOKEN', $token)
    $body = @{ userId = $invitation.userId; token = $invitation.token; password = $plainPassword } | ConvertTo-Json -Compress
    $content = [System.Net.Http.StringContent]::new($body, [Text.Encoding]::UTF8, 'application/json')
    $response = $client.PostAsync('/api/v1/auth/onboarding', $content).GetAwaiter().GetResult()
    if ([int]$response.StatusCode -ne 204) { throw 'Onboarding failed.' }
    if ($VerifyReplay) {
        $replay = $client.PostAsync('/api/v1/auth/onboarding', $content).GetAwaiter().GetResult()
        if ([int]$replay.StatusCode -ne 400) { throw 'Replay was not rejected.' }
    }
    $loginBody = @{ email = $invitation.email; password = $plainPassword } | ConvertTo-Json -Compress
    $login = $client.PostAsync('/api/v1/auth/login', [System.Net.Http.StringContent]::new($loginBody, [Text.Encoding]::UTF8, 'application/json')).GetAwaiter().GetResult()
    if ([int]$login.StatusCode -ne 204) { throw 'Owner login failed.' }
    $me = $client.GetAsync('/api/v1/auth/me').GetAwaiter().GetResult()
    $profile = $me.Content.ReadAsStringAsync().GetAwaiter().GetResult() | ConvertFrom-Json
    if ([int]$me.StatusCode -ne 200 -or $profile.role -ne 'Owner' -or $profile.restaurants.Count -ne 1) { throw 'Owner eligibility verification failed.' }
    Write-Output 'PASS: onboarding 204; owner login 204; /me 200 Owner with one restaurant.'
    if ($VerifyReplay) { Write-Output 'PASS: consumed onboarding token replay rejected with 400.' }
} catch {
    # Do not print exceptions, HTTP bodies, invitations, tokens or credentials.
    throw 'Local onboarding failed. Check HTTPS trust, pipe activation, token expiry and Identity password policy.'
} finally {
    if ($client) { $client.Dispose() }
    if ($pipe) { $pipe.Dispose() }
    $plainPassword = $body = $loginBody = $line = $invitation = $token = $null
}
