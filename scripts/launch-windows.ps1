# scripts/launch-windows.ps1
# One-click launcher for MyVirtualCommunity Standalone Game & World Core Backend
[CmdletBinding()]
param(
    [Parameter(Mandatory=$false)]
    [int]$ServerPort = 3000,

    [Parameter(Mandatory=$false)]
    [string]$ServerUrl = "",

    [Parameter(Mandatory=$false)]
    [switch]$ActiveHours,

    [Parameter(Mandatory=$false)]
    [switch]$SkipBackend,

    [Parameter(Mandatory=$false)]
    [string]$ExePath = "",

    [Parameter(ValueFromRemainingArguments=$true)]
    [string[]]$ExtraGameArgs
)

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$repoRoot = (Resolve-Path (Join-Path $scriptDir "..")).Path
$logsDir = Join-Path $repoRoot "logs"
$backendLog = Join-Path $logsDir "world-core-backend.log"

if (-not (Test-Path $logsDir)) {
    New-Item -ItemType Directory -Path $logsDir -Force | Out-Null
}

if (-not $ServerUrl) {
    $ServerUrl = "http://127.0.0.1:$ServerPort"
}

if (-not $ExePath) {
    $ExePath = Join-Path $repoRoot "Builds\Windows\MyVirtualCommunity.exe"
}

function Safe-Pause {
    if ([Environment]::UserInteractive -and -not [Console]::IsInputRedirected) {
        try {
            Read-Host "Press Enter to exit..."
        } catch {}
    }
}

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "   MyVirtualCommunity - One-Click Launcher                " -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "Repository root:     $repoRoot"
Write-Host "Game executable:     $ExePath"
Write-Host "Backend target:      $ServerUrl"
Write-Host ""

# 1. Verify Game Executable Exists
if (-not (Test-Path $ExePath)) {
    Write-Host "[ERROR] Game executable not found at: $ExePath" -ForegroundColor Red
    Write-Host ""
    Write-Host "Please build the Windows standalone player first by running:" -ForegroundColor Yellow
    Write-Host "  powershell -File scripts/build-windows.ps1" -ForegroundColor Yellow
    Write-Host "Or with npm:" -ForegroundColor Yellow
    Write-Host "  npm run build:windows" -ForegroundColor Yellow
    Write-Host ""
    Safe-Pause
    exit 1
}

$spawnedBackendProcess = $null
$isExistingBackend = $false

function Test-BackendReady {
    param([string]$Url)
    try {
        $statusUrl = "$($Url.TrimEnd('/'))/api/status"
        $response = Invoke-RestMethod -Uri $statusUrl -TimeoutSec 2 -ErrorAction Stop
        if ($response -and $response.success -eq $true) {
            return $response
        }
    } catch {
        return $null
    }
    return $null
}

