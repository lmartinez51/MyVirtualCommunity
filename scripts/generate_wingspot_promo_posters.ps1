Add-Type -AssemblyName System.Drawing

function Create-RoundedRectanglePath([float]$x, [float]$y, [float]$w, [float]$h, [float]$r) {
    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    $d = $r * 2.0
    $path.AddArc($x, $y, $d, $d, 180, 90)
    $path.AddArc($x + $w - $d, $y, $d, $d, 270, 90)
    $path.AddArc($x + $w - $d, $y + $h - $d, $d, $d, 0, 90)
    $path.AddArc($x, $y + $h - $d, $d, $d, 90, 90)
    $path.CloseFigure()
    return $path
}

function Draw-CornerScrew($g, [float]$cx, [float]$cy, [float]$radius) {
    $washBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(210, 215, 225))
    $washPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(120, 125, 135), 1.5)
    $g.FillEllipse($washBrush, $cx - $radius, $cy - $radius, $radius * 2, $radius * 2)
    $g.DrawEllipse($washPen, $cx - $radius, $cy - $radius, $radius * 2, $radius * 2)

    $innerR = $radius - 3.5
    $domeBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(160, 165, 175))
    $domePen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(90, 95, 105), 1.0)
    $g.FillEllipse($domeBrush, $cx - $innerR, $cy - $innerR, $innerR * 2, $innerR * 2)
    $g.DrawEllipse($domePen, $cx - $innerR, $cy - $innerR, $innerR * 2, $innerR * 2)

    $slotPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(60, 65, 75), 2.0)
    $g.DrawLine($slotPen, $cx - $innerR + 2, $cy, $cx + $innerR - 2, $cy)
    $g.DrawLine($slotPen, $cx, $cy - $innerR + 2, $cx, $cy + $innerR - 2)
}

function Draw-PriceBadge($g, [float]$cx, [float]$cy, [float]$radius, [string]$priceText) {
    $bgBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
    $borderPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(18, 25, 38), 3.0)
    $g.FillEllipse($bgBrush, $cx - $radius, $cy - $radius, $radius * 2, $radius * 2)
    $g.DrawEllipse($borderPen, $cx - $radius, $cy - $radius, $radius * 2, $radius * 2)

    $font = New-Object System.Drawing.Font("Arial Black", 16, [System.Drawing.FontStyle]::Bold)
    $textBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(18, 25, 38))
    $sf = New-Object System.Drawing.StringFormat
    $sf.Alignment = [System.Drawing.StringAlignment]::Center
    $sf.LineAlignment = [System.Drawing.StringAlignment]::Center
    $rect = New-Object System.Drawing.RectangleF($cx - $radius, $cy - $radius + 1, $radius * 2, $radius * 2)
    $g.DrawString($priceText, $font, $textBrush, $rect, $sf)
}

function Draw-DottedVLine($g, [float]$x, [float]$y1, [float]$y2, [float]$spacing, [float]$dotR, $color) {
    $brush = New-Object System.Drawing.SolidBrush($color)
    for ($y = $y1; $y -le $y2; $y += $spacing) {
        $g.FillEllipse($brush, $x - $dotR, $y - $dotR, $dotR * 2, $dotR * 2)
    }
}

function Draw-DottedHLine($g, [float]$x1, [float]$x2, [float]$y, [float]$spacing, [float]$dotR, $color) {
    $brush = New-Object System.Drawing.SolidBrush($color)
    for ($x = $x1; $x -le $x2; $x += $spacing) {
        $g.FillEllipse($brush, $x - $dotR, $y - $dotR, $dotR * 2, $dotR * 2)
    }
}

# =========================================================================
# GENERATE BOARD 1: LUNES - MARTES (1280 x 560)
# =========================================================================
$w1 = 1280
$h1 = 560
$bmp1 = New-Object System.Drawing.Bitmap $w1, $h1
$g1 = [System.Drawing.Graphics]::FromImage($bmp1)
$g1.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g1.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::ClearTypeGridFit

# Outer black/dark charcoal frame with rounded corners
$g1.Clear([System.Drawing.Color]::FromArgb(26, 28, 32))
$outerPath1 = Create-RoundedRectanglePath 4 4 ($w1 - 8) ($h1 - 8) 18
$outerPen1 = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(65, 70, 80), 3.5)
$g1.DrawPath($outerPen1, $outerPath1)

Draw-CornerScrew $g1 24 24 11
Draw-CornerScrew $g1 ($w1 - 24) 24 11
Draw-CornerScrew $g1 24 ($h1 - 24) 11
Draw-CornerScrew $g1 ($w1 - 24) ($h1 - 24) 11

# Top Header Strip: Parchment / Bone finish
$headerY = 18
$headerH = 92
$headerPath1 = Create-RoundedRectanglePath 18 $headerY ($w1 - 36) $headerH 10
$parchBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(224, 216, 202))
$g1.FillPath($parchBrush, $headerPath1)

