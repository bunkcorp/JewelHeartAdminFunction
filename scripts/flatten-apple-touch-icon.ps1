Add-Type -AssemblyName System.Drawing
$p = (Join-Path $PSScriptRoot '..\assets\web-app\apple-touch-icon.png' | Resolve-Path).Path
$src = [System.Drawing.Image]::FromFile($p)
$bmp = New-Object System.Drawing.Bitmap($src.Width, $src.Height, [System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.Clear([System.Drawing.Color]::FromArgb(91, 182, 232))
$g.DrawImage($src, 0, 0, $src.Width, $src.Height)
$src.Dispose()
$g.Dispose()
$bmp.Save($p, [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()
Write-Output "flattened $p"
