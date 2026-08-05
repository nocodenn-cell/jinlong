#!/usr/bin/env node
/**
 * Gerador da migration 289 (Pacote 1 / Bloco A).
 *
 * Existe para que o corpo das duas funções seja **cópia fiel** da linhagem versionada,
 * e não transcrição manual. Reexecutável: regenera o arquivo idêntico.
 * Aborta se qualquer fragmento esperado não for encontrado — nunca gera parcial.
 *
 * Uso: node backend/scripts/gen-289-migration.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const MIG = path.join(ROOT, 'backend/supabase/migrations')
const read = (f) => readFileSync(path.join(MIG, f), 'utf8').replace(/\r/g, '')

function extrair(arquivo, inicioRe) {
  const src = read(arquivo)
  const i = src.search(inicioRe)
  if (i < 0) throw new Error(`bloco não encontrado em ${arquivo}`)
  const j = src.indexOf('$$;', i)
  if (j < 0) throw new Error(`terminador não encontrado em ${arquivo}`)
  return src.slice(i, j + 3)
}

function trocar(texto, de, para, rotulo) {
  if (!texto.includes(de)) throw new Error(`${rotulo}: fragmento esperado não encontrado — abortar`)
  return texto.replace(de, para)
}

// ── SEC-02 / TB-01 ────────────────────────────────────────────────────────────
let criar = extrair(
  '20260718135138_criar_produto_permite_operador_pdv.sql',
  /CREATE OR REPLACE FUNCTION public\.criar_produto_com_estoque_inicial/
)
criar = trocar(
  criar,
  "  -- OPERADOR: só cadastro relâmpago no PDV (action dedicada). Catálogo completo = GERENTE+.\n" +
    "  IF v_perfil NOT IN ('OPERADOR', 'GERENTE', 'DONO', 'ADMIN') THEN",
  "  -- Cadastro de produto pertence ao módulo Produtos (/admin/catalogo). O PDV não cadastra.\n" +
    "  -- Decisão de 2026-07-30 (.cursor/rules/entity-ssot.mdc) — RN-019.\n" +
    "  IF v_perfil NOT IN ('GERENTE', 'DONO', 'ADMIN') THEN",
  'SEC-02'
)
if (criar.includes("'OPERADOR'")) throw new Error('SEC-02: OPERADOR remanescente')

// ── SSOT-01 ───────────────────────────────────────────────────────────────────
let ajustar = extrair(
  '20260718135500_ajuste_estoque_inicial_operador_pdv.sql',
  /CREATE OR REPLACE FUNCTION public\.ajustar_estoque_manual/
)
ajustar = trocar(
  ajustar,
  '  v_observacao text;\n  v_estoque_inicial boolean;\n',
  '  v_observacao text;\n',
  'SSOT-01 (declaração)'
)
ajustar = trocar(
  ajustar,
  "  v_estoque_inicial :=\n" +
    "    p_motivo_codigo = 'ACERTO_INVENTARIO'\n" +
    "    AND COALESCE(BTRIM(p_observacao), '') = 'Estoque inicial no cadastro de produto';\n\n" +
    "  IF v_perfil NOT IN ('GERENTE', 'DONO', 'ADMIN')\n" +
    "     AND NOT (v_perfil = 'OPERADOR' AND v_estoque_inicial) THEN",
  "  -- SSOT-01: autorização deriva do papel no servidor, nunca de string enviada pelo\n" +
    "  -- cliente. A exceção anterior liberava OPERADOR quando `p_observacao` casava um\n" +
    "  -- literal mágico — e ambos os parâmetros são escolhidos por quem chama.\n" +
    "  IF v_perfil NOT IN ('GERENTE', 'DONO', 'ADMIN') THEN",
  'SSOT-01 (gate)'
)
if (ajustar.includes('v_estoque_inicial')) throw new Error('SSOT-01: v_estoque_inicial remanescente')
if (ajustar.includes('Estoque inicial no cadastro de produto'))
  throw new Error('SSOT-01: string mágica remanescente')
if (ajustar.includes("'OPERADOR'")) throw new Error('SSOT-01: OPERADOR remanescente')

const Q = "'" // evita ambiguidade de escape nos literais SQL abaixo
const OPERADOR_LIT = Q + Q + Q + 'OPERADOR' + Q + Q + Q

const sql = `-- ============================================================================
-- 289 — Pacote 1 / Bloco A: fecha SEC-01, SEC-02, SSOT-01 e TB-01.
--
-- NAO APLICAR sem antes rodar \`backend/supabase/README_289_precheck.sql.txt\` no banco alvo.
-- Ver \`backend/supabase/README_289_precheck.sql.txt\` para o procedimento completo.
--
-- GERADO por \`backend/scripts/gen-289-migration.mjs\` a partir da linhagem versionada.
-- Não editar à mão: reexecute o gerador.
--
-- Por que uma migration nova em vez de reexecutar a 20260730093000
--   Aquela migration nunca rodou em produção. O \`supabase migration repair\` de
--   2026-08-02 gravou a linha em schema_migrations sem executar o arquivo:
--     migration_status_before_repair.txt:198  -> coluna Remote VAZIA
--     migration_status_current.txt:166        -> coluna Remote preenchida
--   Como o Supabase agora a considera aplicada, ela não roda mais. Daí a 289.
--
--   Correção de diagnóstico: SSOT-02 atribui a falha a "guarda pg_get_functiondef
--   que engole o erro". Não procede — a 20260730093000 tem RAISE EXCEPTION no ramo
--   "fragmento não encontrado" e revalida o efeito em seguida. Ela não falhou em
--   silêncio: não foi executada.
--
-- Estratégia (Cap. 9 + armadilha do Pacote 1)
--   CREATE OR REPLACE com corpo completo. Nada de patch textual sobre
--   pg_get_functiondef. Os corpos são cópia da linhagem (20260718135138 e
--   20260718135500), conferida contra o dump de produção por
--   \`backend/scripts/verify-289-preconditions.mjs\`.
--
-- ACL: CREATE OR REPLACE preserva grants; os GRANT/REVOKE são reafirmados de
--      forma idempotente ao final de cada bloco.
-- ============================================================================

BEGIN;

-- ============================================================================
-- SEC-01 — baixar_estoque_venda: remover superfície exposta a anon/authenticated
--
-- REVOKE, não DROP. A função não tem definição em nenhuma migration nem chamador
-- em código de aplicação (varredura: pdv-importados, pdv-local, shared-core, edge
-- functions, backend/scripts, migrations). Mas "sem chamador no repositório" não é
-- "sem chamador": pode haver script operacional externo não versionado
-- (docs/BL2_AUDITORIA_PROFUNDA_GO_LIVE.md, linha 70). REVOKE fecha a exposição
-- agora e é reversível; o DROP entra depois, com evidência de zero invocação.
--
-- service_role é preservado de propósito: é a role de um processo interno
-- legítimo, e mantê-la evita quebrar um uso desconhecido enquanto se investiga.
-- ============================================================================

DO $sec01$
BEGIN
  IF to_regprocedure('public.baixar_estoque_venda(uuid,jsonb)') IS NULL THEN
    RAISE NOTICE 'SEC-01: baixar_estoque_venda não existe neste banco — nada a revogar';
  ELSE
    REVOKE ALL ON FUNCTION public.baixar_estoque_venda(uuid, jsonb) FROM PUBLIC;
    REVOKE ALL ON FUNCTION public.baixar_estoque_venda(uuid, jsonb) FROM anon;
    REVOKE ALL ON FUNCTION public.baixar_estoque_venda(uuid, jsonb) FROM authenticated;
    GRANT EXECUTE ON FUNCTION public.baixar_estoque_venda(uuid, jsonb) TO service_role;

    COMMENT ON FUNCTION public.baixar_estoque_venda(uuid, jsonb) IS
      'DEPRECADA (SEC-01, 2026-08-05). Sem migration de origem e sem chamador no repositório. Baixa estoque sem kardex — não usar. Candidata a DROP após evidência de zero invocação. Caminho canônico: decrementar_estoque_seguro.';
  END IF;
END
$sec01$;

-- ============================================================================
-- SEC-02 + TB-01 — criar_produto_com_estoque_inicial: remover OPERADOR do gate
--
-- RN-019: criação de produto acontece apenas no módulo Produtos (/admin/catalogo).
-- Corpo idêntico a 20260718135138, exceto o gate de perfil.
-- ============================================================================

${criar}

COMMENT ON FUNCTION public.criar_produto_com_estoque_inicial(jsonb, uuid, uuid) IS
  'Cria produto + estoque inicial na mesma transação. GERENTE+ apenas — o PDV não cadastra produto (RN-019).';

REVOKE ALL ON FUNCTION public.criar_produto_com_estoque_inicial(jsonb, uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.criar_produto_com_estoque_inicial(jsonb, uuid, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.criar_produto_com_estoque_inicial(jsonb, uuid, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.criar_produto_com_estoque_inicial(jsonb, uuid, uuid) TO service_role;

-- ============================================================================
-- SSOT-01 — ajustar_estoque_manual: remover autorização por string do cliente
--
-- Corpo idêntico a 20260718135500, exceto a remoção de v_estoque_inicial e do
-- ramo que liberava OPERADOR por literal em p_observacao.
--
-- Efeito colateral pretendido: com SEC-02 removendo OPERADOR de
-- criar_produto_com_estoque_inicial, o caminho de estoque inicial por OPERADOR
-- deixa de existir por inteiro. GERENTE+ continua inalterado.
-- ============================================================================

${ajustar}

COMMENT ON FUNCTION public.ajustar_estoque_manual(uuid, uuid, numeric, numeric, text, text, uuid) IS
  'Ajuste manual de estoque. GERENTE/DONO/ADMIN apenas — autorização deriva do papel no servidor, nunca de parâmetro do cliente (SSOT-01).';

REVOKE ALL ON FUNCTION public.ajustar_estoque_manual(uuid, uuid, numeric, numeric, text, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ajustar_estoque_manual(uuid, uuid, numeric, numeric, text, text, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.ajustar_estoque_manual(uuid, uuid, numeric, numeric, text, text, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.ajustar_estoque_manual(uuid, uuid, numeric, numeric, text, text, uuid) TO service_role;

-- ============================================================================
-- VERIFICAÇÃO DE EFEITO — dentro da própria transação.
--
-- "Verifique efeito, não intenção" (Regra 9 do guia). Qualquer asserção que falhe
-- reverte a transação inteira: é impossível esta migration constar aplicada sem
-- ter surtido efeito — que é exatamente o modo de falha que originou os tickets.
-- ============================================================================

DO $verify$
DECLARE
  v_def text;
BEGIN
  v_def := pg_get_functiondef('public.criar_produto_com_estoque_inicial(jsonb,uuid,uuid)'::regprocedure);
  IF position(${OPERADOR_LIT} IN v_def) > 0 THEN
    RAISE EXCEPTION 'MIG289_SEC02_OPERADOR_REMANESCENTE';
  END IF;

  v_def := pg_get_functiondef('public.ajustar_estoque_manual(uuid,uuid,numeric,numeric,text,text,uuid)'::regprocedure);
  IF position('Estoque inicial no cadastro de produto' IN v_def) > 0 THEN
    RAISE EXCEPTION 'MIG289_SSOT01_STRING_MAGICA_REMANESCENTE';
  END IF;
  IF position(${OPERADOR_LIT} IN v_def) > 0 THEN
    RAISE EXCEPTION 'MIG289_SSOT01_OPERADOR_REMANESCENTE';
  END IF;

  IF to_regprocedure('public.baixar_estoque_venda(uuid,jsonb)') IS NOT NULL THEN
    IF has_function_privilege('anon', 'public.baixar_estoque_venda(uuid,jsonb)', 'EXECUTE')
       OR has_function_privilege('authenticated', 'public.baixar_estoque_venda(uuid,jsonb)', 'EXECUTE') THEN
      RAISE EXCEPTION 'MIG289_SEC01_GRANT_REMANESCENTE';
    END IF;
  END IF;

  IF has_function_privilege('anon', 'public.criar_produto_com_estoque_inicial(jsonb,uuid,uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.criar_produto_com_estoque_inicial(jsonb,uuid,uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'MIG289_CRIAR_PRODUTO_GRANT_CLIENTE';
  END IF;

  IF has_function_privilege('anon', 'public.ajustar_estoque_manual(uuid,uuid,numeric,numeric,text,text,uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.ajustar_estoque_manual(uuid,uuid,numeric,numeric,text,text,uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'MIG289_AJUSTAR_GRANT_CLIENTE';
  END IF;

  RAISE NOTICE '289 OK — SEC-01, SEC-02, SSOT-01 e TB-01 verificados no efeito';
END
$verify$;

COMMIT;
`

const destino = path.join(MIG, '289_hardening_autorizacao_rpcs_p0.sql')
writeFileSync(destino, sql)
console.log(`gerado: ${path.relative(ROOT, destino)} (${sql.split('\n').length} linhas)`)
