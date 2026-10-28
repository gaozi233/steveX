param(
  [Parameter(Mandatory=$true)][string]$ClientJar,
  [Parameter(Mandatory=$true)][ValidatePattern('^[0-9][0-9.a-z_-]{0,40}$')][string]$Version
)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../runs/web-item-textures'))
$destination = [IO.Path]::GetFullPath((Join-Path $root $Version))
if (-not $destination.StartsWith($root + [IO.Path]::DirectorySeparatorChar)) { throw 'Invalid destination' }
[IO.Directory]::CreateDirectory($destination) | Out-Null
$zip = [IO.Compression.ZipFile]::OpenRead((Resolve-Path -LiteralPath $ClientJar))
$count = 0
try {
  # Flat block textures are a fallback, not a full Minecraft item-model renderer.
  foreach ($kind in @('block', 'item')) {
    foreach ($entry in $zip.Entries) {
      if ($entry.FullName -cmatch "^assets/minecraft/textures/$kind/([a-z0-9_]+)\.png$") {
        [IO.Compression.ZipFileExtensions]::ExtractToFile($entry, (Join-Path $destination ($Matches[1] + '.png')), $true)
        $count++
      }
    }
  }
} finally { $zip.Dispose() }
# Many blocks ship only per-face textures (furnace_front/side/top). The panel asks
# for one name per item, so alias the most representative face when no flat texture
# with the plain block name exists. Existing files are never overwritten.
$faces = @('front', 'side', 'top', 'bottom', 'back', 'north', 'south', 'east', 'west')
$existing = @{}
foreach ($file in [IO.Directory]::GetFiles($destination, '*.png')) { $existing[[IO.Path]::GetFileNameWithoutExtension($file)] = $file }
$aliased = 0
foreach ($name in @($existing.Keys)) {
  foreach ($face in $faces) {
    if (-not $name.EndsWith("_$face")) { continue }
    $target = $name.Substring(0, $name.Length - $face.Length - 1)
    if (-not $target -or $existing.ContainsKey($target)) { continue }
    $copy = Join-Path $destination ($target + '.png')
    [IO.File]::Copy($existing[$name], $copy, $false)
    $existing[$target] = $copy
    $aliased++
  }
}
Write-Output "Aliased $aliased multi-face textures"
Write-Output "Imported $count textures for $Version to $destination"
