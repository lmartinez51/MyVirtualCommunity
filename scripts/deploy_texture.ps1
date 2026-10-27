$src = "unity-client\Assets\Textures\TiaLupe_Lateral_Sign.png"
$dirs = @(
    "unity-client\Assets\StreamingAssets\Textures",
    "Builds\Windows\Textures",
    "Builds\Windows\MyVirtualCommunity_Data\Textures",
    "Builds\Windows\MyVirtualCommunity_Data\StreamingAssets\Textures"
)
foreach ($d in $dirs) {
    if (-not (Test-Path $d)) { New-Item -ItemType Directory -Path $d -Force | Out-Null }
    Copy-Item $src (Join-Path $d "TiaLupe_Lateral_Sign.png") -Force
}
Write-Host "Copied TiaLupe_Lateral_Sign.png to all target directories."
