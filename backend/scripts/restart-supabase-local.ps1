# Para na stack local deste monorepo (project_id em supabase/config.toml) e sobe de novo.
# Uso: na raiz do repo ou em qualquer pasta — powershell -File backend/scripts/restart-supabase-local.ps1
$backendRoot = Split-Path -Parent $PSScriptRoot
Set-Location $backendRoot

npx supabase stop --project-id fastproduct
npx supabase start
exit $LASTEXITCODE