# Wing Spot Logo badge on top left
$logoX = 36
$logoY = $headerY + 16
$logoW = 120
$logoH = 60
$logoPath = Create-RoundedRectanglePath $logoX $logoY $logoW $logoH 10
$logoBg = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(192, 34, 30))
$logoBorder = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(242, 196, 42), 3)
$g1.FillPath($logoBg, $logoPath)
$g1.DrawPath($logoBorder, $logoPath)

# Wings on badge
$wingBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(242, 196, 42))
$g1.FillPolygon($wingBrush, @(
    (New-Object System.Drawing.PointF($logoX - 8, $logoY + 30)),
    (New-Object System.Drawing.PointF($logoX + 2, $logoY + 18)),
    (New-Object System.Drawing.PointF($logoX + 2, $logoY + 42))
))
$g1.FillPolygon($wingBrush, @(
    (New-Object System.Drawing.PointF($logoX + $logoW + 8, $logoY + 30)),
    (New-Object System.Drawing.PointF($logoX + $logoW - 2, $logoY + 18)),
    (New-Object System.Drawing.PointF($logoX + $logoW - 2, $logoY + 42))
))
$logoFont = New-Object System.Drawing.Font("Arial Black", 12, [System.Drawing.FontStyle]::Bold)
$logoTextBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
$sfCenter = New-Object System.Drawing.StringFormat
$sfCenter.Alignment = [System.Drawing.StringAlignment]::Center
$sfCenter.LineAlignment = [System.Drawing.StringAlignment]::Center
$g1.DrawString("WING SPOT", $logoFont, $logoTextBrush, (New-Object System.Drawing.RectangleF($logoX, $logoY, $logoW, $logoH)), $sfCenter)

# Center vertical dotted divider across header
$midX1 = [math]::Floor($w1 / 2)
Draw-DottedVLine $g1 $midX1 ($headerY + 10) ($headerY + $headerH - 10) 9 3 ([System.Drawing.Color]::FromArgb(140, 130, 120))

# Day Headers: Western stylized block letters
$dayFont = New-Object System.Drawing.Font("Impact", 42, [System.Drawing.FontStyle]::Regular)
$dayShadow = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(170, 160, 145))
$dayBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(45, 40, 35))

# LUNES
$lunesRect = New-Object System.Drawing.RectangleF(170, $headerY + 4, ($midX1 - 180), $headerH)
$lunesRectS = New-Object System.Drawing.RectangleF(172, $headerY + 6, ($midX1 - 180), $headerH)
$g1.DrawString("L U N E S", $dayFont, $dayShadow, $lunesRectS, $sfCenter)
$g1.DrawString("L U N E S", $dayFont, $dayBrush, $lunesRect, $sfCenter)

# MARTES
$martesRect = New-Object System.Drawing.RectangleF($midX1 + 10, $headerY + 4, ($w1 - $midX1 - 30), $headerH)
$martesRectS = New-Object System.Drawing.RectangleF($midX1 + 12, $headerY + 6, ($w1 - $midX1 - 30), $headerH)
$g1.DrawString("M A R T E S", $dayFont, $dayShadow, $martesRectS, $sfCenter)
$g1.DrawString("M A R T E S", $dayFont, $dayBrush, $martesRect, $sfCenter)

# Main Slate Chalkboard Body
$bodyY = 120
$bodyH = $h1 - 22 - $bodyY
$bodyPath1 = Create-RoundedRectanglePath 18 $bodyY ($w1 - 36) $bodyH 14
$slateBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(18, 25, 38))
$slateBorderPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(225, 230, 240), 3.5)
$g1.FillPath($slateBrush, $bodyPath1)
$g1.DrawPath($slateBorderPen, $bodyPath1)

# Center vertical dotted divider across body
Draw-DottedVLine $g1 $midX1 ($bodyY + 14) ($bodyY + $bodyH - 14) 11 3.5 ([System.Drawing.Color]::FromArgb(210, 220, 235))

# Row divider Y
$rowDivY = $bodyY + [math]::Floor($bodyH / 2)

# --- LUNES COLUMN ---
$lunesLeft = 46
$lunesRight = $midX1 - 40
$lunesFont = New-Object System.Drawing.Font("Arial Black", 21, [System.Drawing.FontStyle]::Bold)
$whiteBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
$sfLeft = New-Object System.Drawing.StringFormat
$sfLeft.Alignment = [System.Drawing.StringAlignment]::Near
$sfLeft.LineAlignment = [System.Drawing.StringAlignment]::Center

