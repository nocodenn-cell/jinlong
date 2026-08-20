# =============================================================================
# Reprodução do E2E crítico — e2e/sync-fluxo-gerente.spec.ts
# Alvo: descobrir o DESTINO REAL do GERENTE e o primeiro ponto de divergência.
#
# Rode da RAIZ do repo, no PowerShell, com Supabase local JÁ no ar
# (o mesmo que você usou para o `db reset`).
#
# NÃO altera timeout, seletor, heading, retry nem regra de autorização.
# Só observa. Cada bloco imprime evidência e pode ser rodado isolado.
# =============================================================================

$ErrorActionPreference = 'Stop'
Set-Location (git rev-parse --show-toplevel)

# ---------------------------------------------------------------------------
# [1] Como o workflow inicia este E2E (para referência)
#     ci-pdv-importados.yml → job "e2e-critical" → `npm run test:e2e:critical`
#                           → pdv-importados/scripts/e2e-critical-pipeline.mjs
#     Aqui rodamos o spec DIRETO, para isolar e habilitar trace sempre.
#     playwright.config.ts: baseURL = PLAYWRIGHT_BASE_URL ?? http://localhost:3000
#                           webServer = `npx next dev -p <porta>` (reusa se já responder)
# ---------------------------------------------------------------------------

# ---------------------------------------------------------------------------
# [3] Supabase local — reutiliza a instância existente e extrai credenciais
# ---------------------------------------------------------------------------
Push-Location backend
$envLines = npx supabase status -o env
Pop-Location

function Get-SbVal([string]$key) {
  $line = $envLines | Where-Object { $_ -match "^$key=" } | Select-Object -First 1
  if (-not $line) { throw "Supabase local não está no ar ou não expôs $key. Rode: cd backend; npx supabase start" }
  ($line -split '=', 2)[1].Trim('"')
}

$SB_URL     = Get-SbVal 'API_URL'
$SB_ANON    = Get-SbVal 'ANON_KEY'
$SB_SERVICE = Get-SbVal 'SERVICE_ROLE_KEY'
$SB_DB      = Get-SbVal 'DB_URL'

Write-Host "`n[3] Supabase local: $SB_URL" -ForegroundColor Cyan

# ---------------------------------------------------------------------------
# [2] Seed do GERENTE + variáveis PLAYWRIGHT_* (espelha o passo do workflow
#     "Seed usuários E2E", que roda scripts/seed-dev-users.mjs)
# ---------------------------------------------------------------------------
$SENHA = 'E2eLocal!2026'          # senha só do ambiente local; nunca commitar
$EMAIL_GERENTE  = 'e2e-gerente@localhost.test'
$EMAIL_OPERADOR = 'e2e-operador@localhost.test'

$env:NEXT_PUBLIC_SUPABASE_URL      = $SB_URL
$env:SUPABASE_URL                  = $SB_URL
$env:NEXT_PUBLIC_SUPABASE_ANON_KEY = $SB_ANON
$env:SUPABASE_SERVICE_ROLE_KEY     = $SB_SERVICE
$env:SEED_DEV_PASSWORD             = $SENHA
$env:SEED_GERENTE_EMAIL            = $EMAIL_GERENTE
$env:SEED_OPERADOR_EMAIL           = $EMAIL_OPERADOR

node pdv-importados/scripts/seed-dev-users.mjs

# ---------------------------------------------------------------------------
# [7] PERFIL EFETIVAMENTE GRAVADO — leitura direta, sem passar pelo app.
#     A app resolve o perfil em sessionConsistency.ts:112 com
#     USUARIO_SELECT = 'perfil, idioma_preferido, loja_id, ativo'.
#     Se qualquer um destes vier errado, o middleware decide diferente.
# ---------------------------------------------------------------------------
Write-Host "`n[7] Linha de usuarios do gerente (fonte da decisão):" -ForegroundColor Cyan
psql $SB_DB -c @"
SELECT u.id, u.perfil, u.ativo, u.loja_id,
       (u.perfil IN ('GERENTE','DONO','ADMIN')) AS perfil_gerencial,
       (u.loja_id IS NOT NULL)                  AS tem_loja
  FROM auth.users a JOIN public.usuarios u ON u.id = a.id
 WHERE a.email = '$EMAIL_GERENTE';
"@

# [7b] A MESMA leitura, mas sob RLS com o JWT do próprio gerente.
#      É este resultado que o middleware enxerga. Se vier 0 linhas aqui e 1 acima,
#      a causa é RLS — e o destino esperado passa a ser /login, não /caixa.
Write-Host "`n[7b] Mesma leitura sob RLS (visão do app):" -ForegroundColor Cyan
Push-Location backend
$env:SEED_DEV_PASSWORD = $SENHA
node scripts/fetch-rls-smoke-jwts.mjs
Pop-Location

# ---------------------------------------------------------------------------
# [4][5] Executa SOMENTE o spec alvo, com trace/screenshot/vídeo sempre ligados
# ---------------------------------------------------------------------------
$env:PLAYWRIGHT_TEST_EMAIL           = $EMAIL_GERENTE
$env:PLAYWRIGHT_TEST_PASSWORD        = $SENHA
$env:PLAYWRIGHT_CAIXA_TEST_EMAIL     = $EMAIL_OPERADOR
$env:PLAYWRIGHT_CAIXA_TEST_PASSWORD  = $SENHA
$env:USE_UNIFIED_SALES_FLOW          = 'true'
$env:STRICT_MANAGER_DISCOUNT_AUTH    = 'true'
$env:AUTO_ENQUEUE_FISCAL_ON_SALE     = 'true'
# SYNC_ENDPOINT/SYNC_KEY: a Edge sync-outbox local. Ajuste se usar outra.
$env:SYNC_ENDPOINT = "$SB_URL/functions/v1/sync-outbox"
if (-not $env:SYNC_KEY) { $env:SYNC_KEY = 'local-dev-sync-key' }

Push-Location pdv-importados
npx playwright test e2e/sync-fluxo-gerente.spec.ts `
  --trace on --screenshot on --video on --reporter list
$exit = $LASTEXITCODE
Pop-Location

# ---------------------------------------------------------------------------
# [6][9] DESTINO REAL após o login e no momento da falha.
#        error-context.md traz o snapshot de acessibilidade da página onde parou.
# ---------------------------------------------------------------------------
Write-Host "`n[6][9] Onde a navegação realmente parou:" -ForegroundColor Cyan
Get-ChildItem pdv-importados/test-results -Recurse -Filter 'error-context.md' |
  ForEach-Object {
    Write-Host "--- $($_.FullName)" -ForegroundColor Yellow
    Select-String -Path $_.FullName -Pattern '^- /url:|Page URL|/caixa|/login|/admin/|/gerente/' |
      Select-Object -First 12 | ForEach-Object { $_.Line }
  }

Write-Host "`nTrace interativo (URL, console, network passo a passo):" -ForegroundColor Cyan
Get-ChildItem pdv-importados/test-results -Recurse -Filter 'trace.zip' |
  ForEach-Object { Write-Host "  npx playwright show-trace `"$($_.FullName)`"" }

exit $exit
