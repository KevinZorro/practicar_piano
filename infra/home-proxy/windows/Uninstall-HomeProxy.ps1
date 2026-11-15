<#
.SYNOPSIS
  Remove the home proxy: scheduled task, firewall rule and files. Run elevated.
#>
[CmdletBinding()]
param([string] $InstallDir = "$env:ProgramData\pianola-proxy")
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

Stop-ScheduledTask -TaskName 'pianola-home-proxy' -ErrorAction SilentlyContinue
Unregister-ScheduledTask -TaskName 'pianola-home-proxy' -Confirm:$false -ErrorAction SilentlyContinue
Get-Process -Name gost -ErrorAction SilentlyContinue | Stop-Process -Force
foreach ($rule in 'pianola-home-proxy', 'pianola-home-proxy-ping') {
  Get-NetFirewallRule -DisplayName $rule -ErrorAction SilentlyContinue | Remove-NetFirewallRule
}
Remove-Item -Recurse -Force -Path $InstallDir -ErrorAction SilentlyContinue
Write-Host 'Home proxy removed. Deactivate the WireGuard tunnel from its app if you also want to stop it.'
