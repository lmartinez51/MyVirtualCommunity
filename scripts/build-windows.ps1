# scripts/build-windows.ps1
# Reproducible Windows x64 Standalone Build script for MyVirtualCommunity
[CmdletBinding()]
param(
    [Parameter(Mandatory=$false)]
    [string]$UnityPath = "",

    [Parameter(Mandatory=$false)]
    [switch]$Clean
)

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$repoRoot = (Resolve-Path (Join-Path $scriptDir "..")).Path
$unityProjectPath = Join-Path $repoRoot "unity-client"
$outputDir = Join-Path $repoRoot "Builds\Windows"
$outputExe = Join-Path $outputDir "MyVirtualCommunity.exe"
$outputDataDir = Join-Path $outputDir "MyVirtualCommunity_Data"
$logsDir = Join-Path $repoRoot "logs"
$buildLog = Join-Path $logsDir "unity-build.log"

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "   MyVirtualCommunity - Windows x64 Build Script          " -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "Repository root:     $repoRoot"
Write-Host "Unity project path:  $unityProjectPath"
Write-Host "Output destination:  $outputExe"

# 1. Locate Unity Editor Executable
if (-not $UnityPath) {
    if ($env:UNITY_PATH -and (Test-Path $env:UNITY_PATH)) {
        $UnityPath = $env:UNITY_PATH
    } elseif ($env:UNITY_EXE -and (Test-Path $env:UNITY_EXE)) {
        $UnityPath = $env:UNITY_EXE
    } else {
        # Check standard Unity 6.3 LTS installation paths
        $candidates = @(
            "C:\Program Files\Unity\Hub\Editor\6000.3.25f1\Editor\Unity.exe",
            "C:\Program Files\Unity\Editor\Unity.exe"
        )
        
        # Also check any installed 6000.* editors in Unity Hub
        $hubEditors = Get-ChildItem -Path "C:\Program Files\Unity\Hub\Editor" -Directory -ErrorAction SilentlyContinue |
            Where-Object { $_.Name -like "6000.*" } |
            Sort-Object Name -Descending

        foreach ($editor in $hubEditors) {
            $candidatePath = Join-Path $editor.FullName "Editor\Unity.exe"
            if (Test-Path $candidatePath) {
                $candidates += $candidatePath
            }
        }

        foreach ($cand in $candidates) {
            if (Test-Path $cand) {
                $UnityPath = $cand
                break
            }
        }
    }
}

if (-not $UnityPath -or -not (Test-Path $UnityPath)) {
    Write-Error @"
[ERROR] Unity Editor executable was not found!
Please specify the path using the -UnityPath parameter or set the UNITY_PATH environment variable.
Example:
  .\scripts\build-windows.ps1 -UnityPath 'C:\Program Files\Unity\Hub\Editor\6000.3.25f1\Editor\Unity.exe'
"@
    exit 1
}

Write-Host "Unity executable:    $UnityPath" -ForegroundColor Green

# 2. Clean build folder if requested
if ($Clean) {
    if (Test-Path $outputDir) {
        Write-Host "Cleaning output directory: $outputDir..." -ForegroundColor Yellow
        Remove-Item -Path $outputDir -Recurse -Force
    }
}

# Ensure destination directories exist
if (-not (Test-Path $outputDir)) {
    New-Item -ItemType Directory -Path $outputDir -Force | Out-Null
}
if (-not (Test-Path $logsDir)) {
    New-Item -ItemType Directory -Path $logsDir -Force | Out-Null
}

# 3. Execute Unity Batchmode Build
Write-Host ""
Write-Host "Starting Unity batchmode build process..." -ForegroundColor Cyan
Write-Host "Build logs will be saved to: $buildLog"
$sw = [System.Diagnostics.Stopwatch]::StartNew()

$buildArgs = @(
    "-batchmode",
    "-nographics",
    "-quit",
    "-projectPath", "`"$unityProjectPath`"",
    "-executeMethod", "MyVirtualCommunity.Editor.MyVirtualCommunityBuild.BuildWindows64",
    "-logFile", "`"$buildLog`""
)

