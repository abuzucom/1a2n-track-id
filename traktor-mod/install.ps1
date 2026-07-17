# Installs the 1a2n-track-id QML mod into Traktor Pro 4.
# Backs up the stock CSI\D2 folder first; run uninstall.ps1 to restore it.
# Requires an elevated (Administrator) PowerShell because Traktor lives in Program Files.
$ErrorActionPreference = 'Stop'

$traktorQml = 'C:\Program Files\Native Instruments\Traktor Pro 4\Resources64\qml\CSI'
$modDir = Join-Path $PSScriptRoot 'D2'
$target = Join-Path $traktorQml 'D2'
$backup = Join-Path $traktorQml 'D2.stock-backup'

if (-not (Test-Path $target)) {
    throw "Traktor Pro 4 D2 QML folder not found at $target - is Traktor Pro 4 installed?"
}
if (Get-Process -Name 'Traktor' -ErrorAction SilentlyContinue) {
    throw 'Traktor is running. Close it before installing the mod.'
}

if (-not (Test-Path $backup)) {
    Copy-Item -Recurse $target $backup
    Write-Host "Backed up stock D2 folder to $backup"
} else {
    Write-Host "Backup already exists at $backup (keeping the original stock backup)"
}

Copy-Item -Recurse -Force (Join-Path $modDir '*') $target
Write-Host "Mod installed into $target"
Write-Host ''
Write-Host 'Next steps:'
Write-Host '  1. Start Traktor Pro 4.'
Write-Host '  2. If you do not own a Kontrol D2: Preferences > Controller Manager > Add... > Traktor > Kontrol D2.'
Write-Host '  3. Start the overlay server (start-overlay.cmd) and load a track.'
