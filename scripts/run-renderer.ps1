param(
    [string]$Server = '127.0.0.1:25565',
    [int]$Port = 25550,
    [switch]$Continuous,
    [switch]$ShowWindow
)
$ErrorActionPreference = 'Stop'
$Address = [Uri]("tcp://" + $Server)
$Deadline = [DateTime]::UtcNow.AddSeconds(60)
Write-Host "Waiting for Minecraft server $Server..."
while ($true) {
    $Client = [System.Net.Sockets.TcpClient]::new()
    try {
        $Connect = $Client.ConnectAsync($Address.Host, $Address.Port)
        if ($Connect.Wait(1000) -and $Client.Connected) { break }
    } catch {
        # The server may still be generating its world.
    } finally {
        $Client.Dispose()
    }
    if ([DateTime]::UtcNow -ge $Deadline) { throw "Minecraft server $Server was not reachable within 60 seconds" }
    Start-Sleep -Milliseconds 250
}
$BridgeRoot = Split-Path -Parent $PSScriptRoot
$ModRoot = Join-Path $BridgeRoot 'vendor/stevex-template-1.21.11'
$GameRoot = Join-Path $ModRoot 'run-renderer'
New-Item -ItemType Directory -Force -Path $GameRoot | Out-Null
$OptionsFile = Join-Path $GameRoot 'options.txt'
if (-not (Test-Path -LiteralPath $OptionsFile)) {
    Copy-Item -LiteralPath (Join-Path $BridgeRoot 'configs/render-options.txt') -Destination $OptionsFile
}
Push-Location $ModRoot
try {
    $OnDemand = if ($Continuous) { 'false' } else { 'true' }
    $Hidden = if ($ShowWindow) { 'false' } else { 'true' }
    Write-Host "On-demand world rendering: $OnDemand"
    & .\gradlew.bat runRenderer "-Dstevex.render.server=$Server" "-Dstevex.render.port=$Port" "-Dstevex.render.onDemand=$OnDemand" "-Dstevex.render.hidden=$Hidden" --console=plain
    if ($LASTEXITCODE -ne 0) { throw "Renderer exited with code $LASTEXITCODE" }
} finally {
    Pop-Location
}
