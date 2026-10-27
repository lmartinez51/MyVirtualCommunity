# scripts/create-desktop-shortcut.ps1
# Creates a Windows Desktop shortcut for MyVirtualCommunity
[CmdletBinding()]
param(
    [Parameter(Mandatory=$false)]
    [switch]$DirectExe
)

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$repoRoot = (Resolve-Path (Join-Path $scriptDir "..")).Path
$desktopPath = [System.Environment]::GetFolderPath([System.Environment+SpecialFolder]::Desktop)
$shortcutPath = Join-Path $desktopPath "MyVirtualCommunity.lnk"

$launcherBat = Join-Path $repoRoot "Launch-MyVirtualCommunity.bat"
$gameExe = Join-Path $repoRoot "Builds\Windows\MyVirtualCommunity.exe"

$targetPath = $launcherBat
$arguments = ""
$iconLocation = $gameExe

if ($DirectExe) {
    if (-not (Test-Path $gameExe)) {
        Write-Warning "Direct executable '$gameExe' not found. It will be built upon first run."
    }
    $targetPath = $gameExe
}

Write-Host "Creating desktop shortcut..." -ForegroundColor Cyan
Write-Host "Destination:      $shortcutPath"
Write-Host "Target:           $targetPath"
Write-Host "Working Directory:$repoRoot"

$wshShell = New-Object -ComObject WScript.Shell
$shortcut = $wshShell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = $targetPath
$shortcut.WorkingDirectory = $repoRoot
$shortcut.Description = "MyVirtualCommunity - Persistent Virtual World (Ciudad Juarez - El Paso)"

if (Test-Path $iconLocation) {
    $shortcut.IconLocation = "$iconLocation,0"
}

$shortcut.Save()

Write-Host ""
Write-Host "[SUCCESS] Shortcut created on Desktop: $shortcutPath" -ForegroundColor Green
