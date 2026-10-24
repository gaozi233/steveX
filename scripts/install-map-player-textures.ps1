param([Parameter(Mandatory=$true)][string]$ClientJar, [Parameter(Mandatory=$true)][string]$Destination)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$destinationRoot = [IO.Path]::GetFullPath($Destination)
$zip = [IO.Compression.ZipFile]::OpenRead([IO.Path]::GetFullPath($ClientJar))
try {
    $versionEntry = $zip.GetEntry('version.json')
    if (-not $versionEntry) { throw 'Client JAR has no version.json' }
    $reader = [IO.StreamReader]::new($versionEntry.Open())
    try { $version = $reader.ReadToEnd() | ConvertFrom-Json } finally { $reader.Dispose() }
    if ($version.id -ne '1.21.11') { throw 'Player textures require a Minecraft 1.21.11 client JAR' }
    foreach ($entry in $zip.Entries) {
        $name = $entry.FullName
        $relative = $null
        if ($name -match '^assets/minecraft/textures/entity/player/((slim|wide)/[a-z]+\.png)$') { $relative = 'skins/' + $Matches[1] }
        elseif ($name -match '^assets/minecraft/textures/entity/equipment/((humanoid|humanoid_leggings|wings)/[a-z_]+\.png)$') { $relative = 'textures/armor/' + $Matches[1] }
        elseif ($name -match '^assets/minecraft/textures/(item|block)/([a-z0-9_]+\.png)$') {
            $folder = if ($Matches[1] -eq 'item') { 'items' } else { 'blocks' }
            $relative = 'textures/' + $folder + '/' + $Matches[2]
        }
        elseif ($name -eq 'assets/minecraft/textures/entity/shield_base_nopattern.png') { $relative = 'textures/items/shield.png' }
        if ($relative) {
            $target = [IO.Path]::GetFullPath([IO.Path]::Combine($destinationRoot, $relative))
            if (-not $target.StartsWith($destinationRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { throw 'Invalid texture path' }
            [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($target)) | Out-Null
            [IO.Compression.ZipFileExtensions]::ExtractToFile($entry, $target, $true)
        }
    }
} finally { $zip.Dispose() }
