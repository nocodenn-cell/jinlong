# Exemplo: definir secrets da Edge Function no Supabase (rode no seu PC, NÃO commite).
# Substitua os placeholders pelos valores do Dashboard. Nunca cole service_role em repositório.
#
#   cd backend
#   ..\pdv-importados\scripts\supabase-edge-secrets.example.ps1
#
# Requer: npx supabase link (projeto já vinculado)

$ErrorActionPreference = 'Stop'

# npx supabase secrets set --env-file .env.secrets.local
# ou linha a linha (use aspas se necessário):
# npx supabase secrets set SUPABASE_URL="https://xxxx.supabase.co"
# npx supabase secrets set SUPABASE_SERVICE_ROLE_KEY="(cole no terminal, não em arquivo versionado)"
# npx supabase secrets set SYNC_KEY="(gere um segredo forte)"
#
# sync-outbox — fila fiscal após venda do PDV local (opcional; predefinição = desligado):
# npx supabase secrets set AUTO_ENQUEUE_FISCAL_ON_SYNCED_SALE="true"
# npx supabase secrets set FISCAL_DEFAULT_DOC_TYPE="NFC_E_STUB"
#
# CORS da Edge validar-gerente:
# Produção: lista fixa + modo estrito (bloqueia browser sem Origin na lista; * desligado).
# npx supabase secrets set VALIDAR_GERENTE_CORS_STRICT="true"
# npx supabase secrets set VALIDAR_GERENTE_ALLOWED_ORIGINS="https://seu-app.vercel.app,http://localhost:3000"
# Dev/homolog sem STRICT: pode omitir os dois — mantém Access-Control-Allow-Origin: * (não usar em prod).

Write-Host "Copie este script para fora do git (ex.: supabase-secrets.local.ps1) e preencha os valores." -ForegroundColor Yellow
Write-Host "Documentação: docs/CIRCUITO_OPERACIONAL.md e backend/supabase/README.md" -ForegroundColor Cyan
