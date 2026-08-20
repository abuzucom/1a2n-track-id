# Installs the 1a2n-track-id QML mod into Traktor Pro 4.
# Backs up the stock CSI\D2 folder first; run uninstall.ps1 to restore it.
# Requires an elevated (Administrator) PowerShell because Traktor lives in Program Files.
$ErrorActionPreference = 'Stop'

$traktorQml = 'C:\Program Files\Native Instruments\Traktor Pro 4\Resources64\qml\CSI'
$modDir = Join-Path $PSScriptRoot 'D2'
$target = Join-Path $traktorQml 'D2'
$backup = Join-Path $traktorQml 'D2.stock-backup'
$checker = Join-Path $PSScriptRoot '..\scripts\check-qml-mod.mjs'

# Every failure exits through here, so none can scroll past or vanish with the
# window when this is launched by a shortcut rather than from a live console.
function Fail {
    param([string] $Title, [string[]] $Body)

    Write-Host ''
    Write-Host '================================================================' -ForegroundColor Red
    Write-Host " ABORTED: $Title" -ForegroundColor Red
    Write-Host '================================================================' -ForegroundColor Red
    Write-Host ''
    foreach ($paragraph in $Body) { Write-Host "  $paragraph" }
    Write-Host ''
    Read-Host 'Press Enter to exit'
    exit 1
}

if (-not (Test-Path $target)) {
    Fail 'Traktor Pro 4 was not found' @(
        "Expected the D2 QML folder at:",
        "  $target",
        '',
        'Install Traktor Pro 4 to the default location, or edit the path at',
        'the top of this script if yours lives elsewhere.'
    )
}
if (Get-Process -Name 'Traktor' -ErrorAction SilentlyContinue) {
    Fail 'Traktor is running' @(
        'Close Traktor completely, then run this script again.',
        'Traktor reads these files at startup and holds them open.'
    )
}
if (-not (Test-Path $checker)) {
    Fail 'the mod validator is missing' @(
        "Expected it at:",
        "  $checker",
        '',
        'Run this script from a full checkout of the repository, not from a',
        'copy of the traktor-mod folder on its own.'
    )
}
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Fail 'Node.js is not installed or not on PATH' @(
        'It validates the mod before installing, and it runs the overlay',
        'server. Install it from https://nodejs.org, open a new PowerShell so',
        'PATH picks it up, then run this script again.'
    )
}

# Validate before the copy, not after: Traktor drops a mapping it cannot
# compile without reporting it, so an unchecked install fails silently, and
# copying a broken mod over a working one destroys the only good copy here.
#
# The preference is relaxed only around this call. Merging a native command's
# stderr into the pipeline with 2>&1 turns each line into an error record, and
# under 'Stop' the first one throws before $LASTEXITCODE can be read, losing
# the validator's findings behind a NativeCommandError.
$previousPreference = $ErrorActionPreference
$ErrorActionPreference = 'Continue'
$LASTEXITCODE = $null
$verdict = (& node $checker $modDir 2>&1 | Out-String).Trim()
$checkerExit = $LASTEXITCODE
$ErrorActionPreference = $previousPreference

if ($verdict) { Write-Host $verdict }
if ($null -eq $checkerExit) {
    Fail 'the mod validator did not run' @(
        'node was found on PATH but produced no exit code, so the mod is',
        'unverified and this script will not install it.',
        '',
        'Check that node runs the validator directly:',
        "  node `"$checker`" `"$modDir`""
    )
}
if ($checkerExit -ne 0) {
    Fail 'the QML mod in this repository will not compile' @(
        'Nothing was copied. Traktor was not touched.',
        '',
        'This is a defect in the repository, not on this machine. Traktor',
        'drops a mapping it cannot compile without reporting it, so installing',
        'this would leave the D2 missing from Controller Manager with nothing',
        'in any log to explain it.',
        '',
        'Revert or hotfix the change that broke it:',
        '  git log -1 --oneline -- traktor-mod/D2',
        '  git revert <that commit>',
        'or fix the file named above, then run this script again.'
    )
}
# A validator that produced no verdict has told us nothing. Treat that as a
# failure: a silent pass here is what let a broken mod install once already.
if (-not $verdict) {
    Fail 'the mod validator produced no output' @(
        'It should print a line naming how many files it checked. Exiting',
        'without one means it did not run, so the mod is unverified and this',
        'script will not install it.',
        '',
        'Check that node runs the validator directly:',
        "  node `"$checker`" `"$modDir`""
    )
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
        Fail 'the install did not complete' @(
            "$relative never reached $target.",
            '',
            'Traktor is in a half-installed state. Restore it with:',
            '  .\traktor-mod\uninstall.ps1'
        )
    }
    if ((Get-FileHash $file.FullName).Hash -ne (Get-FileHash $copied).Hash) {
        Fail 'the install is corrupt' @(
            "$relative does not match the source it was copied from.",
            '',
            'Traktor is in a half-installed state. Restore it with:',
            '  .\traktor-mod\uninstall.ps1'
        )
    }
}

Write-Host "Mod installed into $target"
Write-Host ''
Write-Host 'Next steps:'
Write-Host '  1. Start Traktor Pro 4.'
Write-Host '  2. If you do not own a Kontrol D2: Preferences > Controller Manager > Add... > Traktor > Kontrol D2.'
Write-Host '  3. Start the overlay server (start-overlay.cmd) and load a track.'
