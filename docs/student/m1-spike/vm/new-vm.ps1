<#
Creates the student-laptop test VM (Generation 2, Secure Boot, virtual TPM, fixed RAM).
Run after setup-host.ps1 and the restart. If a Set-VMKeyProtector / Enable-VMTPM step is refused,
run this once from an elevated PowerShell.
  .\new-vm.ps1 -Iso C:\path\Win11.iso                # 4 GB, the worst case worth testing
  .\new-vm.ps1 -Iso C:\path\Win11.iso -MemoryGB 8 -Name nd-student-8gb
Then: Start-VM nd-student; vmconnect localhost nd-student   (press a key to boot from the DVD).
Not run on the machine it was written on: Hyper-V was not installed there.
#>
param(
    [Parameter(Mandatory)][string]$Iso,
    [string]$Name = 'nd-student',
    [int]$MemoryGB = 4,
    [int]$Cpus = 4,
    [int]$DiskGB = 64,
    [string]$Root = 'C:\ndvm'
)
$ErrorActionPreference = 'Stop'
if (-not (Test-Path $Iso)) { throw "ISO not found: $Iso" }

New-VM -Name $Name -Generation 2 -MemoryStartupBytes ($MemoryGB * 1GB) -Path $Root `
    -NewVHDPath (Join-Path $Root "$Name.vhdx") -NewVHDSizeBytes ($DiskGB * 1GB) -SwitchName 'Default Switch' | Out-Null
Set-VM -Name $Name -ProcessorCount $Cpus -StaticMemory -AutomaticCheckpointsEnabled $false
Set-VMFirmware -VMName $Name -EnableSecureBoot On
Set-VMKeyProtector -VMName $Name -NewLocalKeyProtector
Enable-VMTPM -VMName $Name
Enable-VMIntegrationService -VMName $Name -Name 'Guest Service Interface'   # Copy-VMFile without a network

Add-VMDvdDrive -VMName $Name -Path $Iso
Set-VMFirmware -VMName $Name -FirstBootDevice (Get-VMDvdDrive -VMName $Name)
"Created $Name ($MemoryGB GB RAM, $Cpus vCPU, $DiskGB GB disk). Start it and install Windows."
