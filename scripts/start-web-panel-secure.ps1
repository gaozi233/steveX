param([string]$Config = 'runs/web-inspector-dev/agent.json')
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$secretPath = Join-Path $root 'runs/secrets/deepseek-key.dpapi'
if (-not (Test-Path -LiteralPath $secretPath)) { throw 'Configure the local DPAPI key with query-llm-acceptance.ps1 -Configure first.' }
$previousKey = $env:DEEPSEEK_API_KEY
$previousConfig = $env:STEVEX_CONFIG
$ptr = [IntPtr]::Zero
$secret = $null
Push-Location $root
try {
    $secret = (Get-Content -LiteralPath $secretPath -Raw).Trim() | ConvertTo-SecureString
    $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secret)
    $env:DEEPSEEK_API_KEY = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)
    $env:STEVEX_CONFIG = $Config
    & node (Join-Path $root 'src/main.js')
    if ($LASTEXITCODE -ne 0) { throw 'Dashboard exited with an error; inspect local diagnostics.' }
} finally {
    $env:DEEPSEEK_API_KEY = $previousKey
    $env:STEVEX_CONFIG = $previousConfig
    if ($ptr -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
    if ($null -ne $secret) { $secret.Dispose() }
    Pop-Location
}
