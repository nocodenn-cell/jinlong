param(
  [Parameter(Mandatory = $false)]
  [string]$BaseUrl = "https://kbabmewnahysfvlybiak.supabase.co/functions/v1/sync-outbox",

  [Parameter(Mandatory = $false)]
  [string]$SyncKey = "pdv-sync-2026",

  [Parameter(Mandatory = $false)]
  [string]$Op = "catalogo",

  [Parameter(Mandatory = $false)]
  [string]$DeviceFingerprint = "qa-diag-powershell"
  ,
  [Parameter(Mandatory = $false)]
  [switch]$OutputJson,
  [Parameter(Mandatory = $false)]
  [string]$OutputFile = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

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
    SkipHttpErrorCheck = $true
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
$condition = ($resReplay.StatusCode -eq 401 -and (Get-BodyField -Body $resReplay.Body -FieldName "error") -eq "REPLAY_DETECTED")
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
$condition = ($resOld.StatusCode -eq 401 -and (Get-BodyField -Body $resOld.Body -FieldName "error") -eq "TIMESTAMP_OUT_OF_WINDOW")
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
$condition = ($resBad.StatusCode -eq 401 -and (Get-BodyField -Body $resBad.Body -FieldName "error") -eq "INVALID_SIGNATURE")
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
$condition = ($resPostReplay.StatusCode -eq 401 -and (Get-BodyField -Body $resPostReplay.Body -FieldName "error") -eq "REPLAY_DETECTED")
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

if (-not $OutputJson) {
  Write-Host ""
  Write-Host "Resultado: $okCount/$totalCount checks passaram."
}

$report = [pscustomobject]@{
  generatedAtUtc = (Get-Date).ToUniversalTime().ToString("o")
  target = [pscustomobject]@{
    getUrl = $getUrl
    postUrl = $postUrl
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
