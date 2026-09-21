#Requires -RunAsAdministrator
<#
One-time host setup for the student-edition test VM. Run in an ELEVATED PowerShell.
  1. Turns on the Hyper-V role (needs a Windows restart).
  2. Adds you to "Hyper-V Administrators". After that, VM work needs no elevation, which is what
     lets a normal (non-elevated) session, including Claude Code, create, snapshot and drive the VM.
  3. Creates C:\ndvm (an ASCII path) for the VM files.
After the restart, sign out and back in and restart VS Code so new sessions carry the group.
Not run on the machine it was written on: Hyper-V was not installed there.
#>
$ErrorActionPreference = 'Stop'
$me = "$env:USERDOMAIN\$env:USERNAME"

$feature = Enable-WindowsOptionalFeature -Online -FeatureName Microsoft-Hyper-V -All -NoRestart
"Hyper-V role enabled. Restart needed: $($feature.RestartNeeded)"

$members = Get-LocalGroupMember -Group 'Hyper-V Administrators' -ErrorAction SilentlyContinue
if (-not ($members | Where-Object { $_.Name -eq $me })) {
    Add-LocalGroupMember -Group 'Hyper-V Administrators' -Member $me
    "Added $me to Hyper-V Administrators"
}

New-Item -ItemType Directory -Force 'C:\ndvm' | Out-Null
icacls 'C:\ndvm' /grant "${me}:(OI)(CI)M" | Out-Null
'Done. Restart Windows now, then sign out and back in.'
