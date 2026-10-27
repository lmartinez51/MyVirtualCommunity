Add-Type -AssemblyName System.Drawing

$imgPath = "C:\Users\leolm\.gemini\antigravity\brain\d7915344-3afb-49b5-ba67-44ce67181048\.user_uploaded\media_1791795267795_34a7c417.jpg"
$img = [System.Drawing.Bitmap]::FromFile($imgPath)
Write-Host "Uploaded image size: $($img.Width) x $($img.Height)"

# Crop upper parapet sign (the red sign with oval logo)
# Let's inspect coordinates relative to width/height
# From photo: width is X, height is Y
# Upper sign: roughly X from ~15% to 85%, Y from ~15% to ~35%
# Awning sign: roughly X from ~5% to 95%, Y from ~35% to ~48%

$img.Dispose()
