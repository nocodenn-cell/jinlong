#!/bin/bash
# Script: Validar Secrets da Edge Function sync-outbox
# Uso: ./validar-secrets-sync-outbox.sh
#
# Verifica se SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY e SYNC_KEY
# estão configurados no projeto Supabase.
#
# PRÉ-REQUISITO: `supabase` CLI instalado + `supabase link` executado

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(dirname "$SCRIPT_DIR")"
PROJECT_ROOT="$(dirname "$BACKEND_DIR")"

echo "🔐 Validando Secrets da Edge Function sync-outbox..."
echo ""

# Tentar ler secrets via supabase CLI
echo "📋 Verificando secrets configurados no Supabase..."
echo ""

MISSING_SECRETS=()

# Check SUPABASE_URL
echo -n "  • SUPABASE_URL: "
if supabase secrets list --output json 2>/dev/null | grep -q '"SUPABASE_URL"'; then
  echo "✅ Presente"
else
  echo "❌ AUSENTE"
  MISSING_SECRETS+=("SUPABASE_URL")
fi

# Check SUPABASE_SERVICE_ROLE_KEY
echo -n "  • SUPABASE_SERVICE_ROLE_KEY: "
if supabase secrets list --output json 2>/dev/null | grep -q '"SUPABASE_SERVICE_ROLE_KEY"'; then
  echo "✅ Presente"
else
  echo "❌ AUSENTE"
  MISSING_SECRETS+=("SUPABASE_SERVICE_ROLE_KEY")
fi

# Check SYNC_KEY
echo -n "  • SYNC_KEY: "
if supabase secrets list --output json 2>/dev/null | grep -q '"SYNC_KEY"'; then
  echo "✅ Presente"
else
  echo "❌ AUSENTE"
  MISSING_SECRETS+=("SYNC_KEY")
fi

echo ""

if [ ${#MISSING_SECRETS[@]} -eq 0 ]; then
  echo "✅ Todos os secrets obrigatórios estão configurados!"
  echo ""
  echo "📌 Próximo passo: Deploy da Edge Function"
  echo "   npx supabase functions deploy sync-outbox"
  exit 0
else
  echo "❌ FALTAM SECRETS CRÍTICOS:"
  for secret in "${MISSING_SECRETS[@]}"; do
    echo "   - $secret"
  done
  echo ""
  echo "📌 Para configurar, use:"
  echo ""
  echo "   npx supabase secrets set SUPABASE_URL=\"https://SEU_REF.supabase.co\""
  echo "   npx supabase secrets set SUPABASE_SERVICE_ROLE_KEY=\"(valor do Dashboard)\""
  echo "   npx supabase secrets set SYNC_KEY=\"(gere uma chave forte)\""
  echo ""
  echo "   Consulte: backend/supabase/scripts/sync-outbox-secrets.example.sh"
  exit 1
fi
