<#
.SYNOPSIS
  Jinlong PDV (com.fastproduct.pdv.local) - diagnostico SOMENTE LEITURA + backup.
.DESCRIPTION
  Nunca apaga nem altera fila (outbox), DLQ, ativacao ou banco original.
  O banco ORIGINAL nunca e aberto: so e copiado. Todo SQL roda numa copia temporaria.
  Compativel com Windows PowerShell 5.1 e PowerShell 7. Nao instala nada.
  Contrato verificado = sync-outbox de main (b89b8824) e #584 (14482214):
    CAIXA_ABERTO: id UUID, loja_id UUID (CAIXA_LOJA_OBRIGATORIA), valor_inicial numero ou ausente.
    VENDA_REGISTRADA: venda_id UUID, forma_pagamento texto, total_bruto/total_desconto/total_liquido numero,
      itens[] nao vazio (produto_id UUID, quantidade > 0, preco_original e preco_unitario numero),
      loja_id UUID, caixa_id UUID (#584 modo dispositivo: EVENTO_CAIXA_OBRIGATORIO), operador_id texto ou nulo.
  Uso (PDV FECHADO, inclusive da bandeja):
    powershell -NoProfile -ExecutionPolicy Bypass -File ".\pdv-diagnostico-backup.ps1"
    (opcional) -Sqlite3Path "C:\caminho\sqlite3.exe"
  Saida: pasta "PDV-backup-<MAQUINA>-<data>" na Area de Trabalho, com ACL so do usuario atual,
  e RESUMO-diagnostico.txt (sem payloads, sem chaves, sem dados pessoais).
  Codigos de saida: 0 ok; 2 app aberto; 3 dados ausentes; 4 falha de backup/hash; 5 falha de ACL.
#>
[CmdletBinding()]
param(
  [string]$Sqlite3Path = '',
  # Parametros abaixo existem para teste; no PDV use os padroes.
  [string]$LocalAppDataRoot = $env:LOCALAPPDATA,
  [string]$AppDataRoot = $env:APPDATA,
  [string]$DesktopRoot = '',
  [string[]]$InstallRoots = @()
)
Set-StrictMode -Version 2.0
$ErrorActionPreference = 'Stop'

function Write-Info([string]$m) { Write-Host ('[INFO] ' + $m) }
function Write-Warn2([string]$m) { Write-Host ('[AVISO] ' + $m) -ForegroundColor Yellow }
function Write-Fail([string]$m) { Write-Host ('[ERRO] ' + $m) -ForegroundColor Red }
$IsWin = ($env:OS -eq 'Windows_NT')

$Identifier = 'com.fastproduct.pdv.local'
if ([string]::IsNullOrEmpty($LocalAppDataRoot) -or [string]::IsNullOrEmpty($AppDataRoot)) { Write-Fail 'LOCALAPPDATA/APPDATA nao definidos.'; exit 3 }
$DataDir = Join-Path -Path $LocalAppDataRoot -ChildPath (Join-Path -Path $Identifier -ChildPath 'pdv-local')
$CfgDir  = Join-Path -Path $AppDataRoot -ChildPath $Identifier
if ([string]::IsNullOrEmpty($DesktopRoot)) { $DesktopRoot = [Environment]::GetFolderPath('Desktop') }
if ($InstallRoots.Count -eq 0) {
  $InstallRoots = @(
    (Join-Path -Path $LocalAppDataRoot -ChildPath 'Jinlong PDV'),
    (Join-Path -Path $LocalAppDataRoot -ChildPath 'Programs\Jinlong PDV')
  )
  if ($env:ProgramFiles) { $InstallRoots += (Join-Path -Path $env:ProgramFiles -ChildPath 'Jinlong PDV') }
  if (${env:ProgramFiles(x86)}) { $InstallRoots += (Join-Path -Path ${env:ProgramFiles(x86)} -ChildPath 'Jinlong PDV') }
}

# ---------------------------------------------------------------- 1) app fechado
$running = @(Get-Process -ErrorAction SilentlyContinue | Where-Object {
  $n = $_.ProcessName; $p = $null
  try { $p = $_.Path } catch { $p = $null }
  ($n -match '(?i)^(jinlong|jinlong[ _-]?pdv|pdv-local|pdv_local)$') -or ($p -and ($p -match '(?i)\\Jinlong PDV\\'))
})
if ($running.Count -gt 0) {
  Write-Fail ('O PDV esta aberto (' + ((@($running | ForEach-Object { $_.ProcessName })) -join ', ') + '). Feche o app (inclusive na bandeja) e rode de novo.')
  exit 2
}
$dbSrc = Join-Path -Path $DataDir -ChildPath 'pdv_local.db'
if (-not (Test-Path -LiteralPath $dbSrc -PathType Leaf)) { Write-Fail ('Banco nao encontrado: ' + $dbSrc); exit 3 }

# ---------------------------------------------------------------- 2) backup (conjunto db + wal + shm)
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$Dest = Join-Path -Path $DesktopRoot -ChildPath ('PDV-backup-' + $env:COMPUTERNAME + '-' + $stamp)
$DestData = Join-Path -Path $Dest -ChildPath 'LOCALAPPDATA-pdv-local'
$DestCfg  = Join-Path -Path $Dest -ChildPath 'APPDATA-config'
try {
  New-Item -ItemType Directory -Path $Dest -Force | Out-Null
  # Protege a pasta ANTES de copiar o segredo de ativacao.
  if ($IsWin) {
    $grant = ${env:USERNAME} + ':(OI)(CI)F'
    $aclOut = & icacls.exe $Dest '/inheritance:r' '/grant:r' $grant 2>&1
    if ($LASTEXITCODE -ne 0) { Write-Fail ('icacls falhou: ' + ($aclOut | Out-String)); exit 5 }
  } else {
    & chmod 700 $Dest
    if ($LASTEXITCODE -ne 0) { Write-Fail 'chmod falhou'; exit 5 }
  }
  New-Item -ItemType Directory -Path $DestData -Force | Out-Null
} catch { Write-Fail ('Nao foi possivel criar/proteger a pasta de backup: ' + $_.Exception.Message); exit 5 }

function Copy-Tree([string]$src, [string]$dst) {
  $list = New-Object System.Collections.ArrayList
  $root = (Get-Item -LiteralPath $src -Force).FullName.TrimEnd('\', '/')
  foreach ($f in @(Get-ChildItem -LiteralPath $root -Recurse -Force -File)) {
    $rel = $f.FullName.Substring($root.Length).TrimStart('\', '/')
    $target = Join-Path -Path $dst -ChildPath $rel
    $dir = Split-Path -Path $target -Parent
    if (-not (Test-Path -LiteralPath $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
    $hBefore = (Get-FileHash -LiteralPath $f.FullName -Algorithm SHA256).Hash
    Copy-Item -LiteralPath $f.FullName -Destination $target -Force
    [void]$list.Add([pscustomobject]@{ Rel = $rel; Src = $f.FullName; Dst = $target; Size = $f.Length; HashSrc = $hBefore })
  }
  return ,$list
}
$files = New-Object System.Collections.ArrayList
$hashOk = $true; $hashLines = New-Object System.Collections.ArrayList
try {
  Write-Info ('Copiando dados para: ' + $Dest)
  foreach ($x in (Copy-Tree $DataDir $DestData)) { [void]$files.Add($x) }
  if (Test-Path -LiteralPath $CfgDir -PathType Container) {
    New-Item -ItemType Directory -Path $DestCfg -Force | Out-Null
    foreach ($x in (Copy-Tree $CfgDir $DestCfg)) { [void]$files.Add($x) }
  } else { Write-Warn2 ('Pasta de ativacao/config nao existe: ' + $CfgDir) }
  # 3) SHA256: origem antes da copia == origem depois == copia (conjunto consistente, nada mudou durante a copia).
  foreach ($f in $files) {
    $hAfter = (Get-FileHash -LiteralPath $f.Src -Algorithm SHA256).Hash
    $hDst = (Get-FileHash -LiteralPath $f.Dst -Algorithm SHA256).Hash
    $ok = (($f.HashSrc -eq $hAfter) -and ($hAfter -eq $hDst))
    if (-not $ok) { $hashOk = $false }
    $tag = 'FALHOU'; if ($ok) { $tag = 'OK' }
    [void]$hashLines.Add(('{0,-6} {1} {2} bytes  {3}' -f $tag, $hDst, $f.Size, $f.Rel))
  }
} catch { $hashOk = $false; Write-Fail ('Falha na copia: ' + $_.Exception.Message) }
$dbCopy = Join-Path -Path $DestData -ChildPath 'pdv_local.db'
if (-not (Test-Path -LiteralPath $dbCopy -PathType Leaf)) { $hashOk = $false }
if (-not $hashOk) {
  Write-Fail 'Backup ou SHA256 falhou. NAO use esta copia. Nenhuma classificacao foi feita. Feche o app e rode de novo.'
  $hashLines | ForEach-Object { Write-Host ('  ' + $_) }
  exit 4
}
Write-Info ('SHA256 conferido em ' + $files.Count + ' arquivo(s).')

# ---------------------------------------------------------------- 4) diagnostico na COPIA TEMPORARIA
$verdict = 'INDETERMINADO'; $motivo = ''; $metodo = 'nenhum'
$integ = 'n/d'; $pend = 'n/d'; $dlq = 'n/d'
$cx = $null; $vd = $null

$sqlite = $null
if ($Sqlite3Path) { if (Test-Path -LiteralPath $Sqlite3Path -PathType Leaf) { $sqlite = (Get-Item -LiteralPath $Sqlite3Path).FullName } }
if (-not $sqlite) {
  $c = Get-Command -Name 'sqlite3.exe', 'sqlite3' -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($c) { $sqlite = $c.Source }
}
if (-not $sqlite -and $PSScriptRoot) {
  $cand = Join-Path -Path $PSScriptRoot -ChildPath 'sqlite3.exe'
  if (Test-Path -LiteralPath $cand -PathType Leaf) { $sqlite = $cand }
}

$work = Join-Path -Path ([System.IO.Path]::GetTempPath()) -ChildPath ('pdvdiag ' + $stamp + ' ' + [guid]::NewGuid().ToString('N'))
$sqlErro = $false
function Invoke-Sql([string]$sql) {
  # Retorna linhas de saida; marca $script:sqlErro em qualquer falha (exit code, stderr ou excecao).
  $eap = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
  try {
    $argv = @('-bail', '-batch', '-noheader', '-separator', '|', $script:dbWork, $sql)
    $raw = & $script:sqlite @argv 2>&1
    $code = $LASTEXITCODE
  } catch { $script:sqlErro = $true; return @() } finally { $ErrorActionPreference = $eap }
  $outLines = @(); $errSeen = $false
  foreach ($r in @($raw)) {
    if ($r -is [System.Management.Automation.ErrorRecord]) { $errSeen = $true } else { $outLines += [string]$r }
  }
  if (($code -ne 0) -or $errSeen) { $script:sqlErro = $true }
  return ,$outLines
}

# Expressoes SQL (sem aspas duplas, para nao depender de quoting de argumentos nativos).
$H = '[0-9a-fA-F]'
$UUIDGLOB = ($H * 8) + '-' + ($H * 4) + '-[1-5]' + ($H * 3) + '-[89abAB]' + ($H * 3) + '-' + ($H * 12)
function U([string]$doc, [string]$path) { "(json_type($doc,'$path')='text' AND length(json_extract($doc,'$path'))=36 AND json_extract($doc,'$path') GLOB '$UUIDGLOB')" }
function N([string]$doc, [string]$path) { "(json_type($doc,'$path') IN ('integer','real'))" }
$p = 'payload_json'
$caixaOk = "(json_valid($p) AND $(U $p '$.id') AND $(U $p '$.loja_id') AND (json_type($p,'$.valor_inicial') IS NULL OR json_type($p,'$.valor_inicial') IN ('null','integer','real')))"
$itemBad = "EXISTS (SELECT 1 FROM json_each($p,'$.itens') je WHERE NOT ($(U 'je.value' '$.produto_id') AND $(N 'je.value' '$.quantidade') AND json_extract(je.value,'$.quantidade') > 0 AND $(N 'je.value' '$.preco_original') AND $(N 'je.value' '$.preco_unitario')))"
$vendaOk = "(json_valid($p) AND $(U $p '$.venda_id') AND json_type($p,'$.forma_pagamento')='text' AND length(trim(json_extract($p,'$.forma_pagamento')))>0 AND $(N $p '$.total_bruto') AND $(N $p '$.total_desconto') AND $(N $p '$.total_liquido') AND json_type($p,'$.itens')='array' AND json_array_length($p,'$.itens')>0 AND NOT $itemBad AND $(U $p '$.loja_id') AND $(U $p '$.caixa_id') AND (json_type($p,'$.operador_id') IS NULL OR json_type($p,'$.operador_id') IN ('null','text')))"
function StatsSql([string]$tipo, [string]$okExpr) {
  # total | validos | ultimo_valido(1/0/-1 sem evento) | invalidos_na_fila (PENDENTE/ERRO) | invalidos_enviados
  "WITH e AS (SELECT created_at, rowid AS rid, status, CASE WHEN $okExpr THEN 1 ELSE 0 END AS ok FROM outbox WHERE tipo='$tipo') " +
  "SELECT (SELECT count(*) FROM e), (SELECT count(*) FROM e WHERE ok=1), " +
  "coalesce((SELECT ok FROM e ORDER BY created_at DESC, rid DESC LIMIT 1),-1), " +
  "(SELECT count(*) FROM e WHERE ok=0 AND status IN ('PENDENTE','ERRO')), " +
  "(SELECT count(*) FROM e WHERE ok=0 AND status NOT IN ('PENDENTE','ERRO'));"
}
function Parse-Stats($lines) {
  $l = @($lines)
  if ($l.Count -ne 1) { $script:sqlErro = $true; return $null }
  $parts = $l[0].Split('|')
  if ($parts.Count -ne 5) { $script:sqlErro = $true; return $null }
  $v = @(); foreach ($x in $parts) { $n = 0; if (-not [int]::TryParse($x.Trim(), [ref]$n)) { $script:sqlErro = $true; return $null }; $v += $n }
  return [pscustomobject]@{ Total = $v[0]; Validos = $v[1]; UltimoOk = $v[2]; InvFila = $v[3]; InvEnviados = $v[4] }
}

if (-not $sqlite) {
  $metodo = 'sqlite3 ausente'
  $motivo = 'sqlite3.exe nao encontrado: sem leitura do banco. Backup mantido. Para diagnosticar, coloque sqlite3.exe (sqlite.org, sqlite-tools-win-x64) ao lado do script ou use -Sqlite3Path.'
} else {
  $metodo = 'sqlite3 na copia temporaria (o original nunca e aberto)'
  try {
    New-Item -ItemType Directory -Path $work -Force | Out-Null
    foreach ($n in @('pdv_local.db', 'pdv_local.db-wal', 'pdv_local.db-shm')) {
      $s = Join-Path -Path $DestData -ChildPath $n
      if (Test-Path -LiteralPath $s -PathType Leaf) { Copy-Item -LiteralPath $s -Destination (Join-Path -Path $work -ChildPath $n) -Force }
    }
    $script:dbWork = Join-Path -Path $work -ChildPath 'pdv_local.db'
    $r = Invoke-Sql 'PRAGMA integrity_check;'
    $integ = (@($r) -join ';')
    if ($sqlErro -or ($integ -ne 'ok')) {
      $sqlErro = $true; $motivo = 'PRAGMA integrity_check nao retornou ok (banco corrompido ou ilegivel).'
    } else {
      $r = Invoke-Sql "SELECT (SELECT count(*) FROM outbox WHERE status='PENDENTE'), (SELECT count(*) FROM outbox WHERE status='ERRO');"
      if (-not $sqlErro) { $pp = @($r); if ($pp.Count -eq 1 -and $pp[0] -match '^\d+\|\d+$') { $pend = $pp[0].Split('|')[0]; $dlq = $pp[0].Split('|')[1] } else { $sqlErro = $true } }
      if (-not $sqlErro) { $cx = Parse-Stats (Invoke-Sql (StatsSql 'CAIXA_ABERTO' $caixaOk)) }
      if (-not $sqlErro) { $vd = Parse-Stats (Invoke-Sql (StatsSql 'VENDA_REGISTRADA' $vendaOk)) }
      if ($sqlErro -and -not $motivo) { $motivo = 'Erro em consulta SQL: nenhum veredito positivo.' }
    }
  } catch { $sqlErro = $true; $motivo = 'Excecao na leitura: ' + $_.Exception.Message }
  finally { if (Test-Path -LiteralPath $work) { Remove-Item -LiteralPath $work -Recurse -Force -ErrorAction SilentlyContinue } }
}

# ---------------------------------------------------------------- 5) executavel instalado
$exeInfo = New-Object System.Collections.ArrayList
$exeBuild = ''
foreach ($root in $InstallRoots) {
  if ($root -and (Test-Path -LiteralPath $root -PathType Container)) {
    foreach ($e in @(Get-ChildItem -LiteralPath $root -Filter '*.exe' -File -ErrorAction SilentlyContinue | Where-Object { $_.Name -notmatch '(?i)uninstall' })) {
      $hh = (Get-FileHash -LiteralPath $e.FullName -Algorithm SHA256).Hash
      $fv = ''; try { $fv = [string]$e.VersionInfo.FileVersion } catch { $fv = '' }
      [void]$exeInfo.Add([pscustomobject]@{ Path = $e.FullName; Date = $e.LastWriteTime; Size = $e.Length; Hash = $hh; FileVersion = $fv })
    }
  }
}
function Test-AsciiInFile([string]$path, [string]$needle) {
  # Busca literal de string ASCII no binario (nao e banco de dados; somente leitura).
  $bytes = [System.IO.File]::ReadAllBytes($path)
  $txt = [System.Text.Encoding]::GetEncoding(28591).GetString($bytes)
  return ($txt.IndexOf($needle, [System.StringComparison]::Ordinal) -ge 0)
}

# ---------------------------------------------------------------- 6) veredito
if ($sqlErro) {
  $verdict = 'INDETERMINADO'
} elseif ($cx -and $vd) {
  $temEventos = ($cx.Total -gt 0) -and ($vd.Total -gt 0)
  if (($cx.InvFila + $vd.InvFila) -gt 0) {
    $verdict = 'INCOMPATIVEL'
    $motivo = 'Ha eventos na fila/DLQ fora do contrato de main/#584 (seriam rejeitados): caixa=' + $cx.InvFila + ', venda=' + $vd.InvFila + '. Build A ou fila antiga: NAO publicar o edge novo antes de resolver.'
  } elseif ($temEventos -and ($cx.UltimoOk -eq 1) -and ($vd.UltimoOk -eq 1)) {
    $verdict = 'COMPATIVEL (Build B ou C)'
    $motivo = 'Ultimos CAIXA_ABERTO e VENDA_REGISTRADA cumprem o contrato completo e nao ha invalidos na fila/DLQ.'
    if (($cx.InvEnviados + $vd.InvEnviados) -gt 0) { $motivo += ' (eventos antigos ja enviados fora do contrato: ' + ($cx.InvEnviados + $vd.InvEnviados) + ' - normal se o PDV foi atualizado.)' }
  } elseif ($temEventos -and ($cx.Validos -eq 0) -and ($vd.Validos -eq 0)) {
    $verdict = 'INCOMPATIVEL (Build A - precisa reinstalar)'
    $motivo = 'Nenhum evento de caixa/venda cumpre o contrato (sem loja_id).'
  } elseif ($temEventos) {
    $verdict = 'INDETERMINADO'
    $motivo = 'Resultados conflitantes entre caixa e venda (ultimo caixa ok=' + $cx.UltimoOk + ', ultima venda ok=' + $vd.UltimoOk + ').'
  } else {
    # Eventos insuficientes: tenta o executavel (marcadores documentados abaixo).
    $motivo = 'Eventos insuficientes no outbox (caixa=' + $cx.Total + ', venda=' + $vd.Total + ').'
    if ($exeInfo.Count -eq 1) {
      # Marcadores (literais Rust, deterministicos):
      #  'LOJA_NAO_CONFIGURADA' - db.rs loja_id_configurada(), introduzido em 8fa5f524 (2026-10-10), quando loja_id passou a ir nos eventos.
      #  'op=ativar'            - ativacao.rs, introduzido em 1fec8165 (2026-10-19, #584).
      $temLoja = Test-AsciiInFile $exeInfo[0].Path 'LOJA_NAO_CONFIGURADA'
      $temAtiv = Test-AsciiInFile $exeInfo[0].Path 'op=ativar'
      if ($temLoja -and $temAtiv) { $verdict = 'COMPATIVEL (Build C, pelo executavel)' }
      elseif ($temLoja) { $verdict = 'COMPATIVEL (Build B, pelo executavel)' }
      elseif ($temAtiv) { $verdict = 'INDETERMINADO'; $motivo += ' Marcadores do executavel inconsistentes.' }
      else { $verdict = 'INCOMPATIVEL (Build A pelo executavel - precisa reinstalar)' }
      $motivo += ' Classificado pelo executavel: marcadores LOJA_NAO_CONFIGURADA=' + $temLoja + ', op=ativar=' + $temAtiv + '.'
    } elseif ($exeInfo.Count -gt 1) {
      $verdict = 'INDETERMINADO'; $motivo += ' Mais de um executavel encontrado; nao da para saber qual roda.'
    } else {
      $verdict = 'INDETERMINADO'; $motivo += ' Executavel nao encontrado nos caminhos padrao.'
    }
  }
} else {
  $verdict = 'INDETERMINADO'
}

# ---------------------------------------------------------------- 7) resumo (sem segredos/PII)
function Fmt($s) { if ($null -eq $s) { return 'n/d' }; return ('total=' + $s.Total + ' validos=' + $s.Validos + ' ultimo_ok=' + $s.UltimoOk + ' invalidos_na_fila=' + $s.InvFila + ' invalidos_ja_enviados=' + $s.InvEnviados) }
$summary = New-Object System.Collections.ArrayList
[void]$summary.Add('Diagnostico PDV - ' + (Get-Date -Format 'yyyy-MM-dd HH:mm:ss') + ' (hora local) - maquina ' + $env:COMPUTERNAME)
[void]$summary.Add('Backup: ' + $Dest + '  (ACL restrita ao usuario atual)')
[void]$summary.Add('Arquivos copiados: ' + $files.Count + ' - SHA256 OK')
[void]$summary.Add('Metodo: ' + $metodo)
[void]$summary.Add('integrity_check: ' + $integ)
[void]$summary.Add('Fila pendente (outbox PENDENTE): ' + $pend)
[void]$summary.Add('DLQ (outbox ERRO): ' + $dlq)
[void]$summary.Add('CAIXA_ABERTO: ' + (Fmt $cx))
[void]$summary.Add('VENDA_REGISTRADA: ' + (Fmt $vd))
[void]$summary.Add('VEREDITO: ' + $verdict)
[void]$summary.Add('Motivo: ' + $motivo)
[void]$summary.Add('Executavel(is):')
if ($exeInfo.Count -eq 0) { [void]$summary.Add('  nao encontrado (atalho do PDV: botao direito > Abrir local do arquivo)') }
foreach ($e in $exeInfo) { [void]$summary.Add(('  {0} | modificado {1:yyyy-MM-dd HH:mm} | {2} bytes | FileVersion {3} | SHA256 {4}' -f $e.Path, $e.Date, $e.Size, $e.FileVersion, $e.Hash)) }
[void]$summary.Add('')
[void]$summary.Add('SHA256 da copia:')
foreach ($h in $hashLines) { [void]$summary.Add('  ' + $h) }
[void]$summary.Add('')
[void]$summary.Add('ATENCAO: a pasta APPDATA-config contem o SEGREDO DE ATIVACAO/SINCRONIZACAO do dispositivo. Guarde em local seguro (pendrive do dono); nao envie por chat/e-mail.')
[void]$summary.Add('Envie ao suporte SOMENTE este arquivo RESUMO-diagnostico.txt.')
$sumFile = Join-Path -Path $Dest -ChildPath 'RESUMO-diagnostico.txt'
[System.IO.File]::WriteAllLines($sumFile, [string[]]$summary.ToArray(), (New-Object System.Text.UTF8Encoding($false)))
Write-Host ''
for ($i = 0; $i -lt 11; $i++) { Write-Host $summary[$i] }
Write-Warn2 'A pasta de backup contem o segredo de ativacao do PDV. Nao compartilhe a pasta; envie so o RESUMO.'
Write-Info ('Resumo salvo em: ' + $sumFile)
exit 0
