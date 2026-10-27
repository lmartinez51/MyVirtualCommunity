Add-Type -AssemblyName System.Drawing

$t1 = "unity-client\Assets\Textures\TiaLupe_Fascia_Sign.png"
$t2 = "unity-client\Assets\Textures\TiaLupe_Awning_Real.png"

$b1 = [System.Drawing.Bitmap]::FromFile((Resolve-Path $t1).Path)
Write-Host "TiaLupe_Fascia_Sign: $($b1.Width) x $($b1.Height)"
$b1.Dispose()

$b2 = [System.Drawing.Bitmap]::FromFile((Resolve-Path $t2).Path)
Write-Host "TiaLupe_Awning_Real: $($b2.Width) x $($b2.Height)"
$b2.Dispose()
