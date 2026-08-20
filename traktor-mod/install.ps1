# Installs the 1a2n-track-id QML mod into Traktor Pro 4.
# Backs up the stock CSI\D2 folder first; run uninstall.ps1 to restore it.
# Requires an elevated (Administrator) PowerShell because Traktor lives in Program Files.
$ErrorActionPreference = 'Stop'

$traktorQml = 'C:\Program Files\Native Instruments\Traktor Pro 4\Resources64\qml\CSI'
$modDir = Join-Path $PSScriptRoot 'D2'
$target = Join-Path $traktorQml 'D2'
$backup = Join-Path $traktorQml 'D2.stock-backup'
$checker = Join-Path $PSScriptRoot '..\scripts\check-qml-mod.mjs'

if (-not (Test-Path $target)) {
    throw "Traktor Pro 4 D2 QML folder not found at $target. Is Traktor Pro 4 installed?"
}
if (Get-Process -Name 'Traktor' -ErrorAction SilentlyContinue) {
    throw 'Traktor is running. Close it before installing the mod.'
}

# Validate before the copy, not after: a mod file Traktor cannot parse leaves
# the D2 device missing from Controller Manager, and copying it over a working
# install destroys the only good copy on the machine.
if (-not (Test-Path $checker)) {
    throw "Validator not found at $checker. Run this script from a full checkout of the repository."
}
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    throw 'Node.js is not installed or not on PATH. It is needed to validate the mod, and to run the overlay server. Install it from https://nodejs.org and run this again.'
}
# No 2>&1 here: merging a native command's stderr into the pipeline turns it
# into error records under $ErrorActionPreference = 'Stop'. Let node print its
# own findings, which name the offending file and line, and read the exit code.
& node $checker $modDir
if ($LASTEXITCODE -ne 0) {
    throw 'The QML mod failed validation, so nothing was installed. See the errors above.'
}

if (-not (Test-Path $backup)) {
    Copy-Item -Recurse $target $backup
    Write-Host "Backed up stock D2 folder to $backup"
} else {
    Write-Host "Backup already exists at $backup (keeping the original stock backup)"
}

Copy-Item -Recurse -Force (Join-Path $modDir '*') $target

# Confirm every mod file arrived intact. Compares only the files this repo
# owns, so the stock NI files sharing this folder are never touched.
foreach ($file in Get-ChildItem -Path $modDir -Recurse -File) {
    $relative = $file.FullName.Substring($modDir.Length).TrimStart('\')
    $copied = Join-Path $target $relative
    if (-not (Test-Path $copied)) {
        throw "Install incomplete: $relative did not reach $target. Restore with uninstall.ps1 and try again."
    }
    if ((Get-FileHash $file.FullName).Hash -ne (Get-FileHash $copied).Hash) {
        throw "Install corrupt: $relative does not match the source. Restore with uninstall.ps1 and try again."
    }
}

Write-Host "Mod installed into $target"
Write-Host ''
Write-Host 'Next steps:'
Write-Host '  1. Start Traktor Pro 4.'
Write-Host '  2. If you do not own a Kontrol D2: Preferences > Controller Manager > Add... > Traktor > Kontrol D2.'
Write-Host '  3. Start the overlay server (start-overlay.cmd) and load a track.'
