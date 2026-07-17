# Restores the stock Traktor Pro 4 CSI\D2 folder from the backup created by install.ps1.
# Requires an elevated (Administrator) PowerShell.
$ErrorActionPreference = 'Stop'

$traktorQml = 'C:\Program Files\Native Instruments\Traktor Pro 4\Resources64\qml\CSI'
$target = Join-Path $traktorQml 'D2'
$backup = Join-Path $traktorQml 'D2.stock-backup'

if (-not (Test-Path $backup)) {
    throw "No backup found at $backup - nothing to restore."
}
if (Get-Process -Name 'Traktor' -ErrorAction SilentlyContinue) {
    throw 'Traktor is running. Close it before uninstalling the mod.'
}

Remove-Item -Recurse -Force $target
Copy-Item -Recurse $backup $target
Remove-Item -Recurse -Force $backup
Write-Host "Stock D2 folder restored at $target"
