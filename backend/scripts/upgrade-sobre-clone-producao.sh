#!/usr/bin/env bash
# Valida que as migrations desta entrega são aplicáveis SOBRE O SCHEMA REAL DE
# PRODUÇÃO — não apenas sobre um replay limpo.
#
# POR QUE ISTO EXISTE: o smoke local roda contra o banco reconstruído pelas
# migrations, que diverge de produção (drift). Em 2026-08-16 esse ponto cego
# escondeu um erro que teria derrubado a promoção: a migration de RLS recriava
# `list_produtos_gerente_filtrados` com 13 colunas (a versão do schema local),
# enquanto produção tem 17 — `CREATE OR REPLACE` recusa mudança de tipo de
# retorno, e como cada migration roda em transação, o hardening inteiro seria
# revertido. Replay limpo passava; produção falharia.
#
# O que faz: carrega o dump ESTRUTURAL de produção (sem dados) num banco
# descartável dentro do Postgres local, aplica as migrations da entrega nessa
# cópia e reporta o resultado. Não toca em produção — o dump é read-only.
#
# Uso:
#   backend/scripts/upgrade-sobre-clone-producao.sh <caminho-do-dump.sql>
set -euo pipefail

DUMP="${1:?informe o caminho do dump estrutural de produção}"
CONTAINER="${CONTAINER:-supabase_db_fastproduct}"
DB="clone_prod_upgrade_test"
MIG_DIR="$(cd "$(dirname "$0")/../supabase/migrations" && pwd)"

# Só as migrations desta entrega — as anteriores já constam no tracking de produção.
MIGRATIONS=(
  20260816135000_reconcilia_produtos_codigo_interno.sql
  20260816140000_rls_produtos_historico_isolamento_por_loja.sql
  20260816141000_criar_produto_autoria_atomica.sql
  20260816142000_indices_fks_autoria_produtos.sql
  20260816143000_atualizar_produto_com_faixa_atacado.sql
)

echo "=== Upgrade sobre clone do schema de produção ==="
echo "dump: $DUMP"

echo "--- recriando banco descartável $DB ---"
docker exec "$CONTAINER" psql -U postgres -d postgres -q \
  -c "DROP DATABASE IF EXISTS $DB;" -c "CREATE DATABASE $DB;"

# `supabase db dump` traz só o schema `public`. O schema `auth` é gerenciado
# pelo Supabase e não vem no dump, mas o schema de produção depende dele: FKs de
# autoria apontam para `auth.users`, e as funções/policies chamam `auth.uid()`,
# `auth.jwt()` e `auth.role()`. Sem o stub, o carregamento perde as FKs e a
# migration de RLS falha com `schema "auth" does not exist` — um falso negativo
# do teste, não um problema real da migration.
#
# O stub reproduz apenas o CONTRATO (assinaturas e a tabela referenciada), que é
# o que importa para validar aplicabilidade de DDL. Não simula autenticação —
# comportamento de RLS em runtime é o que o smoke PostgREST cobre.
echo "--- criando stub do schema auth (não vem no db dump) ---"
docker exec -i "$CONTAINER" psql -U postgres -d "$DB" -q <<'SQL'
CREATE SCHEMA IF NOT EXISTS auth;
CREATE TABLE IF NOT EXISTS auth.users (id uuid PRIMARY KEY);
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
  $fn$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $fn$;
CREATE OR REPLACE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS
  $fn$ SELECT nullif(current_setting('request.jwt.claim.role', true), '') $fn$;
CREATE OR REPLACE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS
  $fn$ SELECT coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $fn$;
DO $do$
BEGIN
  CREATE ROLE authenticated;
EXCEPTION WHEN duplicate_object THEN NULL;
END $do$;
DO $do$
BEGIN
  CREATE ROLE anon;
EXCEPTION WHEN duplicate_object THEN NULL;
END $do$;
DO $do$
BEGIN
  CREATE ROLE service_role;
EXCEPTION WHEN duplicate_object THEN NULL;
END $do$;
SQL

