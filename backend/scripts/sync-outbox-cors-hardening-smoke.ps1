param(
  [string]$Endpoint = $env:SYNC_ENDPOINT,
  [string]$SyncKey = $env:SYNC_KEY,
  [string]$Origin = "http://localhost:3000",
  [switch]$OutputJson
)

$ErrorActionPreference = "Stop"

function New-SyncSignature {
  param(
    [Parameter(Mandatory = $true)][string]$Key,
    [Parameter(Mandatory = $true)][string]$Ts,
    [Parameter(Mandatory = $true)][string]$Nonce,
    [Parameter(Mandatory = $true)][string]$Body
  )

  $payload = "$Ts.$Nonce.$Body"
  $hmac = [System.Security.Cryptography.HMACSHA256]::new([System.Text.Encoding]::UTF8.GetBytes($Key))
  try {
    $hash = $hmac.ComputeHash([System.Text.Encoding]::UTF8.GetBytes($payload))
    return -join ($hash | ForEach-Object { $_.ToString("x2") })
  } finally {
    $hmac.Dispose()
  }
}

function Invoke-SyncRequest {
  param(
    [Parameter(Mandatory = $true)][string]$Method,
    [Parameter(Mandatory = $true)][string]$Url,
    [string]$Body = "",
    [bool]$UseAuth = $false
  )

  $headers = @{
    "Origin" = $Origin
  }

  if ($Method -eq "POST") {
    $headers["Content-Type"] = "application/json"
  }

  if ($UseAuth) {
    $ts = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds().ToString()
    $nonce = [Guid]::NewGuid().ToString()
    $sig = New-SyncSignature -Key $SyncKey -Ts $ts -Nonce $nonce -Body $Body
    $headers["X-SYNC-KEY"] = $SyncKey
    $headers["X-SYNC-TS"] = $ts
    $headers["X-SYNC-NONCE"] = $nonce
    $headers["X-SYNC-SIGNATURE"] = $sig
  }

  $iwrCmd = Get-Command Invoke-WebRequest -ErrorAction Stop
  $supportsSkipHttpErrorCheck = $false
  if ($null -ne $iwrCmd.Parameters -and $iwrCmd.Parameters.ContainsKey("SkipHttpErrorCheck")) {
    $supportsSkipHttpErrorCheck = $true
  }

  try {
    if ($supportsSkipHttpErrorCheck) {
      $res = Invoke-WebRequest -Method $Method -Uri $Url -Headers $headers -Body $Body -SkipHttpErrorCheck
    } else {
      $res = Invoke-WebRequest -Method $Method -Uri $Url -Headers $headers -Body $Body
    }
    return $res
  } catch {
    $resp = $_.Exception.Response
    if ($null -ne $resp) {
      # PowerShell 7+ (fallback): HttpResponseMessage
      if ($resp -is [System.Net.Http.HttpResponseMessage]) {
        $statusCode = [int]$resp.StatusCode
        $respHeaders = @{}
        foreach ($h in $resp.Headers) {
          $respHeaders[$h.Key] = ($h.Value -join ",")
        }
        if ($resp.Content -ne $null) {
          foreach ($h in $resp.Content.Headers) {
            $respHeaders[$h.Key] = ($h.Value -join ",")
          }
          try {
            $content = $resp.Content.ReadAsStringAsync().GetAwaiter().GetResult()
          } catch {
            $content = ""
          }
        } else {
          $content = ""
        }
        return [pscustomobject]@{
          StatusCode = $statusCode
          Headers = $respHeaders
          Content = $content
        }
      }

      # Windows PowerShell 5.x: HttpWebResponse
      if ($resp -is [System.Net.HttpWebResponse]) {
        $statusCode = [int]$resp.StatusCode
        $respHeaders = @{}
        foreach ($name in $resp.Headers.AllKeys) {
          $respHeaders[$name] = $resp.Headers[$name]
        }
        $stream = $resp.GetResponseStream()
        $reader = [System.IO.StreamReader]::new($stream)
        try {
          $content = $reader.ReadToEnd()
        } finally {
          $reader.Dispose()
          $stream.Dispose()
        }
        return [pscustomobject]@{
          StatusCode = $statusCode
          Headers = $respHeaders
          Content = $content
        }
      }
    }
    throw "Falha HTTP para $Method $Url :: $($_.Exception.Message)"
  }
}

