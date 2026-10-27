$unityExe = "C:\Program Files\Unity\Hub\Editor\6000.3.25f1\Editor\Unity.exe"
$projectPath = (Resolve-Path "unity-client").Path
$logDir = (Resolve-Path ".").Path + "\logs"
if (-not (Test-Path $logDir)) {
    New-Item -ItemType Directory -Path $logDir | Out-Null
}
$logFile = "$logDir\unity_audit.log"

Write-Host "Running Unity Visual Audit Runner..."
$process = Start-Process -FilePath $unityExe -ArgumentList @(
    "-batchmode",
    "-quit",
    "-projectPath", $projectPath,
    "-executeMethod", "MyVirtualCommunity.Editor.CarVisualAuditRunner.CaptureCarScreenshots",
    "-logFile", $logFile
) -Wait -PassThru -NoNewWindow

Write-Host "Exit code: $($process.ExitCode)"
if (Test-Path $logFile) {
    Get-Content $logFile -Tail 40
}