$psi = New-Object System.Diagnostics.ProcessStartInfo
$psi.FileName = $UnityPath
$psi.Arguments = $buildArgs -join " "
$psi.UseShellExecute = $false
$psi.RedirectStandardOutput = $false
$psi.RedirectStandardError = $false

$proc = [System.Diagnostics.Process]::Start($psi)
$proc.WaitForExit()
$exitCode = $proc.ExitCode

# Wait for any child Unity batchmode process associated with this project to finish
$targetProjectPath = (Resolve-Path $unityProjectPath).Path
while ($true) {
    $activeUnity = Get-CimInstance Win32_Process -Filter "Name = 'Unity.exe'" -ErrorAction SilentlyContinue |
        Where-Object { $_.CommandLine -like "*$unityProjectPath*" }
    if (-not $activeUnity) {
        break
    }
    Start-Sleep -Seconds 1
}

$sw.Stop()
Write-Host "Unity process finished (Duration: $([math]::Round($sw.Elapsed.TotalSeconds, 1))s)"

# 4. Verify Build Outputs
if ($exitCode -ne 0) {
    Write-Host ""
    Write-Host "---------------- BUILD LOG (TAIL 50 LINES) ----------------" -ForegroundColor Red
    if (Test-Path $buildLog) {
        Get-Content $buildLog -Tail 50 | Write-Host -ForegroundColor DarkRed
    }
    Write-Host "-----------------------------------------------------------" -ForegroundColor Red
    Write-Error "[BUILD FAILED] Unity reported exit code $exitCode. See log at: $buildLog"
    exit $exitCode
}

if (-not (Test-Path $outputExe)) {
    Write-Error "[BUILD FAILED] Executable '$outputExe' was not created. Check log at: $buildLog"
    exit 1
}

if (-not (Test-Path $outputDataDir)) {
    Write-Error "[BUILD FAILED] Data directory '$outputDataDir' was not created. Check log at: $buildLog"
    exit 1
}

# Deploy brand textures to build directories
$srcTextures = Join-Path $unityProjectPath "Assets\Textures"
if (Test-Path $srcTextures) {
    $destDataTextures = Join-Path $outputDataDir "Textures"
    $destDataStreaming = Join-Path $outputDataDir "StreamingAssets\Textures"
    $destRootTextures = Join-Path $outputDir "Textures"
    if (-not (Test-Path $destDataTextures)) { New-Item -ItemType Directory -Path $destDataTextures -Force | Out-Null }
    if (-not (Test-Path $destDataStreaming)) { New-Item -ItemType Directory -Path $destDataStreaming -Force | Out-Null }
    if (-not (Test-Path $destRootTextures)) { New-Item -ItemType Directory -Path $destRootTextures -Force | Out-Null }
    Get-ChildItem -Path $srcTextures -File | Where-Object { $_.Extension -ne ".meta" } | ForEach-Object {
        Copy-Item -Path $_.FullName -Destination (Join-Path $destDataTextures $_.Name) -Force
        Copy-Item -Path $_.FullName -Destination (Join-Path $destDataStreaming $_.Name) -Force
        Copy-Item -Path $_.FullName -Destination (Join-Path $destRootTextures $_.Name) -Force
    }
    Write-Host "[Build] Brand textures deployed to build output directories." -ForegroundColor Green
}

$exeItem = Get-Item $outputExe
$exeSizeMb = [math]::Round($exeItem.Length / 1MB, 2)

Write-Host ""
Write-Host "==========================================================" -ForegroundColor Green
Write-Host "   BUILD SUCCEEDED!                                       " -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Green
Write-Host "Executable:    $outputExe ($exeSizeMb MB)"
Write-Host "Data folder:   $outputDataDir"
Write-Host "Log file:      $buildLog"
Write-Host ""
exit 0
