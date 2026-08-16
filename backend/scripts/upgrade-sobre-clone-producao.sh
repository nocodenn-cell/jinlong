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

# --sabotar: injeta um erro estrutural em `public` no dump antes de carregar,
# para provar que o classificador REJEITA um clone infiel em vez de seguir
# validando um schema que não é o de produção. Controle negativo do próprio
# teste (o modo normal deve passar; este deve abortar com código 2).
SABOTAR=0
[ "${2:-}" = "--sabotar" ] && SABOTAR=1
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
# Carregar com tolerância cega mascarava clone incompleto: bastava um objeto de
# `public` falhar para o teste seguir validando um schema que não é o de
# produção. Agora todo erro é capturado e CLASSIFICADO — só erros que se
# explicam pela ausência de objetos gerenciados pelo Supabase (schemas
# auth/storage/realtime, extensões, roles do serviço) são tolerados. Qualquer
# erro tocando `public` aborta.
LOAD_LOG=$(mktemp)
DUMP_EFETIVO="$DUMP"
if [ "$SABOTAR" = "1" ]; then
  echo "!!! modo --sabotar: injetando erro estrutural em public !!!"
  DUMP_EFETIVO=$(mktemp)
  cat "$DUMP" > "$DUMP_EFETIVO"
  # Referência a tabela inexistente: gera ERROR em `public`, que NÃO pode ser
  # classificado como tolerável. Se o script seguir, o classificador é frouxo.
  echo 'ALTER TABLE public.tabela_que_nao_existe ADD COLUMN x int;' >> "$DUMP_EFETIVO"
fi
docker exec -i "$CONTAINER" psql -U postgres -d "$DB" -q -v ON_ERROR_STOP=0 < "$DUMP_EFETIVO" > "$LOAD_LOG" 2>&1 || true
[ "$SABOTAR" = "1" ] && rm -f "$DUMP_EFETIVO"

TOTAL_ERR=$(grep -c '^ERROR' "$LOAD_LOG" || true)
# Erros aceitáveis: infraestrutura gerenciada pelo Supabase que não existe num
# banco descartável. A lista é ESTRITA — cada padrão nomeia o objeto específico
# em vez de casar por categoria.
#
# Padrões genéricos foram removidos após a auditoria de 2026-08-16: um
# `permission denied` ou `must be owner` solto casaria também com falhas
# estruturais em `public` (uma tabela que não pôde ser criada, um GRANT que não
# passou), deixando o clone infiel sem que o teste percebesse. `extension "..."`
# genérico tinha o mesmo problema. Agora só passam mensagens em que o objeto
# citado é comprovadamente de schema gerenciado pelo Supabase.
TOLERAVEIS_RE='schema "(auth|storage|realtime|extensions|graphql|graphql_public|vault|supabase_migrations|supabase_functions|pgbouncer|net|cron|pgsodium|pgsodium_masks)" does not exist'
TOLERAVEIS_RE+='|role "(supabase_admin|supabase_auth_admin|supabase_storage_admin|supabase_functions_admin|supabase_realtime_admin|dashboard_user|authenticator|pgbouncer|pgsodium_keyholder|pgsodium_keyiduser|pgsodium_keymaker)" does not exist'
TOLERAVEIS_RE+='|extension "(pg_graphql|pg_stat_statements|pgcrypto|pgjwt|pgsodium|supabase_vault|uuid-ossp|pg_net|pg_cron|pg_trgm|plpgsql|http|wrappers|hypopg|index_advisor)" (already exists|does not exist|is not available)'
TOLERAVEIS_RE+='|can only create extension in database postgres'
TOLERAVEIS_RE+='|publication "supabase_realtime" does not exist'
# Hook de instalação de extensão do Supabase: lê
# /etc/postgresql-custom/extension-custom-scripts/*.sql, que só o superusuário
# da imagem alcança. Nomeado especificamente — não é o `permission denied`
# genérico que foi removido por mascarar falhas em `public`.
TOLERAVEIS_RE+='|permission denied for function pg_read_file'
TOLERAVEIS=$(grep '^ERROR' "$LOAD_LOG" \
  | grep -Ec "$TOLERAVEIS_RE" \
  || true)
INESPERADOS=$((TOTAL_ERR - TOLERAVEIS))

