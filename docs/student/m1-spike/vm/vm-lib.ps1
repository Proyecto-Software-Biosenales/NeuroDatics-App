# Helpers to drive the student-edition test VM from the host, with no guest network needed
# (PowerShell Direct and Copy-VMFile travel over the hypervisor). Dot-source:  . .\vm-lib.ps1
# Needs: Hyper-V role, membership of "Hyper-V Administrators" (or an elevated shell), a guest running
# Windows 10/11 with a local account that has a password. Not run on the machine it was written on.
$global:NdVm = 'nd-student'
$global:NdSwitch = 'Default Switch'
$global:NdCredFile = Join-Path $env:LOCALAPPDATA 'nd-vm\guest-credential.xml'

function Save-NdGuestCredential {
    # Encrypted for THIS Windows user on THIS machine only. Use a throwaway password.
    New-Item -ItemType Directory -Force (Split-Path $global:NdCredFile) | Out-Null
    Get-Credential -Message 'Guest account of the test VM (throwaway password)' | Export-Clixml $global:NdCredFile
}
function Get-NdGuestCredential { Import-Clixml $global:NdCredFile }

function Wait-NdGuest([int]$TimeoutSec = 300) {
    $end = (Get-Date).AddSeconds($TimeoutSec)
    while ((Get-Date) -lt $end) {
        try {
            if (Invoke-Command -VMName $global:NdVm -Credential (Get-NdGuestCredential) -ScriptBlock { 1 } -ErrorAction Stop) { return }
        } catch { Start-Sleep -Seconds 5 }
    }
    throw "Guest did not accept PowerShell Direct within $TimeoutSec s"
}

function Invoke-NdGuest([scriptblock]$Script, [object[]]$ArgumentList = @()) {
    Invoke-Command -VMName $global:NdVm -Credential (Get-NdGuestCredential) -ScriptBlock $Script -ArgumentList $ArgumentList
}

function Copy-ToNdGuest([string]$Source, [string]$Destination) {
    Copy-VMFile -Name $global:NdVm -SourcePath $Source -DestinationPath $Destination -FileSource Host -CreateFullPath -Force
}

function Set-NdNetwork([ValidateSet('Online', 'Offline')][string]$State) {
    if ($State -eq 'Online') { Connect-VMNetworkAdapter -VMName $global:NdVm -SwitchName $global:NdSwitch }
    else { Disconnect-VMNetworkAdapter -VMName $global:NdVm }
    "switch now: '" + (Get-VMNetworkAdapter -VMName $global:NdVm | Select-Object -First 1).SwitchName + "' (empty means offline)"
}

function New-NdClean { Checkpoint-VM -Name $global:NdVm -SnapshotName 'clean' }

function Restore-NdClean {
    Restore-VMCheckpoint -VMName $global:NdVm -Name 'clean' -Confirm:$false
    Start-VM -Name $global:NdVm
    Wait-NdGuest
}
