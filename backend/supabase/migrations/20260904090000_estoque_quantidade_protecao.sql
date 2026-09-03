-- PR-1C do plano de fechamento de gaps (auditoria Jīn Lóng, achado P1 —
-- estoque.quantidade_atual editável direto via API, podendo ficar negativo
-- e contornando o kardex).
--
-- DIAGNÓSTICO (produção, 2026-09-04, somente leitura antes desta migration)
-- ---------------------------------------------------------------------
-- 137 linhas em estoque; 0 com quantidade_atual < 0; mínimo = 0.000.
-- Nenhuma inconsistência de dado real — seguro adicionar CHECK direto,
-- sem NOT VALID/backfill.
--
-- CAUSA RAIZ E WRITERS (grep exaustivo em pdv-importados + backend antes
-- desta migration)
-- ---------------------------------------------------------------------
-- UPDATE de quantidade_atual: só ocorre dentro de RPCs SECURITY DEFINER
-- (decrementar_estoque_seguro, ajustar_estoque_manual,
-- transferir_estoque_seguro/transferir_estoque_entre_lojas,
-- confirmar_remessa_entrada/criar_confirmar_remessa_entrada,
-- importar_nfe_transacao, cancelar_venda_transacional,
-- devolver_ou_trocar_venda, criar_produto_com_estoque_inicial) — todas
-- owned por postgres (bypassRLS=true, confirmado em produção). ZERO
-- ocorrências de `.update()` na tabela estoque em todo pdv-importados.
-- Todas essas RPCs já rejeitam quantidade negativa na própria lógica
-- (ESTOQUE_INSUFICIENTE / AJUSTE_ESTOQUE_QTD_INVALIDA) — não há regra de
-- negócio que permita saldo negativo (backorder/venda a descoberto).
--
-- Mas, ao contrário de movimentos_estoque_log (PR-1B, append-only), esta
-- tabela TEM writers legítimos via client `authenticated` direto — não é
-- seguro revogar tudo:
--   - garantirLinhaEstoque (pdv-importados/app/gerente/estoque/actions.ts:139)
--     faz INSERT direto (client authenticated, gate assertGerenteSession)
--     para produtos legados sem linha em estoque — sempre
--     `quantidade_atual: 0` (hardcoded na app, nunca outro valor).
--   - app/admin/produtos/actions.ts:408 e
--     app/admin/produtos/productExclusion.ts:160 fazem DELETE direto
--     (client authenticated) ao excluir produto — ciclo de vida da linha,
--     não altera saldo.
-- Logo: só UPDATE nunca é legítimo via authenticated; INSERT e DELETE são.
--
-- CORREÇÃO (menor possível — sem trigger que bloquearia as RPCs legítimas)
-- ---------------------------------------------------------------------
-- 1. CHECK (quantidade_atual >= 0) — invariante de banco, vale para
--    QUALQUER writer (RPC ou não), sem bloquear as RPCs (nenhuma delas
--    tenta gravar negativo hoje).
-- 2. REVOKE UPDATE de authenticated/anon — fecha o vetor de API direta.
--    NÃO revoga INSERT/DELETE (garantirLinhaEstoque e exclusão de produto
--    precisam). NÃO cria trigger BEFORE UPDATE: diferente do kardex,
--    estoque não é append-only — as próprias RPCs (owner, bypassa GRANT)
--    fazem UPDATE de verdade o tempo todo; um trigger bloqueando qualquer
--    UPDATE quebraria venda/ajuste/transferência.
-- 3. Aperta `estoque_insert_gerente_loja` (WITH CHECK) para exigir
--    `quantidade_atual = 0` no INSERT direto — replica em banco o que
--    `garantirLinhaEstoque` já faz na prática, fechando a variante menor
--    de "forjar saldo inicial" via INSERT direto sem UPDATE.
--
-- Isolamento por tenant: nenhuma mudança — RLS por loja_id já vigente em
-- todas as policies, não tocada aqui.
--
-- ROLLBACK
-- --------
--   ALTER TABLE public.estoque DROP CONSTRAINT IF EXISTS estoque_quantidade_atual_check;
--   GRANT UPDATE ON public.estoque TO authenticated;
--   ALTER POLICY estoque_insert_gerente_loja ON public.estoque
--     WITH CHECK (
--       EXISTS ( SELECT 1 FROM usuarios u
--         WHERE u.id = (SELECT auth.uid())
--           AND u.perfil = ANY (ARRAY['GERENTE','DONO','ADMIN'])
--           AND u.loja_id = estoque.loja_id)
--     );
--   NOTIFY pgrst, 'reload schema';
-- (anon nunca teve UPDATE de fato — o REVOKE nele é defensivo/idempotente.)