echo "carregamento: $TOTAL_ERR erro(s), $TOLERAVEIS tolerável(is), $INESPERADOS inesperado(s)"
if [ "$INESPERADOS" -gt 0 ]; then
  echo "ABORTADO: erros não classificáveis no carregamento — o clone não é fiel:"
  grep '^ERROR' "$LOAD_LOG" \
    | grep -Ev "$TOLERAVEIS_RE" \
    | head -20
  rm -f "$LOAD_LOG"
  exit 2
fi
rm -f "$LOAD_LOG"

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

echo "--- asserções rigorosas sobre o clone pós-upgrade ---"
# Cada linha do bloco abaixo devolve PASS/FALHA. Antes isto imprimia dados soltos
# para leitura humana; agora é verificação com veredito, incluindo ORDEM exata
# do contrato de retorno, grants, revogações e predicados dos índices.
# -v ON_ERROR_STOP=1: um erro de SQL no próprio bloco de asserções antes
# resultava em saída vazia e ZERO falhas contadas — o script dava "tudo certo"
# sem ter verificado nada. Agora aborta.
ASSERT_OUT=$(docker exec -i "$CONTAINER" psql -U postgres -d "$DB" -t -A -v ON_ERROR_STOP=1 <<'SQL'
WITH t AS (
  SELECT
    -- Contrato COMPLETO e ORDENADO da RPC de listagem (17 colunas)
    (SELECT pg_get_function_result(oid) FROM pg_proc WHERE proname='list_produtos_gerente_filtrados' LIMIT 1) AS ret,
    (SELECT prosecdef FROM pg_proc WHERE proname='list_produtos_gerente_filtrados' LIMIT 1) AS secdef,
    (SELECT numeric_precision FROM information_schema.columns WHERE table_name='produtos' AND column_name='preco_custo_medio') AS prec,
    (SELECT numeric_scale FROM information_schema.columns WHERE table_name='produtos' AND column_name='preco_custo_medio') AS esc,
    (SELECT count(*) FROM pg_policies WHERE tablename='produtos' AND policyname IN ('caixa_policy','painel_policy')) AS orfas,
    (SELECT count(*) FROM pg_policies WHERE tablename IN ('produtos','historico_precos_produto') AND roles::text = '{authenticated}') AS pol_auth,
    (SELECT count(*) FROM pg_policies WHERE tablename='produtos' AND cmd='ALL' AND with_check IS NOT NULL) AS com_check,
    (SELECT count(*) FROM pg_indexes WHERE indexname='idx_produtos_criado_por' AND indexdef ILIKE '%WHERE (criado_por IS NOT NULL)%') AS ix1,
    (SELECT count(*) FROM pg_indexes WHERE indexname='idx_produtos_atualizado_por' AND indexdef ILIKE '%WHERE (atualizado_por IS NOT NULL)%') AS ix2,
    (SELECT count(*) FROM pg_indexes WHERE indexname='idx_historico_precos_produto_alterado_por' AND indexdef ILIKE '%WHERE (alterado_por IS NOT NULL)%') AS ix3,
    (SELECT count(*) FROM pg_proc WHERE proname='atualizar_produto_com_faixa_atacado') AS rpc_faixa,
    -- grants: helpers precisam de EXECUTE para authenticated e NÃO para anon
    (SELECT count(*) FROM pg_proc p WHERE p.proname IN ('auth_usuario_eh_admin','auth_usuario_loja_id','auth_pode_ver_produto_gerencial')
       AND has_function_privilege('authenticated', p.oid, 'EXECUTE')) AS helpers_auth,
    (SELECT count(*) FROM pg_proc p WHERE p.proname IN ('auth_usuario_eh_admin','auth_usuario_loja_id','auth_pode_ver_produto_gerencial')
       AND has_function_privilege('anon', p.oid, 'EXECUTE')) AS helpers_anon,
    (SELECT has_function_privilege('authenticated', p.oid, 'EXECUTE') FROM pg_proc p WHERE p.proname='list_produtos_gerente_filtrados' LIMIT 1) AS list_auth,
    (SELECT has_function_privilege('anon', p.oid, 'EXECUTE') FROM pg_proc p WHERE p.proname='list_produtos_gerente_filtrados' LIMIT 1) AS list_anon,
    (SELECT count(*) FROM pg_proc p WHERE p.proname IN ('registrar_criado_por_produto','registrar_atualizado_por_produto')
       AND has_function_privilege('authenticated', p.oid, 'EXECUTE')) AS trg_auth
)
SELECT 'contrato da RPC (17 colunas, ordem exata)|' || (ret =
  'TABLE(id uuid, nome text, codigo_barras text, preco_varejo numeric, preco_atacado numeric, quantidade_gatilho_atacado integer, origem text, tem_nf boolean, ativo boolean, categoria_id uuid, fornecedor_id uuid, marca_id uuid, unidade_medida text, observacao text, imagem_url text, tags text[], total_count bigint)')::text
  || '|' || coalesce(ret,'(ausente)') FROM t
UNION ALL SELECT 'RPC de listagem é SECURITY INVOKER|' || (secdef = false)::text || '|secdef=' || secdef FROM t
UNION ALL SELECT 'preco_custo_medio numeric(10,2)|' || (prec = 10 AND esc = 2)::text || '|' || prec || ',' || esc FROM t
UNION ALL SELECT 'policies orfas removidas|' || (orfas = 0)::text || '|orfas=' || orfas FROM t
UNION ALL SELECT 'as 3 policies estao TO authenticated|' || (pol_auth = 3)::text || '|=' || pol_auth FROM t
UNION ALL SELECT 'produtos_escrita tem WITH CHECK|' || (com_check >= 1)::text || '|=' || com_check FROM t
UNION ALL SELECT 'indice criado_por parcial|' || (ix1 = 1)::text || '|=' || ix1 FROM t
UNION ALL SELECT 'indice atualizado_por parcial|' || (ix2 = 1)::text || '|=' || ix2 FROM t
UNION ALL SELECT 'indice alterado_por parcial|' || (ix3 = 1)::text || '|=' || ix3 FROM t
UNION ALL SELECT 'RPC transacional presente|' || (rpc_faixa = 1)::text || '|=' || rpc_faixa FROM t
UNION ALL SELECT 'helpers com EXECUTE p/ authenticated|' || (helpers_auth = 3)::text || '|=' || helpers_auth FROM t
UNION ALL SELECT 'helpers SEM EXECUTE p/ anon|' || (helpers_anon = 0)::text || '|=' || helpers_anon FROM t
UNION ALL SELECT 'list RPC com EXECUTE p/ authenticated|' || (list_auth)::text || '|=' || list_auth FROM t
UNION ALL SELECT 'list RPC SEM EXECUTE p/ anon|' || (NOT list_anon)::text || '|=' || list_anon FROM t
UNION ALL SELECT 'trigger functions SEM EXECUTE p/ authenticated|' || (trg_auth = 0)::text || '|=' || trg_auth FROM t

-- ── Predicados RLS COMPLETOS ────────────────────────────────────────────────
-- Antes só se contava policies e papéis; o TEXTO do predicado não era conferido,
-- então uma policy com o nome certo e a condição errada passaria batido.
UNION ALL
SELECT 'produtos_leitura: cmd/roles/qual exatos|'
  || (cmd = 'SELECT' AND roles::text = '{authenticated}'
      AND qual = '(auth_usuario_eh_admin() OR (loja_id = auth_usuario_loja_id()))'
      AND with_check IS NULL)::text
  || '|cmd=' || cmd || ' roles=' || roles::text || ' qual=' || coalesce(qual,'(nulo)')
FROM pg_policies WHERE tablename='produtos' AND policyname='produtos_leitura'
UNION ALL
SELECT 'produtos_escrita: USING e WITH CHECK idênticos e por loja|'
  || (cmd = 'ALL' AND roles::text = '{authenticated}'
      AND qual = 'auth_usuario_gerencial_loja(loja_id)'
      AND with_check = 'auth_usuario_gerencial_loja(loja_id)')::text
  || '|qual=' || coalesce(qual,'(nulo)') || ' check=' || coalesce(with_check,'(nulo)')
FROM pg_policies WHERE tablename='produtos' AND policyname='produtos_escrita'
UNION ALL
SELECT 'historico_precos_produto_leitura: predicado por produto|'
  || (cmd = 'SELECT' AND roles::text = '{authenticated}'
      AND qual = 'auth_pode_ver_produto_gerencial(produto_id)')::text
  || '|qual=' || coalesce(qual,'(nulo)')
FROM pg_policies WHERE tablename='historico_precos_produto' AND policyname='historico_precos_produto_leitura'
UNION ALL
SELECT 'produtos tem EXATAMENTE 2 policies (nenhuma permissiva extra)|'
  || (count(*) = 2)::text || '|=' || count(*) || ' [' || string_agg(policyname, ',' ORDER BY policyname) || ']'
FROM pg_policies WHERE tablename='produtos'
UNION ALL
SELECT 'RLS habilitada em produtos e historico_precos_produto|'
  || (bool_and(c.relrowsecurity))::text || '|=' || bool_and(c.relrowsecurity)::text
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relname IN ('produtos','historico_precos_produto')

-- ── Assinaturas e search_path das funções novas ─────────────────────────────
UNION ALL
SELECT 'atualizar_produto_com_faixa_atacado: assinatura e SECURITY DEFINER|'
  || (pg_get_function_identity_arguments(oid) = 'p_produto_id uuid, p_payload jsonb, p_ator_id uuid, p_faixa jsonb'
      AND prosecdef
      AND array_to_string(proconfig, ',') LIKE '%search_path=public%')::text
  || '|args=' || pg_get_function_identity_arguments(oid)
  || ' secdef=' || prosecdef || ' cfg=' || coalesce(array_to_string(proconfig, ','), '(nenhum)')
FROM pg_proc WHERE proname='atualizar_produto_com_faixa_atacado'
UNION ALL
SELECT 'p_ator_id e p_faixa têm DEFAULT (2 args opcionais)|'
  || (pronargdefaults = 2)::text || '|defaults=' || pronargdefaults
FROM pg_proc WHERE proname='atualizar_produto_com_faixa_atacado'
UNION ALL
SELECT 'helpers de RLS: STABLE + SECURITY DEFINER + search_path|'
  || (count(*) = 3)::text || '|conformes=' || count(*)
FROM pg_proc p
WHERE p.proname IN ('auth_usuario_eh_admin','auth_usuario_loja_id','auth_pode_ver_produto_gerencial')
  AND p.provolatile = 's' AND p.prosecdef
  AND array_to_string(p.proconfig, ',') LIKE '%search_path=public%'
UNION ALL
SELECT 'RPC transacional faz FOR UPDATE na linha do produto|'
  || (prosrc LIKE '%FOR UPDATE%')::text || '|=' || (prosrc LIKE '%FOR UPDATE%')::text
FROM pg_proc WHERE proname='atualizar_produto_com_faixa_atacado'
UNION ALL
SELECT 'RPC de criação usa advisory lock por request|'
  || (prosrc LIKE '%pg_advisory_xact_lock%')::text || '|=' || (prosrc LIKE '%pg_advisory_xact_lock%')::text
FROM pg_proc WHERE proname='criar_produto_com_estoque_inicial'
UNION ALL
SELECT 'RPC de criação valida a loja do request no replay|'
  || (prosrc LIKE '%CRIAR_PRODUTO_REQUEST_OUTRA_LOJA%')::text || '|=' || (prosrc LIKE '%CRIAR_PRODUTO_REQUEST_OUTRA_LOJA%')::text
FROM pg_proc WHERE proname='criar_produto_com_estoque_inicial'
UNION ALL
SELECT 'trigger de histórico aceita ator explícito (app.ator_id)|'
  || (prosrc LIKE '%app.ator_id%')::text || '|=' || (prosrc LIKE '%app.ator_id%')::text
FROM pg_proc WHERE proname='registrar_historico_preco_produto'
SQL
)
if [ -z "$ASSERT_OUT" ]; then
  echo "ABORTADO: bloco de asserções não produziu saída (erro de SQL) — nada foi verificado."
  docker exec "$CONTAINER" psql -U postgres -d postgres -q -c "DROP DATABASE IF EXISTS $DB;" >/dev/null 2>&1
  exit 2
fi

ASSERT_FALHAS=0
while IFS='|' read -r nome ok detalhe; do
  [ -z "$nome" ] && continue
  # `(expr)::text` de boolean no Postgres devolve 'true'/'false' — não 't'/'f'.
  if [ "$ok" = "true" ] || [ "$ok" = "t" ]; then
    echo "PASS  $nome"
  else
    echo "FALHA $nome — ${detalhe:0:160}"
    ASSERT_FALHAS=$((ASSERT_FALHAS + 1))
  fi
done <<< "$ASSERT_OUT"

echo "--- limpando ---"
docker exec "$CONTAINER" psql -U postgres -d postgres -q -c "DROP DATABASE IF EXISTS $DB;"

if [ "$FALHAS" -gt 0 ]; then
  echo "=== $FALHAS migration(s) FALHARAM sobre o schema de produção ==="
  exit 1
fi
if [ "$ASSERT_FALHAS" -gt 0 ]; then
  echo "=== migrations aplicaram, mas $ASSERT_FALHAS asserção(ões) de estado falharam ==="
  exit 1
fi
echo "=== todas as migrations aplicaram e todas as asserções passaram sobre o schema de produção ==="