# 2. Check or Spawn Backend
if (-not $SkipBackend) {
    Write-Host "Checking World Core backend status..." -ForegroundColor Gray
    $initialCheck = Test-BackendReady -Url $ServerUrl

    if ($initialCheck) {
        $isExistingBackend = $true
        $simTime = $initialCheck.result.worldTime
        $schema = $initialCheck.result.schemaVersion
        Write-Host "[OK] Existing World Core backend detected!" -ForegroundColor Green
        Write-Host "     Target URL:      $ServerUrl" -ForegroundColor Gray
        Write-Host "     Schema Version:  $schema" -ForegroundColor Gray
        Write-Host "     World Time:      $simTime" -ForegroundColor Gray
        Write-Host "     (Existing backend will remain active after game exit)" -ForegroundColor DarkGray
    } else {
        Write-Host "No active backend detected on $ServerUrl. Starting World Core..." -ForegroundColor Yellow
        
        $backendArgs = "src/index.ts"
        if ($ActiveHours) {
            $backendArgs += " --preset-active-hours"
        }

        # Clear or prepare backend log
        if (Test-Path $backendLog) {
            Remove-Item $backendLog -Force -ErrorAction SilentlyContinue
        }

        $backendErrLog = Join-Path $logsDir "world-core-backend-error.log"
        if (Test-Path $backendErrLog) {
            Remove-Item $backendErrLog -Force -ErrorAction SilentlyContinue
        }

        # Spawn backend with standard redirection
        $spawnedBackendProcess = Start-Process -FilePath "cmd.exe" `
            -ArgumentList "/c npx tsx $backendArgs" `
            -WorkingDirectory $repoRoot `
            -RedirectStandardOutput $backendLog `
            -RedirectStandardError $backendErrLog `
            -WindowStyle Hidden `
            -PassThru

        $backendPid = $spawnedBackendProcess.Id
        Write-Host "World Core backend process spawned (PID: $backendPid)." -ForegroundColor Gray
        Write-Host "Waiting for backend readiness at $ServerUrl/api/status..." -ForegroundColor Gray

        # Wait for readiness up to 25 seconds
        $timeoutSeconds = 25
        $startTime = [System.Diagnostics.Stopwatch]::StartNew()
        $ready = $false

        while ($startTime.Elapsed.TotalSeconds -lt $timeoutSeconds) {
            Start-Sleep -Milliseconds 600
            if ($spawnedBackendProcess.HasExited) {
                Write-Host ""
                Write-Host "[ERROR] World Core backend process exited prematurely with code $($spawnedBackendProcess.ExitCode)!" -ForegroundColor Red
                if (Test-Path $backendLog) {
                    Write-Host "--- Backend Log ---" -ForegroundColor DarkRed
                    Get-Content $backendLog -Tail 30 | Write-Host -ForegroundColor DarkRed
                }
                Safe-Pause
                exit 1
            }

            $readyCheck = Test-BackendReady -Url $ServerUrl
            if ($readyCheck) {
                $ready = $true
                $simTime = $readyCheck.result.worldTime
                $schema = $readyCheck.result.schemaVersion
                Write-Host "[OK] World Core backend is ready! (Schema: $schema, Time: $simTime)" -ForegroundColor Green
                break
            }
        }

        if (-not $ready) {
            Write-Host ""
            Write-Host "[ERROR] Timeout waiting for backend readiness at $ServerUrl" -ForegroundColor Red
            if (Test-Path $backendLog) {
                Write-Host "--- Backend Log ---" -ForegroundColor DarkRed
                Get-Content $backendLog -Tail 30 | Write-Host -ForegroundColor DarkRed
            }
            # Terminate spawned process tree
            taskkill /pid $backendPid /T /F 2>$null | Out-Null
            Safe-Pause
            exit 1
        }
    }
}

# 3. Launch Unity Standalone Game
if ($spawnedBackendProcess -and -not $isExistingBackend) {
    Write-Host "Allowing CPU power transient to settle before GPU initialization (2s)..." -ForegroundColor DarkGray
    Start-Sleep -Seconds 2
}
Write-Host ""
Write-Host "Launching MyVirtualCommunity Standalone Game..." -ForegroundColor Cyan

$gameArgList = @(
    "-serverUrl", "`"$ServerUrl`""
)
if ($ExtraGameArgs) {
    $gameArgList += $ExtraGameArgs
}

try {
    $gameProcess = Start-Process -FilePath $ExePath -ArgumentList ($gameArgList -join " ") -PassThru
    Write-Host "Game running (PID: $($gameProcess.Id)). Waiting for game exit..." -ForegroundColor Gray
    
    # Wait for game to exit
    $gameProcess.WaitForExit()
    Write-Host "Game closed (Exit code: $($gameProcess.ExitCode))." -ForegroundColor Gray
} finally {
    # 4. Clean Process Lifecycle Management
    if ($spawnedBackendProcess -and -not $isExistingBackend) {
        Write-Host "Shutting down launcher-spawned World Core backend..." -ForegroundColor Yellow
        try {
            $pidToKill = $spawnedBackendProcess.Id
            taskkill /pid $pidToKill /T /F 2>$null | Out-Null
            Write-Host "[OK] World Core backend stopped cleanly." -ForegroundColor Green
        } catch {
            Write-Host "[WARNING] Failed to terminate backend cleanly: $_" -ForegroundColor DarkYellow
        }
    } elseif ($isExistingBackend) {
        Write-Host "Pre-existing World Core backend remains running." -ForegroundColor Gray
    }
}

Write-Host ""
Write-Host "MyVirtualCommunity session ended." -ForegroundColor Cyan
exit 0
