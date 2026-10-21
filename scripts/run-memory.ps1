param(
    [Parameter(Mandatory = $true)][string]$Agent,
    [switch]$Launch,
    [switch]$Verify,
    [switch]$ShowWindow
)
$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
Push-Location $Root
try {
    $Prepared = & node (Join-Path $PSScriptRoot 'prepare-memory-debug.js') $Agent
    if ($LASTEXITCODE -ne 0) { throw 'Memory debug preparation failed' }
    $Debug = $Prepared | ConvertFrom-Json
    Write-Host "Memory debug snapshot: $($Debug.gameDir)"
    if ($Launch -or $Verify) {
        $Hidden = if ($ShowWindow) { 'false' } else { 'true' }
        Push-Location (Join-Path $Root 'vendor/stevex-test-template-1.21.11')
        try {
            $VerifyFlag = if ($Verify) { 'true' } else { 'false' }
            & .\gradlew.bat runMemoryDebug "-Dstevex.memory.gameDir=$($Debug.gameDir)" "-Dstevex.memory.hidden=$Hidden" "-Dstevex.memory.verify=$VerifyFlag" --console=plain
            if ($LASTEXITCODE -ne 0) { throw "Memory debug exited with code $LASTEXITCODE" }
            if ($Verify) {
                $Report = Get-Content -LiteralPath (Join-Path $Debug.gameDir 'verification.json') -Raw | ConvertFrom-Json
                if (-not $Report.ok) { throw "Memory verification failed: $($Report | ConvertTo-Json -Compress)" }
                Write-Host "Memory verification passed: $($Report.checkedBlocks) blocks checked"
            }
        } finally { Pop-Location }
    }
} finally { Pop-Location }
