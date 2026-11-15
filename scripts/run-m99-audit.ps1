# scripts/run-m99-audit.ps1
$unityExe = "C:\Program Files\Unity\Hub\Editor\6000.3.25f1\Editor\Unity.exe"
$projectPath = (Resolve-Path "unity-client").Path
$logFile = (Resolve-Path ".").Path + "\logs\m99_audit.log"

Write-Host "Running Milestone 99/100 Visual Audit..." -ForegroundColor Cyan
Write-Host "Unity: $unityExe"
Write-Host "Project: $projectPath"
Write-Host "Log: $logFile"

$process = Start-Process -FilePath $unityExe -ArgumentList @(
    "-batchmode",
    "-quit",
    "-projectPath", $projectPath,
    "-executeMethod", "MyVirtualCommunity.Editor.Milestone99AuditRunner.RunVisualAudit",
    "-logFile", $logFile
) -Wait -PassThru -NoNewWindow

Write-Host "Batchmode audit finished with exit code: $($process.ExitCode)"
exit $process.ExitCode
