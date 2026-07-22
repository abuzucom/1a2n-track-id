# Starts the overlay server bound to this window's lifetime: closing this
# window (X button, Ctrl+C, exit, or a forced kill) also kills the node.exe
# server. npm's own launch chain nests four processes deep
# (cmd -> node(npm) -> cmd -> node(server)), and Windows does not reliably
# propagate a window close through that many hops; this script launches node
# directly (two hops: this process -> node) and layers three independent
# cleanup mechanisms so no single one has to be perfect:
#   1. try/finally around the wait, which PowerShell runs on Ctrl+C, `exit`,
#      and normal completion.
#   2. A PowerShell.Exiting engine event, which fires on most console-close
#      paths even when the pipeline does not unwind normally.
#   3. A Windows Job Object with JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE, the
#      OS-level guarantee for a forceful kill (Task Manager, taskkill,
#      another tool) that bypasses this script's own code entirely.
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host 'Node.js is not installed or not on PATH.'
    Write-Host 'Install it from https://nodejs.org and run this again.'
    Read-Host 'Press Enter to exit'
    exit 1
}

if (-not (Test-Path (Join-Path $PSScriptRoot 'node_modules'))) {
    Write-Host 'First run: installing dependencies...'
    npm install
    if ($LASTEXITCODE -ne 0) {
        Write-Host 'npm install failed.'
        Read-Host 'Press Enter to exit'
        exit 1
    }
}

Write-Host 'Building the overlay server...'
npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Host 'Build failed.'
    Read-Host 'Press Enter to exit'
    exit 1
}

Add-Type -Namespace TrackId -Name JobNative -MemberDefinition @'
[DllImport("kernel32.dll", SetLastError = true)]
public static extern IntPtr CreateJobObject(IntPtr lpJobAttributes, string lpName);

[DllImport("kernel32.dll", SetLastError = true)]
public static extern bool SetInformationJobObject(IntPtr hJob, int JobObjectInfoClass, IntPtr lpJobObjectInfo, uint cbJobObjectInfoLength);

[DllImport("kernel32.dll", SetLastError = true)]
public static extern bool AssignProcessToJobObject(IntPtr hJob, IntPtr hProcess);
'@

Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;

public struct TrackIdIoCounters {
    public ulong ReadOperationCount, WriteOperationCount, OtherOperationCount;
    public ulong ReadTransferCount, WriteTransferCount, OtherTransferCount;
}

[StructLayout(LayoutKind.Sequential)]
public struct TrackIdBasicLimitInfo {
    public long PerProcessUserTimeLimit;
    public long PerJobUserTimeLimit;
    public uint LimitFlags;
    public UIntPtr MinimumWorkingSetSize;
    public UIntPtr MaximumWorkingSetSize;
    public uint ActiveProcessLimit;
    public UIntPtr Affinity;
    public uint PriorityClass;
    public uint SchedulingClass;
}

[StructLayout(LayoutKind.Sequential)]
public struct TrackIdExtendedLimitInfo {
    public TrackIdBasicLimitInfo BasicLimitInformation;
    public TrackIdIoCounters IoInfo;
    public UIntPtr ProcessMemoryLimit;
    public UIntPtr JobMemoryLimit;
    public UIntPtr PeakProcessMemoryUsed;
    public UIntPtr PeakJobMemoryUsed;
}
'@

function New-KillOnCloseJob {
    $KILL_ON_JOB_CLOSE = 0x2000
    $JOB_OBJECT_EXTENDED_LIMIT_INFORMATION = 9

    $jobHandle = [TrackId.JobNative]::CreateJobObject([IntPtr]::Zero, $null)
    if ($jobHandle -eq [IntPtr]::Zero) {
        Write-Warning "CreateJobObject failed: $(New-Object System.ComponentModel.Win32Exception)"
        return [IntPtr]::Zero
    }

    $limitInfo = New-Object TrackIdExtendedLimitInfo
    $limitInfo.BasicLimitInformation.LimitFlags = $KILL_ON_JOB_CLOSE
    $infoSize = [System.Runtime.InteropServices.Marshal]::SizeOf($limitInfo)
    $infoPtr = [System.Runtime.InteropServices.Marshal]::AllocHGlobal($infoSize)
    try {
        [System.Runtime.InteropServices.Marshal]::StructureToPtr($limitInfo, $infoPtr, $false)
        $set = [TrackId.JobNative]::SetInformationJobObject($jobHandle, $JOB_OBJECT_EXTENDED_LIMIT_INFORMATION, $infoPtr, $infoSize)
        if (-not $set) {
            Write-Warning "SetInformationJobObject failed: $(New-Object System.ComponentModel.Win32Exception)"
            return [IntPtr]::Zero
        }
    } finally {
        [System.Runtime.InteropServices.Marshal]::FreeHGlobal($infoPtr)
    }
    return $jobHandle
}

# Launch node directly (skip npm's extra cmd/node hops). Set
# TRACK_ID_REQUIRE_AUTH=1 before launching to require authenticated ingest.
$serverArgs = @('dist\main.js')
if ($env:TRACK_ID_REQUIRE_AUTH -eq '1') {
    $serverArgs += '--require-auth'
}
$server = Start-Process node -ArgumentList $serverArgs -PassThru -NoNewWindow

$job = New-KillOnCloseJob
if ($job -ne [IntPtr]::Zero) {
    $bound = [TrackId.JobNative]::AssignProcessToJobObject($job, $server.Handle)
    if (-not $bound) {
        Write-Warning "Could not bind the server to this window's job (forceful-kill cleanup will not apply): $(New-Object System.ComponentModel.Win32Exception)"
    }
}

$stopServer = {
    if ($server -and -not $server.HasExited) {
        Stop-Process -Id $server.Id -Force -ErrorAction SilentlyContinue
    }
}
Register-EngineEvent -SourceIdentifier ([System.Management.Automation.PsEngineEvent]::Exiting) -Action $stopServer | Out-Null

Start-Process 'http://127.0.0.1:8080/overlay'

Write-Host ''
Write-Host 'Overlay server running. Closing this window stops it.'
Write-Host ''

try {
    Wait-Process -Id $server.Id
} finally {
    & $stopServer
}
