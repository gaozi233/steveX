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
Write-Output "Imported $count textures for $Version to $destination"
