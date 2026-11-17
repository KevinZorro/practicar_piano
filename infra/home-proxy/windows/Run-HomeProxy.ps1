<#
.SYNOPSIS
  Start the SOCKS5 proxy (gost) bound only to the WireGuard address.
.NOTES
  Run by the scheduled task created by Install-HomeProxy.ps1 (it can also be run by hand).
  Waits for the tunnel address to exist: binding earlier would fail, and binding to all interfaces
  would expose the proxy to the home LAN.
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory)] [string] $GostPath,
  [string] $BindAddress = '10.8.0.2',
  [int] $Port = 1080,
  [int] $WaitSeconds = 300
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$deadline = (Get-Date).AddSeconds($WaitSeconds)
while (-not (Get-NetIPAddress -IPAddress $BindAddress -ErrorAction SilentlyContinue)) {
  if ((Get-Date) -gt $deadline) {
    throw "WireGuard address $BindAddress did not appear within $WaitSeconds s. Is the tunnel active?"
  }
  Start-Sleep -Seconds 3
}

# No destination logging: gost prints only its own start-up lines at the default level.
& $GostPath -L "socks5://${BindAddress}:${Port}"
