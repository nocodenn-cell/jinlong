#!/usr/bin/env bash
# Prova de RLS do hub comercial num Postgres descartável (stub mínimo de auth.* do Supabase).
# Uso: PGURL=postgres://... bash hub/scripts/rls-test.sh   (o banco deve estar vazio/descartável)
set -euo pipefail
DIR="$(cd "$(dirname "$0")/.." && pwd)"
MIG="$DIR/../backend/supabase/migrations"
: "${PGURL:?PGURL obrigatório (banco descartável)}"
run() { psql "$PGURL" -v ON_ERROR_STOP=1 -q -o /dev/null -f "$1"; }
run "$DIR/supabase/test/auth_stub.sql"
run "$DIR/supabase/20261021115705_nature_code_commercial_hub.sql"
run "$DIR/supabase/test/rls_test.sql"
echo "RLS hub OK"
# Campos do site (city/segment/utm_*, wechat/idioma) — usados pelo CRM
run "$MIG/20261022000000_commercial_leads_landing_fields.sql"
run "$MIG/20261022001000_commercial_leads_jinlong_wechat_idioma.sql"
# GROWTH-001 · Central de Conversão: stub do ERP + migration + regras de conversão manual
run "$DIR/supabase/test/erp_stub.sql"
run "$MIG/20261023130000_growth001_central_conversao.sql"
run "$DIR/supabase/test/central_conversao_test.sql"
echo "Central de Conversão OK"
# CRM-001 · Central Comercial: equipe, etapas, agenda, propostas, conversão, auditoria
run "$DIR/supabase/20261120120000_commercial_crm.sql"
run "$DIR/supabase/test/crm_test.sql"
# Revisão do PR #688: fixes (catálogo p/ vendedor, LGPD na auditoria, conversão, travamentos) + regressão
run "$DIR/supabase/20261120120100_commercial_crm_revisao.sql"
run "$DIR/supabase/test/crm_revisao_test.sql"
# Migration reaplicável (idempotente) e Central de Conversão continua funcionando depois do CRM
run "$DIR/supabase/20261120120000_commercial_crm.sql"
run "$DIR/supabase/20261120120100_commercial_crm_revisao.sql"
# Rollback documentado roda e a migration volta limpa
run "$DIR/supabase/rollback/20261120120000_commercial_crm.rollback.sql"
run "$DIR/supabase/20261120120000_commercial_crm.sql"
run "$DIR/supabase/20261120120100_commercial_crm_revisao.sql"
echo "CRM OK"
