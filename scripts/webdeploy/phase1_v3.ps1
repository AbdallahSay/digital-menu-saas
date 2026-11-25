#requires -Version 7.0
# WebDeploy capability-only phase 1 (v3.1). Reads WD_PASS from env (mapped on this one step only).
# Prints stable reason codes and counts ONLY. No raw output, no exception text, no arguments, no inventory claim,
# no revocation claim (chain + hostname validated by default .NET SslStream; revocation not checked).
# Exit code: 0 only when the dump succeeded AND cleanup was verified. Every other path exits nonzero through the single exit below.
param([Parameter(Mandatory)][string]$HelperPath)
$ErrorActionPreference = 'Stop'
$Site = 'site111067'; $HostName = 'site111067.siteasp.net'
function Out-Code([string]$k, [string]$v) { Write-Host "$k=$v" }

function Invoke-Phase1 {
  $tmp = $null; $pass = $null; $arg = $null; $code = 0
  try {
    # 1. credential shape: \A..\z full-string match (no trailing newline), literal hyphen last, no space/control/comma/quote
    $pass = $env:WD_PASS; Remove-Item Env:WD_PASS -ErrorAction SilentlyContinue
    if ([string]::IsNullOrEmpty($pass) -or -not [regex]::IsMatch($pass, '\A[A-Za-z0-9!=-]{8,64}\z')) { Out-Code result 'CREDENTIAL_SHAPE_REFUSED'; return 10 }
    Add-Type -TypeDefinition (Get-Content -Raw -LiteralPath $HelperPath)
    # 2. private temp dir; ACL set, then verified by exact SID
    $base = if ($env:RUNNER_TEMP) { $env:RUNNER_TEMP } else { [IO.Path]::GetTempPath() }
    $tmp = Join-Path $base ('wd-' + [guid]::NewGuid().ToString('N')); New-Item -ItemType Directory -Path $tmp | Out-Null
    $me = [Security.Principal.WindowsIdentity]::GetCurrent().User
    & icacls.exe $tmp /inheritance:r /grant:r "*$($me.Value):(OI)(CI)F" *> $null
    if ($LASTEXITCODE -ne 0) { Out-Code result 'ACL_SET_FAILED'; return 11 }
    $allowed = @($me.Value, 'S-1-5-18', 'S-1-5-32-544')
    $acl = Get-Acl -LiteralPath $tmp
    $bad = @($acl.Access | Where-Object { $_.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value -notin $allowed })
    $hasMe = @($acl.Access | Where-Object { $_.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value -eq $me.Value }).Count -gt 0
    if ($acl.AreAccessRulesProtected -ne $true -or $bad.Count -ne 0 -or -not $hasMe) { Out-Code result 'ACL_VERIFY_FAILED'; return 12 }
    # 3. msdeploy presence/version
    $ms = 'C:\Program Files (x86)\IIS\Microsoft Web Deploy V3\msdeploy.exe'
    if (-not (Test-Path -LiteralPath $ms)) { Out-Code result 'MSDEPLOY_ABSENT'; return 13 }
    Out-Code msdeploy_version ((Get-Item -LiteralPath $ms).VersionInfo.ProductVersion)
    # 4. top-level help: observed exit -1 accepted ONLY with expected content markers in the private raw file
    $hr = Join-Path $tmp 'help.raw'
    $h = [CappedRunner]::Run($ms, [string[]]@('-help'), $hr, 262144, 30000)
    $ht = Get-Content -Raw -LiteralPath $hr
    $helpOk = ($h.Status -eq 'NONZERO' -and $h.ExitCode -eq -1 -and $ht -match '(?i)-verb' -and $ht -match '(?i)contentPath' -and $ht -match '(?i)disableLink' -and $ht -match '(?i)-skip')
    Remove-Item -LiteralPath $hr -Force; $ht = $null
    Out-Code help_check ($(if ($helpOk) { 'EXPECTED' } else { 'UNEXPECTED' }))
    if (-not $helpOk) { return 14 }
    # 5. strict TLS (default validation, chain+hostname; revocation NOT verified)
    $c = [Net.Sockets.TcpClient]::new(); $ssl = $null; $tlsOk = $false
    try {
      if (-not $c.ConnectAsync($HostName, 8172).Wait(15000)) { throw 'x' }
      $ssl = [Net.Security.SslStream]::new($c.GetStream(), $false)
      $o = [Net.Security.SslClientAuthenticationOptions]::new(); $o.TargetHost = $HostName
      if (-not $ssl.AuthenticateAsClientAsync($o, [Threading.CancellationToken]::None).Wait(15000)) { throw 'x' }
      $tlsOk = $true
    } catch { $tlsOk = $false } finally { if ($ssl) { $ssl.Dispose() }; $c.Dispose() }
    Out-Code tls_chain_hostname ($(if ($tlsOk) { 'ACCEPTED' } else { 'REJECTED' })); Out-Code tls_revocation 'NOT_CHECKED'
    if (-not $tlsOk) { return 15 }
    # 6. ONE authenticated metadata dump. No spaces and no commas other than msdeploy separators. Read-only verb.
    #    Protected file/dir skips (host state, secrets, media): appsettings.Production/Development, iisstart.htm,
    #    and .well-known, media, keys, uploads, logs, private with all descendants.
    $protFile = 'appsettings\.(Production|Development)\.json$'
    $protIis = 'iisstart\.htm$'
    $protDir = '(^|[\\/])(\.well-known|media|keys|uploads|logs|private)([\\/]|$)'
    $arg = "-source:contentPath=$Site,computerName=https://$HostName`:8172/msdeploy.axd?site=$Site,userName=$Site,password=$pass,authType=Basic,includeAcls=False"
    $args = [string[]]@('-verb:dump', $arg, '-disableLink:AppPoolExtension', '-disableLink:ContentExtension', '-disableLink:CertificateExtension',
      "-skip:objectName=filePath,absolutePath=$protFile", "-skip:objectName=filePath,absolutePath=$protIis",
      "-skip:objectName=dirPath,absolutePath=$protDir", "-skip:objectName=filePath,absolutePath=$protDir")
    $dr = Join-Path $tmp 'dump.raw'
    $d = [CappedRunner]::Run($ms, $args, $dr, 4194304, 120000)
    $arg = $null; $args = $null; $pass = $null
    Out-Code dump_status $d.Status; Out-Code dump_exit $d.ExitCode; Out-Code dump_stdout_bytes $d.StdoutBytes; Out-Code dump_stderr_bytes $d.StderrBytes; Out-Code dump_lines $d.Lines; Out-Code dump_seconds $d.Seconds
    # 7. capability classification from the private raw file, markers only (nothing printed)
    $raw = Get-Content -Raw -LiteralPath $dr
    $class = if ($d.Status -eq 'OK') { 'DUMP_SUCCEEDED' } elseif ($raw -match 'ERROR_USER_UNAUTHORIZED') { 'AUTH_REJECTED' } elseif ($raw -match 'ERROR_DESTINATION_NOT_REACHABLE|ERROR_SITE_DOES_NOT_EXIST|ERROR_CONNECTION') { 'ENDPOINT_OR_SITE_ERROR' } elseif ($raw -match '(?i)unrecognized argument|invalid argument') { 'ARGUMENT_ERROR' } else { 'OTHER_FAILURE' }
    $raw = $null; Out-Code capability $class; Out-Code inventory 'NOT_PRODUCED_RAW_DELETED'
    if ($d.Status -ne 'OK') { return 16 }
    return 0
  } catch {
    Out-Code result ('SCRIPT_ERROR_' + $_.Exception.GetType().Name); return 99
  } finally {
    $pass = $null; $arg = $null
    if ($tmp -and (Test-Path -LiteralPath $tmp)) { Remove-Item -LiteralPath $tmp -Recurse -Force -ErrorAction SilentlyContinue }
    $script:cleanupOk = -not ($tmp -and (Test-Path -LiteralPath $tmp))
    Out-Code raw_dir_removed $script:cleanupOk
  }
}
$script:cleanupOk = $true
$rc = [int](Invoke-Phase1 | Select-Object -Last 1)
if (-not $script:cleanupOk -and $rc -eq 0) { $rc = 17 }
exit $rc
