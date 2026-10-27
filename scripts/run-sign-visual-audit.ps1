# scripts/run-sign-visual-audit.ps1
$unityExe = "C:\Program Files\Unity\Hub\Editor\6000.3.25f1\Editor\Unity.exe"
$projectPath = (Resolve-Path "unity-client").Path
$logDir = (Resolve-Path ".").Path + "\logs"
if (-not (Test-Path $logDir)) {
    New-Item -ItemType Directory -Path $logDir | Out-Null
}
$logFile = "$logDir\sign_audit.log"
if (Test-Path $logFile) {
    Remove-Item $logFile -Force
}

Write-Host "Running Business Status Sign Visual Audit Runner..." -ForegroundColor Cyan
Write-Host "Unity: $unityExe"
Write-Host "Project: $projectPath"
Write-Host "Log: $logFile"

$process = Start-Process -FilePath $unityExe -ArgumentList @(
    "-batchmode",
    "-quit",
    "-projectPath", $projectPath,
    "-executeMethod", "MyVirtualCommunity.Editor.SignVisualAuditRunner.RunVisualAudit",
    "-logFile", $logFile
) -Wait -PassThru

Write-Host "Batchmode visual audit finished with exit code: $($process.ExitCode)"
if (Test-Path $logFile) {
    Get-Content $logFile | Select-String "SignVisualAuditRunner"
}

exit $process.ExitCode
