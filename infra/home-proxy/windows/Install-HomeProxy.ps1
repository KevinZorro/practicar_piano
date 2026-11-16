<#
.SYNOPSIS
  Install the home SOCKS5 proxy: firewall rule + scheduled task at start-up.
.DESCRIPTION
  Run from an elevated PowerShell. It downloads nothing: download gost yourself from
  https://github.com/go-gost/gost/releases (MIT license), check its SHA-256 against the
  release page, and pass the checksum so this script verifies it before installing.
.EXAMPLE
  .\Install-HomeProxy.ps1 -GostZip $HOME\Downloads\gost_windows_amd64.zip -ExpectedSha256 <hash>
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory)] [string] $GostZip,
  [Parameter(Mandatory)] [ValidatePattern('^[A-Fa-f0-9]{64}$')] [string] $ExpectedSha256,
  [string] $BindAddress = '10.8.0.2',
  [string] $VpsAddress = '10.8.0.1',
  [int] $Port = 1080,
  [string] $InstallDir = "$env:ProgramData\pianola-proxy"
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$principal = [Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  throw 'Run this script from an elevated (administrator) PowerShell.'
}

$actual = (Get-FileHash -Algorithm SHA256 -Path $GostZip).Hash
if ($actual -ne $ExpectedSha256.ToUpper()) {
  throw "SHA-256 mismatch for $GostZip (got $actual). Do not install a binary you cannot verify."
}

New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
Expand-Archive -Path $GostZip -DestinationPath $InstallDir -Force
$gost = Join-Path $InstallDir 'gost.exe'
if (-not (Test-Path $gost)) { throw "gost.exe not found in $GostZip" }
Copy-Item -Path (Join-Path $PSScriptRoot 'Run-HomeProxy.ps1') -Destination $InstallDir -Force
$runner = Join-Path $InstallDir 'Run-HomeProxy.ps1'

# Only the VPS tunnel address may reach the proxy, and only on the tunnel address.
$ruleName = 'pianola-home-proxy'
Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue | Remove-NetFirewallRule
New-NetFirewallRule -DisplayName $ruleName -Direction Inbound -Action Allow -Protocol TCP `
  -LocalAddress $BindAddress -LocalPort $Port -RemoteAddress $VpsAddress -Profile Any | Out-Null

# Windows drops inbound ping by default; allow it from the VPS only so check-tunnel.sh works.
$icmpRule = 'pianola-home-proxy-ping'
Get-NetFirewallRule -DisplayName $icmpRule -ErrorAction SilentlyContinue | Remove-NetFirewallRule
New-NetFirewallRule -DisplayName $icmpRule -Direction Inbound -Action Allow -Protocol ICMPv4 `
  -IcmpType 8 -LocalAddress $BindAddress -RemoteAddress $VpsAddress -Profile Any | Out-Null

$taskName = 'pianola-home-proxy'
$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument (
  "-NoProfile -ExecutionPolicy Bypass -File `"$runner`" -GostPath `"$gost`" " +
  "-BindAddress $BindAddress -Port $Port")
$trigger = New-ScheduledTaskTrigger -AtStartup
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -RestartCount 999 `
  -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero) `
  -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings `
  -User 'SYSTEM' -RunLevel Highest -Force | Out-Null
Start-ScheduledTask -TaskName $taskName

Write-Host "Installed. Proxy: socks5h://${BindAddress}:${Port} (reachable only from $VpsAddress)."
