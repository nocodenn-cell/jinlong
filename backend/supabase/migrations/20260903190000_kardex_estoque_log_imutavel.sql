-- PR-1B do plano de fechamento de gaps (auditoria Jīn Lóng, achado P0 #2):
-- movimentos_estoque_log (o kardex de estoque) era editável/apagável via API
-- por GERENTE/DONO/ADMIN, apesar de a migration 127_kardex_vendas_imutavel.sql
-- já chamar a tabela de "kardex físico e imutável".
--
-- CAUSA RAIZ
-- ----------
-- A única policy da tabela (`mov_estoque_log_gerente_all`, criada em
-- 034_remessas_movimentos_transferencias.sql, reescrita em 224 só para o
-- wrap de performance do auth.uid()) é `FOR ALL` — cobre SELECT+INSERT+
-- UPDATE+DELETE para GERENTE/DONO/ADMIN. A tabela nunca teve um GRANT
-- próprio: herdou SELECT/INSERT/UPDATE/DELETE em todas as colunas via
-- `20260621005300_255_grant_baseline_tabelas_authenticated.sql`
-- (`GRANT ... ON ALL TABLES IN SCHEMA public TO authenticated`), nunca
-- revogado depois — o mesmo padrão de causa raiz do achado P0 #1 (PR-1A).
--
-- WRITERS LEGÍTIMOS CONFIRMADOS (grep de INSERT INTO movimentos_estoque_log
-- em backend/supabase/migrations, 29 arquivos, e de .from('movimentos_estoque_log')
-- em pdv-importados, antes desta migration)
-- ---------------------------------------------------------------------
-- Todo INSERT legítimo ocorre dentro de RPCs `SECURITY DEFINER`
-- (`decrementar_estoque_seguro`, `ajustar_estoque_manual`,
-- `transferir_estoque_seguro`/`transferir_estoque_entre_lojas`,
-- `confirmar_remessa_entrada`/`criar_confirmar_remessa_entrada`,
-- `importar_nfe_transacao`, `cancelar_venda_transacional`,
-- `devolver_ou_trocar_venda`, etc.) — funções owned por `postgres`, que
-- roda com BYPASSRLS e privilégio pleno na tabela independentemente do
-- GRANT/RLS do papel `authenticated` que chamou a RPC. Nenhum caminho de
-- código do app faz `INSERT INTO movimentos_estoque_log` diretamente via
-- PostgREST — confirmado por grep exaustivo em pdv-importados (zero
-- ocorrências de `.insert(` para esta tabela). O único consumidor de app
-- que referencia a tabela é `app/admin/auditoria/actions.ts`, e é
-- explicitamente SOMENTE-LEITURA (comentário no próprio arquivo: "NÃO
-- cria/altera tabela alguma... apenas faz SELECT"). Logo INSERT direto de
-- `authenticated`/`anon` também não é necessário — só SELECT é.
--
-- Consequência: como os writers legítimos rodam como owner (bypassa
-- GRANT/RLS), um REVOKE de UPDATE/DELETE de `authenticated`/`anon` sozinho
-- NÃO fecha a lacuna contra um erro de código futuro rodando como owner —
-- por isso, exatamente como em `comissoes_ajustes`
-- (20260814171500_commission_ledger_immutability_audit.sql), a correção
-- precisa das DUAS camadas: GRANT (fecha o vetor via PostgREST/authenticated)
-- + trigger BEFORE UPDATE OR DELETE (fecha para QUALQUER role, inclusive
-- owner). Réplica também a segunda parte do mesmo padrão: trigger BEFORE
-- TRUNCATE FOR EACH STATEMENT — o REVOKE TRUNCATE global de
-- `20260814111243_revoke_truncate_and_cash_delete.sql` só cobre
-- `authenticated`/`anon` (que já não tinham TRUNCATE mesmo antes), e o
-- dono da tabela retém TRUNCATE independentemente de qualquer REVOKE; sem
-- este segundo trigger a garantia "qualquer role, inclusive owner" ficaria
-- incompleta para esse único comando (TRUNCATE ignora trigger ROW).
--
-- CORREÇÃO (RLS policy existente não é tocada)
-- ---------------------------------------------------------------------
-- 1. REVOKE INSERT, UPDATE, DELETE de authenticated/anon na tabela (SELECT
--    preservado intacto — a policy FOR ALL continua controlando quem pode
--    ler, exatamente como antes; INSERT deixa de ser possível fora de RPC).
-- 2. Trigger BEFORE UPDATE OR DELETE (FOR EACH ROW) + trigger BEFORE
--    TRUNCATE (FOR EACH STATEMENT), mesmo padrão textual/estrutural de
--    `trg_comissoes_ajustes_bloquear_mutacao`, rejeitando incondicionalmente
--    qualquer mutação/remoção em massa.
--
-- NOTA — fixture de teste pré-existente: `financial-adversarial-gates
-- .test.sql` (Gate 23) faz `DELETE FROM movimentos_estoque_log WHERE
-- venda_id = ...` como owner, para isolar o FK `comissoes_ajustes.venda_id`
-- de um `DELETE FROM vendas`. Essa migration passa a bloquear esse DELETE
-- por design — o fixture foi ajustado (na mesma PR) para desabilitar o
-- trigger de linha só ao redor dessa limpeza pontual, e reabilitar em
-- seguida, dentro da mesma transação de teste (nunca persiste).
--
-- ROLLBACK
-- --------
--   DROP TRIGGER IF EXISTS trg_movimentos_estoque_log_bloqueia_mutacao ON public.movimentos_estoque_log;
--   DROP TRIGGER IF EXISTS trg_movimentos_estoque_log_bloqueia_truncate ON public.movimentos_estoque_log;
--   DROP FUNCTION IF EXISTS public.trg_movimentos_estoque_log_bloquear_mutacao();
--   GRANT INSERT, UPDATE, DELETE ON public.movimentos_estoque_log TO authenticated;
--   NOTIFY pgrst, 'reload schema';
-- (anon nunca teve INSERT/UPDATE/DELETE de fato — o REVOKE nele é
-- defensivo/idempotente, então o rollback não precisa restaurar para anon.)

BEGIN;

REVOKE INSERT, UPDATE, DELETE ON public.movimentos_estoque_log FROM authenticated, anon;

CREATE OR REPLACE FUNCTION public.trg_movimentos_estoque_log_bloquear_mutacao()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
BEGIN
  RAISE EXCEPTION 'MOVIMENTOS_ESTOQUE_LOG_IMUTAVEL'
    USING DETAIL = format(
      '%s bloqueado em public.movimentos_estoque_log: o kardex de estoque e append-only.',
      TG_OP),
    HINT = 'Registre um novo movimento (via decrementar_estoque_seguro/ajustar_estoque_manual/etc.) em vez de alterar ou remover um existente.';
END;
$fn$;

DROP TRIGGER IF EXISTS trg_movimentos_estoque_log_bloqueia_mutacao ON public.movimentos_estoque_log;
CREATE TRIGGER trg_movimentos_estoque_log_bloqueia_mutacao
  BEFORE UPDATE OR DELETE ON public.movimentos_estoque_log
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_movimentos_estoque_log_bloquear_mutacao();

DROP TRIGGER IF EXISTS trg_movimentos_estoque_log_bloqueia_truncate ON public.movimentos_estoque_log;
CREATE TRIGGER trg_movimentos_estoque_log_bloqueia_truncate
  BEFORE TRUNCATE ON public.movimentos_estoque_log
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.trg_movimentos_estoque_log_bloquear_mutacao();

-- ═══════════════════════════════════════════════════════════════════════════
-- VERIFICAÇÃO — falha a transação se o estado final não for exatamente o
-- esperado (grants + triggers presentes; SELECT preservado, escrita fechada).
-- ═══════════════════════════════════════════════════════════════════════════

DO $verify$
BEGIN
  IF has_table_privilege('authenticated', 'public.movimentos_estoque_log', 'INSERT') THEN
    RAISE EXCEPTION 'KARDEX_INSERT_AINDA_CONCEDIDO: authenticated ainda pode INSERT direto (fora de RPC)';
  END IF;

  IF has_table_privilege('authenticated', 'public.movimentos_estoque_log', 'UPDATE') THEN
    RAISE EXCEPTION 'KARDEX_UPDATE_AINDA_CONCEDIDO: authenticated ainda pode UPDATE';
  END IF;

  IF has_table_privilege('authenticated', 'public.movimentos_estoque_log', 'DELETE') THEN
    RAISE EXCEPTION 'KARDEX_DELETE_AINDA_CONCEDIDO: authenticated ainda pode DELETE';
  END IF;

  IF NOT has_table_privilege('authenticated', 'public.movimentos_estoque_log', 'SELECT') THEN
    RAISE EXCEPTION 'KARDEX_SELECT_PERDIDO: leitura do painel de auditoria quebraria';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_movimentos_estoque_log_bloqueia_mutacao'
      AND tgrelid = 'public.movimentos_estoque_log'::regclass
      AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION 'KARDEX_TRIGGER_MUTACAO_AUSENTE: trigger de bloqueio UPDATE/DELETE não foi criado';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_movimentos_estoque_log_bloqueia_truncate'
      AND tgrelid = 'public.movimentos_estoque_log'::regclass
      AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION 'KARDEX_TRIGGER_TRUNCATE_AUSENTE: trigger de bloqueio TRUNCATE não foi criado';
  END IF;

  RAISE NOTICE 'Kardex de estoque protegido — INSERT/UPDATE/DELETE revogados de authenticated/anon; triggers bloqueiam UPDATE/DELETE/TRUNCATE de qualquer role; SELECT preservado.';
END
$verify$;

NOTIFY pgrst, 'reload schema';

COMMIT;
