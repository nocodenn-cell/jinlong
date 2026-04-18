param(
  [Parameter(Mandatory = $false)]
  [string]$BaseUrl = "",

  [Parameter(Mandatory = $false)]
  [string]$SyncKey = "",

  [Parameter(Mandatory = $false)]
  [string]$Op = "catalogo",

  [Parameter(Mandatory = $false)]
  [string]$DeviceFingerprint = "qa-diag-powershell",

  [Parameter(Mandatory = $false)]
  [switch]$OutputJson,

  [Parameter(Mandatory = $false)]
  [string]$OutputFile = "",

  # Opcional: senha real do gerente (pdv_config) para testar POST ?op=validar_gerente.
  # Preferir variável de ambiente SYNC_DIAG_GERENTE_SENHA em CI para não expor no histórico do shell.
  [Parameter(Mandatory = $false)]
  [string]$ValidarGerenteSenha = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# Preenche SYNC_ENDPOINT / SYNC_KEY a partir de .env local (só se ainda vazios na sessão).
function Import-SyncVarsFromDotEnv {
  param([string[]]$CandidatePaths)
  foreach ($filePath in $CandidatePaths) {
    if (-not (Test-Path -LiteralPath $filePath)) {
      continue
    }
    Get-Content -LiteralPath $filePath -Encoding UTF8 | ForEach-Object {
      $line = $_.Trim()
      if ($line -match '^\s*#' -or [string]::IsNullOrWhiteSpace($line)) {
        return
      }
      $eq = $line.IndexOf('=')
      if ($eq -lt 1) {
        return
      }
      $name = $line.Substring(0, $eq).Trim()
      if ($name -notmatch '^[A-Za-z_][A-Za-z0-9_]*$') {
        return
      }
      $val = $line.Substring($eq + 1).Trim()
      if ($val.Length -ge 2) {
        $first = $val.Substring(0, 1)
        $last = $val.Substring($val.Length - 1, 1)
        if (($first -eq '"' -and $last -eq '"') -or ($first -eq "'" -and $last -eq "'")) {
          $val = $val.Substring(1, $val.Length - 2)
        }
      }
      if ($name -eq 'SYNC_ENDPOINT' -and [string]::IsNullOrWhiteSpace($env:SYNC_ENDPOINT)) {
        $env:SYNC_ENDPOINT = $val
      }
      if ($name -eq 'SYNC_KEY' -and [string]::IsNullOrWhiteSpace($env:SYNC_KEY)) {
        $env:SYNC_KEY = $val
      }
    }
  }
}

$backendRoot = Split-Path -Parent $PSScriptRoot
$repoRoot = Split-Path -Parent $backendRoot
Import-SyncVarsFromDotEnv @(
  (Join-Path $backendRoot '.env')
  (Join-Path $backendRoot 'supabase\.env')
  (Join-Path $repoRoot 'pdv-local\.env')
)

# Credenciais e endpoint: parâmetros, variáveis de ambiente ou .env acima (nada hardcoded no repositório).
if ([string]::IsNullOrWhiteSpace($BaseUrl)) {
  $BaseUrl = $env:SYNC_ENDPOINT
}
if ([string]::IsNullOrWhiteSpace($SyncKey)) {
  $SyncKey = $env:SYNC_KEY
}
if ([string]::IsNullOrWhiteSpace($BaseUrl)) {
  throw @"
Defina a URL da função sync-outbox. Exemplos no PowerShell:

  `$env:SYNC_ENDPOINT = 'https://SEU-REF.supabase.co/functions/v1/sync-outbox'
  `$env:SYNC_KEY = '(mesmo valor do secret SYNC_KEY na Edge)'

Ou parâmetros: -BaseUrl '...' -SyncKey '...'

Ou crie um destes arquivos (não commite segredos): backend\.env, pdv-local\.env — com linhas SYNC_ENDPOINT= e SYNC_KEY=.
"@
}
if ([string]::IsNullOrWhiteSpace($SyncKey)) {
  throw @"
Defina SYNC_KEY (mesmo secret configurado na Edge sync-outbox). Exemplos:

  `$env:SYNC_KEY = '(segredo)'

Ou: -SyncKey '...'

Ou inclua SYNC_KEY= em backend\.env ou pdv-local\.env (não commite).
"@
}
$BaseUrl = $BaseUrl.TrimEnd("/")

$senhaGerenteDiag = $ValidarGerenteSenha
if ([string]::IsNullOrWhiteSpace($senhaGerenteDiag) -and -not [string]::IsNullOrWhiteSpace($env:SYNC_DIAG_GERENTE_SENHA)) {
  $senhaGerenteDiag = $env:SYNC_DIAG_GERENTE_SENHA
}
$runValidarGerente = -not [string]::IsNullOrWhiteSpace($senhaGerenteDiag)

function New-SignatureHex {
  param(
    [Parameter(Mandatory = $true)][string]$Key,
    [Parameter(Mandatory = $true)][string]$Ts,
    [Parameter(Mandatory = $true)][string]$Nonce,
    [AllowEmptyString()]
    [Parameter(Mandatory = $true)][string]$Body
  )

  $payload = "$Ts.$Nonce.$Body"
  $hmac = [System.Security.Cryptography.HMACSHA256]::new([System.Text.Encoding]::UTF8.GetBytes($Key))
  try {
    $bytes = $hmac.ComputeHash([System.Text.Encoding]::UTF8.GetBytes($payload))
    return ($bytes | ForEach-Object { $_.ToString("x2") }) -join ""
  }
  finally {
    $hmac.Dispose()
  }
}

function Invoke-DiagnosticRequest {
  param(
    [Parameter(Mandatory = $true)][ValidateSet("GET", "POST")][string]$Method,
    [Parameter(Mandatory = $true)][string]$Url,
    [Parameter(Mandatory = $true)][hashtable]$Headers,
    [AllowEmptyString()]
    [Parameter(Mandatory = $false)][string]$Body = ""
  )

  $requestParams = @{
    Method            = $Method
    Uri               = $Url
    Headers           = $Headers
  }

  # Compatibilidade: SkipHttpErrorCheck existe no PowerShell 7+, mas não no Windows PowerShell 5.1.
  $iwrCmd = Get-Command Invoke-WebRequest -ErrorAction SilentlyContinue
  if ($null -ne $iwrCmd -and $iwrCmd.Parameters.ContainsKey("SkipHttpErrorCheck")) {
    $requestParams["SkipHttpErrorCheck"] = $true
  }

  if ($Method -eq "POST") {
    $requestParams["Body"] = $Body
    $requestParams["ContentType"] = "application/json"
  }

  $resp = Invoke-WebRequest @requestParams
  $json = $null
  if ($resp.Content) {
    try {
      $json = $resp.Content | ConvertFrom-Json
    }
    catch {
      $json = $null
    }
  }

  return [pscustomobject]@{
    StatusCode = [int]$resp.StatusCode
    Body       = $json
    RawBody    = $resp.Content
  }
}

function Assert-Result {
  param(
    [Parameter(Mandatory = $true)][string]$Name,
    [Parameter(Mandatory = $true)][bool]$Condition,
    [Parameter(Mandatory = $true)][string]$Details
  )

  if ($Condition) {
    if (-not $OutputJson) {
      Write-Host "[PASS] $Name - $Details" -ForegroundColor Green
    }
    return $true
  }

  if (-not $OutputJson) {
    Write-Host "[FAIL] $Name - $Details" -ForegroundColor Red
  }
  return $false
}

function Get-BodyField {
  param(
    [Parameter(Mandatory = $false)]$Body,
    [Parameter(Mandatory = $true)][string]$FieldName
  )

  if ($null -eq $Body) {
    return $null
  }

  if ($Body.PSObject.Properties.Name -contains $FieldName) {
    return $Body.$FieldName
  }

  return $null
}

$getUrl = "${BaseUrl}?op=${Op}"
$getBody = ""
$postUrl = $BaseUrl
$postBody = '{"events":[]}'
$okCount = 0
$totalCount = 0
$results = @()

if (-not $OutputJson) {
  Write-Host "== Sync-outbox Anti-Replay Diagnostic ==" -ForegroundColor Cyan
  Write-Host "GET URL: $getUrl"
  Write-Host "POST URL: $postUrl"
  Write-Host "Device: $DeviceFingerprint"
  if ($runValidarGerente) {
    Write-Host "validar_gerente: habilitado (2 checks adicionais)" -ForegroundColor DarkGray
  }
  else {
    Write-Host "validar_gerente: omitido (use -ValidarGerenteSenha ou env SYNC_DIAG_GERENTE_SENHA)" -ForegroundColor DarkGray
  }
  Write-Host ""
}

# 1) GET válido (deve funcionar)
$tsValid = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds().ToString()
$nonceValid = [guid]::NewGuid().ToString()
$sigValid = New-SignatureHex -Key $SyncKey -Ts $tsValid -Nonce $nonceValid -Body $getBody
$headersValid = @{
  "X-SYNC-KEY"         = $SyncKey
  "X-SYNC-TS"          = $tsValid
  "X-SYNC-NONCE"       = $nonceValid
  "X-SYNC-SIGNATURE"   = $sigValid
  "x-device-fingerprint" = $DeviceFingerprint
}
$resValid = Invoke-DiagnosticRequest -Method "GET" -Url $getUrl -Headers $headersValid -Body $getBody
$totalCount++
$checkName = "GET assinado válido"
$condition = ($resValid.StatusCode -eq 200 -and (Get-BodyField -Body $resValid.Body -FieldName "ok") -eq $true)
$details = "status=$($resValid.StatusCode), ok=$(Get-BodyField -Body $resValid.Body -FieldName 'ok')"
$okCount += [int](Assert-Result -Name $checkName -Condition $condition -Details $details)
$results += [pscustomobject]@{
  name = $checkName
  method = "GET"
  passed = $condition
  statusCode = $resValid.StatusCode
  error = Get-BodyField -Body $resValid.Body -FieldName "error"
  ok = Get-BodyField -Body $resValid.Body -FieldName "ok"
  details = $details
}

# 2) Replay GET (mesmo nonce/ts/signature) deve ser bloqueado
$resReplay = Invoke-DiagnosticRequest -Method "GET" -Url $getUrl -Headers $headersValid -Body $getBody
$totalCount++
$checkName = "Replay GET bloqueado"
$replayGetError = [string](Get-BodyField -Body $resReplay.Body -FieldName "error")
# UNAUTHORIZED: compatível com deploys antigos (erro mascarado sem SYNC_OUTBOX_EXPOSE_INTERNAL_ERRORS).
$condition = (
  $resReplay.StatusCode -eq 401 -and
  ($replayGetError -eq "REPLAY_DETECTED" -or $replayGetError -eq "REPLAY_OR_DB_ERROR" -or $replayGetError -eq "UNAUTHORIZED")
)
$details = "status=$($resReplay.StatusCode), error=$(Get-BodyField -Body $resReplay.Body -FieldName 'error')"
$okCount += [int](Assert-Result -Name $checkName -Condition $condition -Details $details)
$results += [pscustomobject]@{
  name = $checkName
  method = "GET"
  passed = $condition
  statusCode = $resReplay.StatusCode
  error = Get-BodyField -Body $resReplay.Body -FieldName "error"
  ok = Get-BodyField -Body $resReplay.Body -FieldName "ok"
  details = $details
}

# 3) Timestamp drift (muito antigo) deve ser bloqueado
$tsOld = ([DateTimeOffset]::UtcNow.ToUnixTimeSeconds() - 3600).ToString()
$nonceOld = [guid]::NewGuid().ToString()
$sigOld = New-SignatureHex -Key $SyncKey -Ts $tsOld -Nonce $nonceOld -Body $getBody
$headersOld = @{
  "X-SYNC-KEY"         = $SyncKey
  "X-SYNC-TS"          = $tsOld
  "X-SYNC-NONCE"       = $nonceOld
  "X-SYNC-SIGNATURE"   = $sigOld
  "x-device-fingerprint" = $DeviceFingerprint
}
$resOld = Invoke-DiagnosticRequest -Method "GET" -Url $getUrl -Headers $headersOld -Body $getBody
$totalCount++
$checkName = "Timestamp drift bloqueado"
$timestampError = [string](Get-BodyField -Body $resOld.Body -FieldName "error")
$condition = (
  $resOld.StatusCode -eq 401 -and
  ($timestampError -eq "TIMESTAMP_OUT_OF_WINDOW" -or $timestampError -eq "TS_OUT_OF_WINDOW" -or $timestampError -eq "UNAUTHORIZED")
)
$details = "status=$($resOld.StatusCode), error=$(Get-BodyField -Body $resOld.Body -FieldName 'error')"
$okCount += [int](Assert-Result -Name $checkName -Condition $condition -Details $details)
$results += [pscustomobject]@{
  name = $checkName
  method = "GET"
  passed = $condition
  statusCode = $resOld.StatusCode
  error = Get-BodyField -Body $resOld.Body -FieldName "error"
  ok = Get-BodyField -Body $resOld.Body -FieldName "ok"
  details = $details
}

# 4) Assinatura inválida deve ser bloqueada
$tsBad = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds().ToString()
$nonceBad = [guid]::NewGuid().ToString()
$headersBad = @{
  "X-SYNC-KEY"         = $SyncKey
  "X-SYNC-TS"          = $tsBad
  "X-SYNC-NONCE"       = $nonceBad
  "X-SYNC-SIGNATURE"   = ("00" * 32)
  "x-device-fingerprint" = $DeviceFingerprint
}
$resBad = Invoke-DiagnosticRequest -Method "GET" -Url $getUrl -Headers $headersBad -Body $getBody
$totalCount++
$checkName = "Assinatura inválida bloqueada"
$invalidSigError = [string](Get-BodyField -Body $resBad.Body -FieldName "error")
$condition = (
  $resBad.StatusCode -eq 401 -and
  ($invalidSigError -eq "INVALID_SIGNATURE" -or $invalidSigError -eq "INVALID_SIG" -or $invalidSigError -eq "UNAUTHORIZED")
)
$details = "status=$($resBad.StatusCode), error=$(Get-BodyField -Body $resBad.Body -FieldName 'error')"
$okCount += [int](Assert-Result -Name $checkName -Condition $condition -Details $details)
$results += [pscustomobject]@{
  name = $checkName
  method = "GET"
  passed = $condition
  statusCode = $resBad.StatusCode
  error = Get-BodyField -Body $resBad.Body -FieldName "error"
  ok = Get-BodyField -Body $resBad.Body -FieldName "ok"
  details = $details
}

# 5) POST com payload mínimo assinado deve funcionar
$tsPost = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds().ToString()
$noncePost = [guid]::NewGuid().ToString()
$sigPost = New-SignatureHex -Key $SyncKey -Ts $tsPost -Nonce $noncePost -Body $postBody
$headersPost = @{
  "X-SYNC-KEY"         = $SyncKey
  "X-SYNC-TS"          = $tsPost
  "X-SYNC-NONCE"       = $noncePost
  "X-SYNC-SIGNATURE"   = $sigPost
  "x-device-fingerprint" = $DeviceFingerprint
}
$resPost = Invoke-DiagnosticRequest -Method "POST" -Url $postUrl -Headers $headersPost -Body $postBody
$totalCount++
$checkName = "POST mínimo assinado válido"
$condition = ($resPost.StatusCode -eq 200 -and (Get-BodyField -Body $resPost.Body -FieldName "ok") -eq $true)
$details = "status=$($resPost.StatusCode), ok=$(Get-BodyField -Body $resPost.Body -FieldName 'ok')"
$okCount += [int](Assert-Result -Name $checkName -Condition $condition -Details $details)
$results += [pscustomobject]@{
  name = $checkName
  method = "POST"
  passed = $condition
  statusCode = $resPost.StatusCode
  error = Get-BodyField -Body $resPost.Body -FieldName "error"
  ok = Get-BodyField -Body $resPost.Body -FieldName "ok"
  details = $details
}

# 6) Replay POST (mesmo nonce/ts/signature/body) deve ser bloqueado
$resPostReplay = Invoke-DiagnosticRequest -Method "POST" -Url $postUrl -Headers $headersPost -Body $postBody
$totalCount++
$checkName = "Replay POST bloqueado"
$replayPostError = [string](Get-BodyField -Body $resPostReplay.Body -FieldName "error")
$condition = (
  $resPostReplay.StatusCode -eq 401 -and
  ($replayPostError -eq "REPLAY_DETECTED" -or $replayPostError -eq "REPLAY_OR_DB_ERROR" -or $replayPostError -eq "UNAUTHORIZED")
)
$details = "status=$($resPostReplay.StatusCode), error=$(Get-BodyField -Body $resPostReplay.Body -FieldName 'error')"
$okCount += [int](Assert-Result -Name $checkName -Condition $condition -Details $details)
$results += [pscustomobject]@{
  name = $checkName
  method = "POST"
  passed = $condition
  statusCode = $resPostReplay.StatusCode
  error = Get-BodyField -Body $resPostReplay.Body -FieldName "error"
  ok = Get-BodyField -Body $resPostReplay.Body -FieldName "ok"
  details = $details
}

# 7–8) Opcional: POST ?op=validar_gerente (mesmo contrato HMAC; corpo exato entra na assinatura)
$validarGerenteUrl = "${BaseUrl}?op=validar_gerente"
if ($runValidarGerente) {
  $vgBodyOk = (@{ senha = $senhaGerenteDiag.Trim() } | ConvertTo-Json -Compress)
  $tsVg1 = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds().ToString()
  $nonceVg1 = [guid]::NewGuid().ToString()
  $sigVg1 = New-SignatureHex -Key $SyncKey -Ts $tsVg1 -Nonce $nonceVg1 -Body $vgBodyOk
  $headersVg1 = @{
    "X-SYNC-KEY"            = $SyncKey
    "X-SYNC-TS"             = $tsVg1
    "X-SYNC-NONCE"          = $nonceVg1
    "X-SYNC-SIGNATURE"      = $sigVg1
    "x-device-fingerprint"  = $DeviceFingerprint
  }
  $resVgOk = Invoke-DiagnosticRequest -Method "POST" -Url $validarGerenteUrl -Headers $headersVg1 -Body $vgBodyOk
  $totalCount++
  $checkName = "POST validar_gerente senha válida"
  $tok = Get-BodyField -Body $resVgOk.Body -FieldName "token"
  $condition = (
    $resVgOk.StatusCode -eq 200 -and
    (Get-BodyField -Body $resVgOk.Body -FieldName "ok") -eq $true -and
    -not [string]::IsNullOrWhiteSpace([string]$tok)
  )
  $details = "status=$($resVgOk.StatusCode), ok=$(Get-BodyField -Body $resVgOk.Body -FieldName 'ok'), token_len=$([string]$tok).Length"
  $okCount += [int](Assert-Result -Name $checkName -Condition $condition -Details $details)
  $results += [pscustomobject]@{
    name       = $checkName
    method     = "POST"
    passed     = $condition
    statusCode = $resVgOk.StatusCode
    error      = Get-BodyField -Body $resVgOk.Body -FieldName "error"
    ok         = Get-BodyField -Body $resVgOk.Body -FieldName "ok"
    details    = $details
  }

  $vgBodyBad = '{"senha":"__sync_diag_invalid_password__"}'
  $tsVg2 = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds().ToString()
  $nonceVg2 = [guid]::NewGuid().ToString()
  $sigVg2 = New-SignatureHex -Key $SyncKey -Ts $tsVg2 -Nonce $nonceVg2 -Body $vgBodyBad
  $headersVg2 = @{
    "X-SYNC-KEY"            = $SyncKey
    "X-SYNC-TS"             = $tsVg2
    "X-SYNC-NONCE"          = $nonceVg2
    "X-SYNC-SIGNATURE"      = $sigVg2
    "x-device-fingerprint"  = $DeviceFingerprint
  }
  $resVgBad = Invoke-DiagnosticRequest -Method "POST" -Url $validarGerenteUrl -Headers $headersVg2 -Body $vgBodyBad
  $totalCount++
  $checkName = "POST validar_gerente senha inválida rejeitada"
  $condition = ($resVgBad.StatusCode -eq 401 -and (Get-BodyField -Body $resVgBad.Body -FieldName "error") -eq "SENHA_INVALIDA")
  $details = "status=$($resVgBad.StatusCode), error=$(Get-BodyField -Body $resVgBad.Body -FieldName 'error')"
  $okCount += [int](Assert-Result -Name $checkName -Condition $condition -Details $details)
  $results += [pscustomobject]@{
    name       = $checkName
    method     = "POST"
    passed     = $condition
    statusCode = $resVgBad.StatusCode
    error      = Get-BodyField -Body $resVgBad.Body -FieldName "error"
    ok         = Get-BodyField -Body $resVgBad.Body -FieldName "ok"
    details    = $details
  }
}

if (-not $OutputJson) {
  Write-Host ""
  Write-Host "Resultado: $okCount/$totalCount checks passaram."
}

$report = [pscustomobject]@{
  generatedAtUtc = (Get-Date).ToUniversalTime().ToString("o")
  target = [pscustomobject]@{
    getUrl = $getUrl
    postUrl = $postUrl
    validarGerenteUrl = $validarGerenteUrl
    validarGerenteChecksEnabled = $runValidarGerente
    deviceFingerprint = $DeviceFingerprint
  }
  summary = [pscustomobject]@{
    passed = $okCount
    total = $totalCount
    success = ($okCount -eq $totalCount)
  }
  checks = $results
}

if (-not [string]::IsNullOrWhiteSpace($OutputFile)) {
  $outputPath = [System.IO.Path]::GetFullPath($OutputFile)
  $outputDir = Split-Path -Path $outputPath -Parent
  if (-not [string]::IsNullOrWhiteSpace($outputDir) -and -not (Test-Path -Path $outputDir)) {
    New-Item -ItemType Directory -Path $outputDir -Force | Out-Null
  }
  $report | ConvertTo-Json -Depth 8 | Set-Content -Path $outputPath -Encoding UTF8
  if (-not $OutputJson) {
    Write-Host "Relatório JSON salvo em: $outputPath"
  }
}

if ($OutputJson) {
  $report | ConvertTo-Json -Depth 8
}

if ($okCount -ne $totalCount) {
  exit 1
}

exit 0