BEGIN;

ALTER TABLE public.estoque
  ADD CONSTRAINT estoque_quantidade_atual_check CHECK (quantidade_atual >= 0);

REVOKE UPDATE ON public.estoque FROM authenticated, anon;

ALTER POLICY estoque_insert_gerente_loja ON public.estoque
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM usuarios u
      WHERE u.id = (SELECT auth.uid())
        AND u.perfil = ANY (ARRAY['GERENTE'::text, 'DONO'::text, 'ADMIN'::text])
        AND u.loja_id = estoque.loja_id
    )
    AND quantidade_atual = 0
  );

-- ═══════════════════════════════════════════════════════════════════════════
-- VERIFICAÇÃO — falha a transação se o estado final não for exatamente o
-- esperado. Verificação estrutural (grants/constraint/policy) — não tenta
-- INSERT/UPDATE ao vivo contra dado real de produção.
-- ═══════════════════════════════════════════════════════════════════════════

DO $verify$
DECLARE
  v_check_ok boolean;
  v_policy_withcheck text;
BEGIN
  IF has_table_privilege('authenticated', 'public.estoque', 'UPDATE') THEN
    RAISE EXCEPTION 'ESTOQUE_UPDATE_AINDA_CONCEDIDO: authenticated ainda pode UPDATE';
  END IF;

  IF NOT has_table_privilege('authenticated', 'public.estoque', 'INSERT') THEN
    RAISE EXCEPTION 'ESTOQUE_INSERT_PERDIDO: garantirLinhaEstoque quebraria';
  END IF;

  IF NOT has_table_privilege('authenticated', 'public.estoque', 'DELETE') THEN
    RAISE EXCEPTION 'ESTOQUE_DELETE_PERDIDO: exclusão de produto quebraria';
  END IF;

  IF NOT has_table_privilege('authenticated', 'public.estoque', 'SELECT') THEN
    RAISE EXCEPTION 'ESTOQUE_SELECT_PERDIDO';
  END IF;

  IF NOT has_table_privilege('service_role', 'public.estoque', 'UPDATE') THEN
    RAISE EXCEPTION 'ESTOQUE_SERVICE_ROLE_PERDEU_UPDATE: RPCs quebrariam';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.estoque'::regclass
      AND conname = 'estoque_quantidade_atual_check'
      AND convalidated
  ) INTO v_check_ok;
  IF NOT v_check_ok THEN
    RAISE EXCEPTION 'ESTOQUE_CHECK_AUSENTE_OU_NAO_VALIDADO';
  END IF;

  SELECT with_check INTO v_policy_withcheck
  FROM pg_policies
  WHERE schemaname = 'public' AND tablename = 'estoque' AND policyname = 'estoque_insert_gerente_loja';
  IF v_policy_withcheck IS NULL OR v_policy_withcheck NOT LIKE '%quantidade_atual = (0)::numeric%' THEN
    RAISE EXCEPTION 'ESTOQUE_INSERT_POLICY_SEM_RESTRICAO_QUANTIDADE_ZERO: %', v_policy_withcheck;
  END IF;

  RAISE NOTICE 'Estoque protegido — CHECK quantidade_atual>=0 ativo; UPDATE revogado de authenticated/anon (service_role preservado); INSERT direto exige quantidade_atual=0; DELETE preservado.';
END
$verify$;

NOTIFY pgrst, 'reload schema';

COMMIT;
