Add-Type -AssemblyName System.Drawing

$imgPath = "C:\Users\leolm\.gemini\antigravity\brain\d7915344-3afb-49b5-ba67-44ce67181048\.user_uploaded\media_1791795267795_34a7c417.jpg"
$img = [System.Drawing.Bitmap]::FromFile($imgPath)

# 1. Upper Parapet Sign
# In photo: upper red box is roughly X: 95 to 495, Y: 140 to 310
# Width: 400, Height: 170
$cropParapet = New-Object System.Drawing.Bitmap 400, 170
$g1 = [System.Drawing.Graphics]::FromImage($cropParapet)
$g1.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$srcRect1 = New-Object System.Drawing.Rectangle 95, 140, 400, 170
$destRect1 = New-Object System.Drawing.Rectangle 0, 0, 400, 170
$g1.DrawImage($img, $destRect1, $srcRect1, [System.Drawing.GraphicsUnit]::Pixel)
$g1.Dispose()

$outParapet = "unity-client\Assets\Textures\TiaLupe_Lateral_Sign.png"
$cropParapet.Save($outParapet, [System.Drawing.Imaging.ImageFormat]::Png)
$cropParapet.Dispose()
Write-Host "Saved TiaLupe_Lateral_Sign.png"

# 2. Awning Slope Face
# In photo: awning front sloped face is roughly X: 10, Y: 310, Width: 500, Height: 120
$cropAwning = New-Object System.Drawing.Bitmap 500, 120
$g2 = [System.Drawing.Graphics]::FromImage($cropAwning)
$g2.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$srcRect2 = New-Object System.Drawing.Rectangle 10, 310, 500, 120
$destRect2 = New-Object System.Drawing.Rectangle 0, 0, 500, 120
$g2.DrawImage($img, $destRect2, $srcRect2, [System.Drawing.GraphicsUnit]::Pixel)
$g2.Dispose()

$outAwning = "unity-client\Assets\Textures\TiaLupe_Lateral_Awning.png"
$cropAwning.Save($outAwning, [System.Drawing.Imaging.ImageFormat]::Png)
$cropAwning.Dispose()
Write-Host "Saved TiaLupe_Lateral_Awning.png"

$img.Dispose()
