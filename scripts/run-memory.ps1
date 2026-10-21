param(
    [Parameter(Mandatory = $true)][string]$Agent,
    [switch]$Launch,
    [switch]$Verify,
    [switch]$LiveFeedback,
    [switch]$ShowWindow
)
$ErrorActionPreference = 'Stop'
if ($LiveFeedback -and -not ($Launch -or $Verify)) { throw 'LiveFeedback requires Launch or Verify' }
$Root = Split-Path -Parent $PSScriptRoot
Push-Location $Root
try {
    $Arguments = @((Join-Path $PSScriptRoot 'prepare-memory-debug.js'), $Agent)
    if ($LiveFeedback) { $Arguments += '--live-feedback' }
    $Prepared = & node @Arguments
    if ($LASTEXITCODE -ne 0) { throw 'Memory debug preparation failed' }
    $Debug = $Prepared | ConvertFrom-Json
    if ($LiveFeedback) {
        Write-Warning "Live feedback explicitly enabled for $($Debug.agentId); this starts an additional memory client and writes its feedback files."
    }
    Write-Host "Memory debug directory: $($Debug.gameDir)"
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
} finally {
    Pop-Location
}
