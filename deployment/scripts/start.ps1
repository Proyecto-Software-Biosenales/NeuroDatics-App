# Compatibilidad con accesos de entregas anteriores.
& (Join-Path $PSScriptRoot 'instalar.ps1') @args
exit $LASTEXITCODE