function Get-HeaderValue {
  param(
    [Parameter(Mandatory = $true)]$Headers,
    [Parameter(Mandatory = $true)][string]$Name
  )
  if ($null -eq $Headers) { return $null }
  if ($Headers.ContainsKey($Name)) { return $Headers[$Name] }
  foreach ($k in $Headers.Keys) {
    if ($k -ieq $Name) { return $Headers[$k] }
  }
  return $null
}

if ([string]::IsNullOrWhiteSpace($Endpoint) -or [string]::IsNullOrWhiteSpace($SyncKey)) {
  throw "Informe SYNC_ENDPOINT e SYNC_KEY (params ou variáveis de ambiente)."
}

$results = @()
$okAll = $true

function Add-Result {
  param(
    [string]$Case,
    [bool]$Ok,
    [int]$Status,
    [string]$Detail
  )
  $script:results += [pscustomobject]@{
    case = $Case
    ok = $Ok
    status = $Status
    detail = $Detail
  }
  if (-not $Ok) { $script:okAll = $false }
}

# 1) CORS preflight
$preflight = Invoke-SyncRequest -Method "OPTIONS" -Url $Endpoint
$allowOrigin = Get-HeaderValue -Headers $preflight.Headers -Name "Access-Control-Allow-Origin"
$allowMethods = Get-HeaderValue -Headers $preflight.Headers -Name "Access-Control-Allow-Methods"
$okPreflight = ($preflight.StatusCode -eq 204) -and `
  (-not [string]::IsNullOrWhiteSpace($allowOrigin)) -and `
  ($allowMethods -like "*POST*")
Add-Result -Case "preflight_cors" -Ok $okPreflight -Status $preflight.StatusCode -Detail "acao=$allowOrigin; methods=$allowMethods"

# 2) Auth 401 com CORS
$unauth = Invoke-SyncRequest -Method "POST" -Url $Endpoint -Body '{"events":[]}' -UseAuth:$false
$unauthBody = $null
try { $unauthBody = $unauth.Content | ConvertFrom-Json } catch {}
$okUnauthorized = ($unauth.StatusCode -eq 401) -and `
  (-not [string]::IsNullOrWhiteSpace((Get-HeaderValue -Headers $unauth.Headers -Name "Access-Control-Allow-Origin"))) -and `
  ($unauthBody.error -eq "UNAUTHORIZED")
Add-Result -Case "unauthorized_with_cors" -Ok $okUnauthorized -Status $unauth.StatusCode -Detail "error=$($unauthBody.error)"

# 3) Hardening batch: erro interno por evento deve ser sanitizado
$invalidEventBody = '{"events":[{"id":"11111111-1111-4111-8111-111111111111","tipo":"TIPO_INVALIDO","payload_json":"{}","created_at":"2026-01-01T00:00:00.000Z"}]}'
$batch = Invoke-SyncRequest -Method "POST" -Url $Endpoint -Body $invalidEventBody -UseAuth:$true
$batchJson = $batch.Content | ConvertFrom-Json
$failedError = $null
if ($batchJson.failed -and $batchJson.failed.Count -gt 0) {
  $failedError = $batchJson.failed[0].error
}
$okBatchSanitized = ($batch.StatusCode -eq 200) -and ($failedError -eq "EVENT_PROCESSING_FAILED")
Add-Result -Case "batch_error_sanitized" -Ok $okBatchSanitized -Status $batch.StatusCode -Detail "failed_error=$failedError"

if ($OutputJson) {
  $summary = [pscustomobject]@{
    ok = $okAll
    endpoint = $Endpoint
    results = $results
  }
  $summary | ConvertTo-Json -Depth 6
} else {
  Write-Host "Endpoint: $Endpoint"
  foreach ($r in $results) {
    $icon = if ($r.ok) { "✅" } else { "❌" }
    Write-Host "$icon $($r.case) -> HTTP $($r.status) :: $($r.detail)"
  }
  if ($okAll) {
    Write-Host "✅ Smoke CORS/Hardening concluído."
  } else {
    Write-Host "❌ Smoke CORS/Hardening falhou."
  }
}

if (-not $okAll) {
  exit 1
}
