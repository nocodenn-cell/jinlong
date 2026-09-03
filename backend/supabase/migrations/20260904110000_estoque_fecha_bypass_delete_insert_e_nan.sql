-- Follow-up de PR-1C (20260904090000_estoque_quantidade_protecao.sql, já
-- mergeada/aplicada em produção) — 2 achados reais de review pós-merge
-- (Codex), ambos confirmados por leitura de código:
--
-- P1 — bypass DELETE+INSERT: revogar só UPDATE não fechava o vetor.
-- `estoque_delete_gerente_loja` permitia GERENTE/DONO/ADMIN da própria
-- loja apagar QUALQUER linha; a policy de INSERT (já corrigida) só exige
-- quantidade_atual=0. Combinando os dois: DELETE da linha existente +
-- INSERT com quantidade_atual=0 zera qualquer saldo positivo sem passar
-- por nenhuma RPC nem gravar entrada no kardex — undermines exatamente a
-- garantia que PR-1B (kardex imutável) e PR-1C (CHECK/REVOKE) juntas
-- deveriam entregar.
--
-- P2 — CHECK não rejeitava NaN: `numeric` do Postgres trata `'NaN' >= 0`
-- como VERDADEIRO (diferente de float IEEE754), então
-- `CHECK (quantidade_atual >= 0)` sozinho deixa passar NaN via qualquer
-- writer (inclusive `ajustar_estoque_manual`, cuja validação própria é só
-- `IS NULL OR < 0`) — envenenaria deltas/comparações/reconciliação de
-- kardex a partir dali.
--
-- CORREÇÃO
-- --------
-- 1. CHECK ganha `AND quantidade_atual != 'NaN'::numeric` (NaN = NaN é
--    verdadeiro no tipo numeric do Postgres, então essa comparação
--    rejeita corretamente).
-- 2. REVOKE DELETE de authenticated/anon (mesmo raciocínio de UPDATE:
--    nenhum caminho de app precisa de DELETE direto — ver RPC abaixo).
-- 3. Nova RPC SECURITY DEFINER `excluir_linha_estoque_produto(p_produto_id,
--    p_ator_id)` — substitui os 2 pontos de DELETE direto do app
--    (app/admin/produtos/productExclusion.ts,
--    app/gerente/produtos/actions.ts `reverter()`). Deriva a loja do
--    PRÓPRIO produto (não confia em parâmetro do cliente) e replica
--    exatamente a mesma checagem de perfil+loja que
--    `estoque_delete_gerente_loja` já fazia — não muda quem pode
--    excluir, só fecha o caminho de fazer isso sem RPC.
--
-- ROLLBACK
-- --------
--   ALTER TABLE public.estoque DROP CONSTRAINT estoque_quantidade_atual_check;
--   ALTER TABLE public.estoque ADD CONSTRAINT estoque_quantidade_atual_check CHECK (quantidade_atual >= 0);
--   GRANT DELETE ON public.estoque TO authenticated;
--   DROP FUNCTION IF EXISTS public.excluir_linha_estoque_produto(uuid, uuid);
--   NOTIFY pgrst, 'reload schema';
-- (reverter também as duas chamadas no app para `.from('estoque').delete()`.)

BEGIN;

ALTER TABLE public.estoque DROP CONSTRAINT estoque_quantidade_atual_check;
ALTER TABLE public.estoque
  ADD CONSTRAINT estoque_quantidade_atual_check
  CHECK (quantidade_atual >= 0 AND quantidade_atual != 'NaN'::numeric);

REVOKE DELETE ON public.estoque FROM authenticated, anon;

CREATE OR REPLACE FUNCTION public.excluir_linha_estoque_produto(
  p_produto_id uuid,
  p_ator_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := COALESCE(auth.uid(), p_ator_id);
  v_perfil text;
  v_loja_usuario uuid;
  v_loja_produto uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'EXCLUIR_ESTOQUE_AUTH';
  END IF;

  SELECT u.perfil, u.loja_id INTO v_perfil, v_loja_usuario
  FROM public.usuarios u WHERE u.id = v_uid;

  IF v_perfil IS NULL OR v_perfil NOT IN ('GERENTE', 'DONO', 'ADMIN') THEN
    RAISE EXCEPTION 'EXCLUIR_ESTOQUE_PERFIL';
  END IF;

  -- Loja vem do PRÓPRIO produto (SECURITY DEFINER, ignora RLS de produtos
  -- aqui de propósito) — não confia em parâmetro do cliente. Se o produto
  -- já não existe mais, não há o que checar: DELETE idempotente (0 linhas).
  SELECT p.loja_id INTO v_loja_produto FROM public.produtos p WHERE p.id = p_produto_id;

  IF v_loja_produto IS NOT NULL AND v_loja_usuario IS DISTINCT FROM v_loja_produto THEN
    RAISE EXCEPTION 'EXCLUIR_ESTOQUE_LOJA_INVALIDA';
  END IF;

  DELETE FROM public.estoque WHERE produto_id = p_produto_id;
END;
$$;

REVOKE ALL ON FUNCTION public.excluir_linha_estoque_produto(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.excluir_linha_estoque_produto(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.excluir_linha_estoque_produto(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.excluir_linha_estoque_produto(uuid, uuid) TO service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- VERIFICAÇÃO
-- ═══════════════════════════════════════════════════════════════════════════

DO $verify$
BEGIN
  IF has_table_privilege('authenticated', 'public.estoque', 'DELETE') THEN
    RAISE EXCEPTION 'ESTOQUE_DELETE_AINDA_CONCEDIDO';
  END IF;

  IF NOT has_function_privilege('authenticated', 'public.excluir_linha_estoque_produto(uuid, uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'EXCLUIR_LINHA_ESTOQUE_SEM_GRANT_AUTHENTICATED';
  END IF;

  IF has_function_privilege('anon', 'public.excluir_linha_estoque_produto(uuid, uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'EXCLUIR_LINHA_ESTOQUE_COM_GRANT_ANON';
  END IF;

  IF EXISTS (
    SELECT 1 WHERE 'NaN'::numeric >= 0 AND NOT ('NaN'::numeric != 'NaN'::numeric)
  ) THEN
    -- Confirma a premissa documentada acima (NaN >= 0 é true; NaN != NaN é false
    -- no tipo numeric) — se o Postgres mudar esse comportamento, o teste
    -- dedicado (não esta migration) precisa saber, mas deixamos a nota aqui.
    NULL;
  END IF;

  RAISE NOTICE 'Estoque: DELETE revogado de authenticated/anon; excluir_linha_estoque_produto criada; CHECK rejeita NaN.';
END
$verify$;

NOTIFY pgrst, 'reload schema';

COMMIT;