# Row 1: - 2 SPOT BURGERS
$lunesRow1Rect = New-Object System.Drawing.RectangleF($lunesLeft, $bodyY + 20, ($lunesRight - $lunesLeft - 100), 80)
$g1.DrawString("- 2 SPOT BURGERS", $lunesFont, $whiteBrush, $lunesRow1Rect, $sfLeft)
Draw-PriceBadge $g1 ($lunesRight - 45) ($bodyY + 60) 38 "S 99"

# Dotted HLine
Draw-DottedHLine $g1 $lunesLeft $lunesRight $rowDivY 11 3.0 ([System.Drawing.Color]::FromArgb(120, 135, 160))

# Row 2: - 2 SPOT JUNIOR.
$lunesRow2Rect = New-Object System.Drawing.RectangleF($lunesLeft, $rowDivY + 25, ($lunesRight - $lunesLeft - 100), 80)
$g1.DrawString("- 2 SPOT JUNIOR.", $lunesFont, $whiteBrush, $lunesRow2Rect, $sfLeft)
Draw-PriceBadge $g1 ($lunesRight - 45) ($rowDivY + 65) 38 "S 89"

# --- MARTES COLUMN ---
$martesLeft = $midX1 + 46
$martesRight = $w1 - 46
$comboTitleFont = New-Object System.Drawing.Font("Arial Black", 20, [System.Drawing.FontStyle]::Bold)
$comboSubFont = New-Object System.Drawing.Font("Arial Black", 16, [System.Drawing.FontStyle]::Bold)
$subBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(215, 225, 240))

# Top Combo: COMBO POWER
$g1.DrawString("COMBO POWER", $comboTitleFont, $whiteBrush, $martesLeft, $bodyY + 24)
$g1.DrawString("-PAPAS FRANCESAS", $comboSubFont, $subBrush, $martesLeft + 12, $bodyY + 56)
$g1.DrawString("-REFRESCO", $comboSubFont, $subBrush, $martesLeft + 12, $bodyY + 84)
Draw-PriceBadge $g1 ($martesRight - 45) ($bodyY + 66) 38 "S 145"

# Dotted HLine
Draw-DottedHLine $g1 $martesLeft $martesRight $rowDivY 11 3.0 ([System.Drawing.Color]::FromArgb(120, 135, 160))

# Bottom Combo: COMBO SPOT CHICKEN
$g1.DrawString("COMBO SPOT CHICKEN.", $comboTitleFont, $whiteBrush, $martesLeft, $rowDivY + 24)
$g1.DrawString("-PAPAS FRANCESAS.", $comboSubFont, $subBrush, $martesLeft + 12, $rowDivY + 56)
$g1.DrawString("-REFRESCO.", $comboSubFont, $subBrush, $martesLeft + 12, $rowDivY + 84)
Draw-PriceBadge $g1 ($martesRight - 45) ($rowDivY + 66) 38 "S 120"


# =========================================================================
# GENERATE BOARD 2: MIERCOLES - JUEVES (1080 x 560)
# =========================================================================
$w2 = 1080
$h2 = 560
$bmp2 = New-Object System.Drawing.Bitmap $w2, $h2
$g2 = [System.Drawing.Graphics]::FromImage($bmp2)
$g2.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g2.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::ClearTypeGridFit

$g2.Clear([System.Drawing.Color]::FromArgb(26, 28, 32))
$outerPath2 = Create-RoundedRectanglePath 4 4 ($w2 - 8) ($h2 - 8) 18
$outerPen2 = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(65, 70, 80), 3.5)
$g2.DrawPath($outerPen2, $outerPath2)

Draw-CornerScrew $g2 24 24 11
Draw-CornerScrew $g2 ($w2 - 24) 24 11
Draw-CornerScrew $g2 24 ($h2 - 24) 11
Draw-CornerScrew $g2 ($w2 - 24) ($h2 - 24) 11

$headerPath2 = Create-RoundedRectanglePath 18 $headerY ($w2 - 36) $headerH 10
$g2.FillPath($parchBrush, $headerPath2)

$midX2 = [math]::Floor($w2 / 2)
Draw-DottedVLine $g2 $midX2 ($headerY + 10) ($headerY + $headerH - 10) 9 3 ([System.Drawing.Color]::FromArgb(140, 130, 120))

# MIERCOLES
$miercolesRect = New-Object System.Drawing.RectangleF(20, $headerY + 4, ($midX2 - 30), $headerH)
$miercolesRectS = New-Object System.Drawing.RectangleF(22, $headerY + 6, ($midX2 - 30), $headerH)
$g2.DrawString("M I E R C O L E S", $dayFont, $dayShadow, $miercolesRectS, $sfCenter)
$g2.DrawString("M I E R C O L E S", $dayFont, $dayBrush, $miercolesRect, $sfCenter)

