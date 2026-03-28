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

Write-Host "Copie este script para fora do git (ex.: supabase-secrets.local.ps1) e preencha os valores." -ForegroundColor Yellow
Write-Host "Documentação: docs/CIRCUITO_OPERACIONAL.md e backend/supabase/README.md" -ForegroundColor Cyan
