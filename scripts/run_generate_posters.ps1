$csPath = Join-Path (Get-Location).Path "scripts\GeneratePosters.cs"
Add-Type -Path $csPath -ReferencedAssemblies "System.Drawing"
[PosterGenerator]::GenerateAll((Get-Location).Path)
Write-Host "Posters generated successfully with GDI+ C#!"
