param(
  [Parameter(Mandatory = $false)]
  [switch]$UseLinkedDb = $true,

  [Parameter(Mandatory = $false)]
  [switch]$UseLocalDb = $false,

  [Parameter(Mandatory = $false)]
  [switch]$SkipSmokeSql,

  [Parameter(Mandatory = $false)]
  [switch]$SkipVerifySql,

  [Parameter(Mandatory = $false)]
  [switch]$SkipAntiReplay,

  [Parameter(Mandatory = $false)]
  [string]$ValidarGerenteSenha = "",

  [Parameter(Mandatory = $false)]
  [string]$OutputDir = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Resolve-OutputDir {
  param(
    [Parameter(Mandatory = $true)][string]$BackendRoot,
    [Parameter(Mandatory = $false)][string]$ConfiguredOutputDir
  )
  if (-not [string]::IsNullOrWhiteSpace($ConfiguredOutputDir)) {
    return [System.IO.Path]::GetFullPath($ConfiguredOutputDir)
  }
  return (Join-Path $BackendRoot "artifacts")
}

function Ensure-Dir {
  param([Parameter(Mandatory = $true)][string]$DirPath)
  if (-not (Test-Path -LiteralPath $DirPath)) {
    New-Item -ItemType Directory -Path $DirPath -Force | Out-Null
  }
}

function Invoke-SupabaseSqlFile {
  param(
    [Parameter(Mandatory = $true)][string]$BackendRoot,
    [Parameter(Mandatory = $true)][string]$SqlFilePath,
    [Parameter(Mandatory = $true)][bool]$UseLinked,
    [Parameter(Mandatory = $true)][string]$OutputFile
  )

  $dbFlag = if ($UseLinked) { "--linked" } else { "--local" }
  $cmd = "npx supabase db query --file ""$SqlFilePath"" $dbFlag --output json"

  Push-Location $BackendRoot
  try {
    $raw = & cmd /c $cmd 2>&1
    $exitCode = $LASTEXITCODE
  }
  finally {
    Pop-Location
  }

  $rawText = ($raw | Out-String)
  $rawText | Set-Content -Path $OutputFile -Encoding UTF8

  if ($exitCode -ne 0) {
    throw "Falha ao executar SQL ($SqlFilePath). ExitCode=$exitCode. Veja: $OutputFile"
  }
}

function Invoke-AntiReplayDiagnostic {
  param(
    [Parameter(Mandatory = $true)][string]$BackendRoot,
    [Parameter(Mandatory = $true)][string]$DiagnosticScriptPath,
    [Parameter(Mandatory = $true)][string]$OutputFile,
    [Parameter(Mandatory = $false)][string]$ValidarGerenteSenha = ""
  )

  $args = @(
    "-NoProfile",
    "-ExecutionPolicy", "Bypass",
    "-File", $DiagnosticScriptPath,
    "-OutputJson",
    "-OutputFile", $OutputFile
  )
  if (-not [string]::IsNullOrWhiteSpace($ValidarGerenteSenha)) {
    $args += @("-ValidarGerenteSenha", $ValidarGerenteSenha)
  }

  Push-Location $BackendRoot
  try {
    & powershell @args
    $exitCode = $LASTEXITCODE
  }
  finally {
    Pop-Location
  }

  if ($exitCode -ne 0) {
    throw "Diagnóstico anti-replay falhou. ExitCode=$exitCode. Veja: $OutputFile"
  }
}

$backendRoot = Split-Path -Parent $PSScriptRoot
$scriptsDir = Join-Path $backendRoot "scripts"
$supabaseScriptsDir = Join-Path $backendRoot "supabase\scripts"

$smokeSqlPath = Join-Path $supabaseScriptsDir "smoke_operacao_fluxo_completo.sql"
$verifySqlPath = Join-Path $supabaseScriptsDir "verify_p0_producao.sql"
$antiReplayScriptPath = Join-Path $scriptsDir "sync-outbox-anti-replay-diagnostic.ps1"

if ($UseLocalDb -and $UseLinkedDb) {
  throw "Use apenas um modo de banco: -UseLinkedDb (padrão) OU -UseLocalDb."
}

$useLinked = $true
if ($UseLocalDb) { $useLinked = $false }

$runId = (Get-Date).ToUniversalTime().ToString("yyyyMMdd-HHmmss")
$finalOutputDir = Resolve-OutputDir -BackendRoot $backendRoot -ConfiguredOutputDir $OutputDir
Ensure-Dir -DirPath $finalOutputDir

$smokeOut = Join-Path $finalOutputDir "homologacao-$runId-smoke.json"
$verifyOut = Join-Path $finalOutputDir "homologacao-$runId-verify.json"
$diagOut = Join-Path $finalOutputDir "homologacao-$runId-anti-replay.json"
$summaryOut = Join-Path $finalOutputDir "homologacao-$runId-summary.json"

$summary = [ordered]@{
  generatedAtUtc = (Get-Date).ToUniversalTime().ToString("o")
  mode = if ($useLinked) { "linked" } else { "local" }
  steps = @()
  success = $false
}

Write-Host "== Runner homologação P0 ==" -ForegroundColor Cyan
Write-Host "Modo DB: $($summary.mode)"
Write-Host "Saída: $finalOutputDir"
Write-Host ""

try {
  if (-not $SkipSmokeSql) {
    Write-Host "[1/3] Smoke operacional SQL..." -ForegroundColor Yellow
    Invoke-SupabaseSqlFile `
      -BackendRoot $backendRoot `
      -SqlFilePath $smokeSqlPath `
      -UseLinked $useLinked `
      -OutputFile $smokeOut
    $summary.steps += [ordered]@{
      name = "smoke_operacao_fluxo_completo.sql"
      ok = $true
      output = $smokeOut
    }
  }
  else {
    $summary.steps += [ordered]@{
      name = "smoke_operacao_fluxo_completo.sql"
      ok = $null
      skipped = $true
      reason = "SkipSmokeSql"
    }
  }

  if (-not $SkipVerifySql) {
    Write-Host "[2/3] Verify P0 SQL..." -ForegroundColor Yellow
    Invoke-SupabaseSqlFile `
      -BackendRoot $backendRoot `
      -SqlFilePath $verifySqlPath `
      -UseLinked $useLinked `
      -OutputFile $verifyOut
    $summary.steps += [ordered]@{
      name = "verify_p0_producao.sql"
      ok = $true
      output = $verifyOut
    }
  }
  else {
    $summary.steps += [ordered]@{
      name = "verify_p0_producao.sql"
      ok = $null
      skipped = $true
      reason = "SkipVerifySql"
    }
  }

  if (-not $SkipAntiReplay) {
    Write-Host "[3/3] Diagnóstico anti-replay..." -ForegroundColor Yellow
    Invoke-AntiReplayDiagnostic `
      -BackendRoot $backendRoot `
      -DiagnosticScriptPath $antiReplayScriptPath `
      -OutputFile $diagOut `
      -ValidarGerenteSenha $ValidarGerenteSenha
    $summary.steps += [ordered]@{
      name = "sync-outbox-anti-replay-diagnostic.ps1"
      ok = $true
      output = $diagOut
    }
  }
  else {
    $summary.steps += [ordered]@{
      name = "sync-outbox-anti-replay-diagnostic.ps1"
      ok = $null
      skipped = $true
      reason = "SkipAntiReplay"
    }
  }

  $summary.success = $true
}
catch {
  $summary.success = $false
  $summary.error = $_.Exception.Message
  Write-Host ""
  Write-Host "[FAIL] $($summary.error)" -ForegroundColor Red
}
finally {
  $summary | ConvertTo-Json -Depth 8 | Set-Content -Path $summaryOut -Encoding UTF8
  Write-Host ""
  Write-Host "Resumo salvo em: $summaryOut"
}

if (-not $summary.success) {
  exit 1
}

Write-Host "[OK] Homologação concluída." -ForegroundColor Green
exit 0