# JUEVES
$juevesRect = New-Object System.Drawing.RectangleF($midX2 + 10, $headerY + 4, ($w2 - $midX2 - 30), $headerH)
$juevesRectS = New-Object System.Drawing.RectangleF($midX2 + 12, $headerY + 6, ($w2 - $midX2 - 30), $headerH)
$g2.DrawString("J U E V E S", $dayFont, $dayShadow, $juevesRectS, $sfCenter)
$g2.DrawString("J U E V E S", $dayFont, $dayBrush, $juevesRect, $sfCenter)

# Slate Body
$bodyPath2 = Create-RoundedRectanglePath 18 $bodyY ($w2 - 36) $bodyH 14
$g2.FillPath($slateBrush, $bodyPath2)
$g2.DrawPath($slateBorderPen, $bodyPath2)

Draw-DottedVLine $g2 $midX2 ($bodyY + 14) ($bodyY + $bodyH - 14) 11 3.5 ([System.Drawing.Color]::FromArgb(210, 220, 235))

# --- MIERCOLES COLUMN ---
$mierLeft = 40
$mierRight = $midX2 - 36

# Top Combo: COMBO PHILADELPHIA
$g2.DrawString("COMBO PHILADELPHIA", $comboTitleFont, $whiteBrush, $mierLeft, $bodyY + 24)
$g2.DrawString("-PAPAS", $comboSubFont, $subBrush, $mierLeft + 12, $bodyY + 56)
$g2.DrawString("-REFRESCO", $comboSubFont, $subBrush, $mierLeft + 12, $bodyY + 84)
Draw-PriceBadge $g2 ($mierRight - 45) ($bodyY + 66) 38 "S 125"

Draw-DottedHLine $g2 $mierLeft $mierRight $rowDivY 11 3.0 ([System.Drawing.Color]::FromArgb(120, 135, 160))

# Bottom Combo: COMBO SPOT BURGER
$g2.DrawString("COMBO SPOT BURGER", $comboTitleFont, $whiteBrush, $mierLeft, $rowDivY + 24)
$g2.DrawString("-PAPAS FRANCESAS", $comboSubFont, $subBrush, $mierLeft + 12, $rowDivY + 56)
$g2.DrawString("-REFRESCO", $comboSubFont, $subBrush, $mierLeft + 12, $rowDivY + 84)
Draw-PriceBadge $g2 ($mierRight - 45) ($rowDivY + 66) 38 "S 115"

# --- JUEVES COLUMN ---
$juevLeft = $midX2 + 40
$juevRight = $w2 - 40

# Top Combo: COMBO POP CHICKEN
$g2.DrawString("COMBO POP CHICKEN", $comboTitleFont, $whiteBrush, $juevLeft, $bodyY + 24)
$g2.DrawString("-PAPAS FRANCESAS", $comboSubFont, $subBrush, $juevLeft + 12, $bodyY + 56)
$g2.DrawString("-REFRESCO", $comboSubFont, $subBrush, $juevLeft + 12, $bodyY + 84)
Draw-PriceBadge $g2 ($juevRight - 45) ($bodyY + 66) 38 "S 125"

Draw-DottedHLine $g2 $juevLeft $juevRight $rowDivY 11 3.0 ([System.Drawing.Color]::FromArgb(120, 135, 160))

# Bottom Combo: COMBO JALAPENO
$g2.DrawString("COMBO JALAPENO", $comboTitleFont, $whiteBrush, $juevLeft, $rowDivY + 24)
$g2.DrawString("-PAPAS FRANCESAS", $comboSubFont, $subBrush, $juevLeft + 12, $rowDivY + 56)
$g2.DrawString("-REFRESCO", $comboSubFont, $subBrush, $juevLeft + 12, $rowDivY + 84)
Draw-PriceBadge $g2 ($juevRight - 45) ($rowDivY + 66) 38 "S 125"


# =========================================================================
# SAVE TO TARGET DIRECTORIES
# =========================================================================
$targetDirs = @(
    "unity-client\Assets\Textures",
    "unity-client\Assets\StreamingAssets\Textures",
    "Builds\Windows\Textures",
    "Builds\Windows\MyVirtualCommunity_Data\Textures",
    "Builds\Windows\MyVirtualCommunity_Data\StreamingAssets\Textures"
)

foreach ($dir in $targetDirs) {
    if (-not (Test-Path $dir)) {
        New-Item -ItemType Directory -Path $dir -Force | Out-Null
    }
    $p1 = Join-Path $dir "WingSpot_Promo_Lunes_Martes.png"
    $p2 = Join-Path $dir "WingSpot_Promo_Miercoles_Jueves.png"
    $bmp1.Save($p1, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp2.Save($p2, [System.Drawing.Imaging.ImageFormat]::Png)
}

$g1.Dispose()
$bmp1.Dispose()
$g2.Dispose()
$bmp2.Dispose()

Write-Host "Wing Spot Promotional Posters Generated Successfully!"
