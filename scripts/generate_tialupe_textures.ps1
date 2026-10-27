Add-Type -AssemblyName System.Drawing

# 1. Generate TiaLupe_Valance_Stripes.png (1024 x 128)
$valanceWidth = 1024
$valanceHeight = 128
$valanceBmp = New-Object System.Drawing.Bitmap $valanceWidth, $valanceHeight
$vg = [System.Drawing.Graphics]::FromImage($valanceBmp)
$vg.Clear([System.Drawing.Color]::White)

$numStripes = 28
$stripeW = $valanceWidth / $numStripes
$blackBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 22, 22, 26))

for ($i = 0; $i -lt $numStripes; $i += 2) {
    $x = [float]($i * $stripeW)
    $vg.FillRectangle($blackBrush, $x, 0.0, [float]$stripeW, [float]$valanceHeight)
}
$vg.Dispose()

# 2. Generate TiaLupe_Awning_Front.png using stripes + clean oval badge from Fascia Sign
$awningWidth = 1024
$awningHeight = 512
$awningBmp = New-Object System.Drawing.Bitmap $awningWidth, $awningHeight
$ag = [System.Drawing.Graphics]::FromImage($awningBmp)
$ag.Clear([System.Drawing.Color]::White)
$ag.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$ag.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality

$awningStripeW = $awningWidth / $numStripes
for ($i = 0; $i -lt $numStripes; $i += 2) {
    $x = [float]($i * $awningStripeW)
    $ag.FillRectangle($blackBrush, $x, 0.0, [float]$awningStripeW, [float]$awningHeight)
}

# Load Fascia Sign to copy the authentic oval logo badge
$fasciaPath = "c:\Users\leolm\Desktop\Proyectos_AI\MyVirtualCommunity\unity-client\Assets\Textures\TiaLupe_Fascia_Sign.png"
if (Test-Path $fasciaPath) {
    $fileBytes = [System.IO.File]::ReadAllBytes($fasciaPath)
    $ms = New-Object System.IO.MemoryStream(,$fileBytes)
    $fasciaBmp = [System.Drawing.Bitmap]::FromStream($ms)
    
    # Destination oval badge in center of awning: W: 640, H: 360
    $destRect = New-Object System.Drawing.Rectangle 192, 76, 640, 360
    $srcRect = New-Object System.Drawing.Rectangle 180, 50, 664, 412
    
    # Clip drawing to an ellipse to keep it super clean
    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    $path.AddEllipse($destRect)
    $ag.SetClip($path)
    $ag.DrawImage($fasciaBmp, $destRect, $srcRect, [System.Drawing.GraphicsUnit]::Pixel)
    $ag.ResetClip()
    
    # Draw orange and dark borders around oval
    $borderPen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(255, 235, 100, 30)), 6.0
    $ag.DrawEllipse($borderPen, $destRect)
    $outerPen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(255, 25, 25, 25)), 3.0
    $ag.DrawEllipse($outerPen, (New-Object System.Drawing.Rectangle 189, 73, 646, 366))
    
    $borderPen.Dispose()
    $outerPen.Dispose()
    $path.Dispose()
    $fasciaBmp.Dispose()
    $ms.Dispose()
}
$ag.Dispose()
$blackBrush.Dispose()

# Save textures to all target directories
$targetDirs = @(
    "c:\Users\leolm\Desktop\Proyectos_AI\MyVirtualCommunity\unity-client\Assets\Textures",
    "c:\Users\leolm\Desktop\Proyectos_AI\MyVirtualCommunity\unity-client\Assets\StreamingAssets\Textures",
    "c:\Users\leolm\Desktop\Proyectos_AI\MyVirtualCommunity\unity-client\Assets\Resources\Textures"
)

foreach ($dir in $targetDirs) {
    if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
    $valanceBmp.Save((Join-Path $dir "TiaLupe_Valance_Stripes.png"), [System.Drawing.Imaging.ImageFormat]::Png)
    $awningBmp.Save((Join-Path $dir "TiaLupe_Awning_Front.png"), [System.Drawing.Imaging.ImageFormat]::Png)
}

$valanceBmp.Dispose()
$awningBmp.Dispose()
Write-Host "Tia Lupe awning and valance textures generated successfully."
