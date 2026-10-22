param([switch]$Configure)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$secretPath = Join-Path $root 'runs\secrets\deepseek-key.dpapi'
if ($Configure) {
    $secret = Read-Host 'DeepSeek API key (hidden)' -AsSecureString
    if ($secret.Length -eq 0) { throw 'Empty API key' }
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $secretPath) | Out-Null
    $secret | ConvertFrom-SecureString | Set-Content -LiteralPath $secretPath -Encoding ASCII
    $secret.Dispose()
    Write-Host 'Key saved with Windows DPAPI. No model calls made.'
    exit 0
}
if (!(Test-Path -LiteralPath $secretPath)) { throw 'Run this script with -Configure first.' }
$previousKey = $env:DEEPSEEK_API_KEY
$ptr = [IntPtr]::Zero
$secret = $null
try {
    $secret = (Get-Content -LiteralPath $secretPath -Raw).Trim() | ConvertTo-SecureString
    $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secret)
    $env:DEEPSEEK_API_KEY = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)
    & node (Join-Path $PSScriptRoot 'query-llm-acceptance.js') --live
    if ($LASTEXITCODE -ne 0) { throw 'Acceptance run failed; inspect the recorded log.' }
} finally {
    $env:DEEPSEEK_API_KEY = $previousKey
    if ($ptr -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
    if ($null -ne $secret) { $secret.Dispose() }
}
