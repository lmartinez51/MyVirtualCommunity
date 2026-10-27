# scripts/run-door-tests.ps1
$unityExe = "C:\Program Files\Unity\Hub\Editor\6000.3.25f1\Editor\Unity.exe"
$projectPath = (Resolve-Path "unity-client").Path
$logDir = (Resolve-Path ".").Path + "\logs"
if (-not (Test-Path $logDir)) {
    New-Item -ItemType Directory -Path $logDir | Out-Null
}
$logFile = "$logDir\door_tests.log"
if (Test-Path $logFile) {
    Remove-Item $logFile -Force
}

Write-Host "Running Interactive Door Unit & Collision Tests..." -ForegroundColor Cyan
Write-Host "Unity: $unityExe"
Write-Host "Project: $projectPath"
Write-Host "Log: $logFile"

$process = Start-Process -FilePath $unityExe -ArgumentList @(
    "-batchmode",
    "-quit",
    "-projectPath", $projectPath,
    "-executeMethod", "MyVirtualCommunity.Editor.InteractiveDoorTests.RunTests",
    "-logFile", $logFile
) -Wait -PassThru

Write-Host "Batchmode test run finished with exit code: $($process.ExitCode)"
if (Test-Path $logFile) {
    Get-Content $logFile | Select-String "InteractiveDoorTests"
}

exit $process.ExitCode