echo "--- carregando schema de produção ---"
LOAD_ERR=$(docker exec -i "$CONTAINER" psql -U postgres -d "$DB" -q -v ON_ERROR_STOP=0 < "$DUMP" 2>&1 | grep -c '^ERROR' || true)
echo "erros ignorados no carregamento do dump: $LOAD_ERR (objetos gerenciados pelo Supabase ausentes no stub)"

# Confirma que o clone é mesmo o de produção, e não um replay local.
COLS=$(docker exec "$CONTAINER" psql -U postgres -d "$DB" -t -A -c \
  "SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='produtos';")
RET=$(docker exec "$CONTAINER" psql -U postgres -d "$DB" -t -A -c \
  "SELECT pg_get_function_result(oid) FROM pg_proc WHERE proname='list_produtos_gerente_filtrados' LIMIT 1;")
echo "clone: produtos tem $COLS colunas"
echo "clone: list_produtos_gerente_filtrados retorna -> ${RET:0:80}..."

if [ -z "$RET" ]; then
  echo "ABORTADO: o clone não contém list_produtos_gerente_filtrados — dump incompleto."
  exit 2
fi

# Sanidade: as tabelas que as migrations tocam precisam ter vindo no dump,
# senão o teste passaria por vacuidade.
for t in produtos usuarios historico_precos_produto precos_atacado produto_create_requests; do
  EXISTE=$(docker exec "$CONTAINER" psql -U postgres -d "$DB" -t -A -c \
    "SELECT to_regclass('public.$t') IS NOT NULL;")
  if [ "$EXISTE" != "t" ]; then
    echo "ABORTADO: tabela public.$t ausente no clone — dump incompleto."
    exit 2
  fi
done
echo "clone: tabelas alvo presentes (produtos, usuarios, historico_precos_produto, precos_atacado, produto_create_requests)"

FALHAS=0
for m in "${MIGRATIONS[@]}"; do
  echo "--- aplicando $m ---"
  if docker exec -i "$CONTAINER" psql -U postgres -d "$DB" -q -v ON_ERROR_STOP=1 --single-transaction \
       < "$MIG_DIR/$m" 2>&1 | sed 's/^/    /'; then
    echo "    OK"
  else
    echo "    FALHOU"
    FALHAS=$((FALHAS + 1))
  fi
done

echo "--- estado pós-upgrade no clone ---"
docker exec "$CONTAINER" psql -U postgres -d "$DB" -c \
  "SELECT policyname, cmd, roles::text FROM pg_policies WHERE tablename IN ('produtos','historico_precos_produto') ORDER BY tablename, policyname;"
docker exec "$CONTAINER" psql -U postgres -d "$DB" -c \
  "SELECT numeric_precision, numeric_scale FROM information_schema.columns WHERE table_name='produtos' AND column_name='preco_custo_medio';"
docker exec "$CONTAINER" psql -U postgres -d "$DB" -t -A -c \
  "SELECT 'list RPC retorna ' || (length(pg_get_function_result(oid)) - length(replace(pg_get_function_result(oid), ',', '')) + 1) || ' colunas, secdef=' || prosecdef FROM pg_proc WHERE proname='list_produtos_gerente_filtrados';"
docker exec "$CONTAINER" psql -U postgres -d "$DB" -t -A -c \
  "SELECT 'indices de autoria: ' || count(*) FROM pg_indexes WHERE indexname IN ('idx_produtos_criado_por','idx_produtos_atualizado_por','idx_historico_precos_produto_alterado_por');"
docker exec "$CONTAINER" psql -U postgres -d "$DB" -t -A -c \
  "SELECT 'policies orfas restantes: ' || count(*) FROM pg_policies WHERE tablename='produtos' AND policyname IN ('caixa_policy','painel_policy');"

echo "--- limpando ---"
docker exec "$CONTAINER" psql -U postgres -d postgres -q -c "DROP DATABASE IF EXISTS $DB;"

if [ "$FALHAS" -gt 0 ]; then
  echo "=== $FALHAS migration(s) FALHARAM sobre o schema de produção ==="
  exit 1
fi
echo "=== todas as migrations aplicaram sobre o schema de produção ==="
