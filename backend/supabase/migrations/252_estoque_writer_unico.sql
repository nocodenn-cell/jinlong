-- Fase 2 — ESTOQUE: invariante de não-negatividade + writer único de criação de
-- linha + cascade na exclusão de produto (elimina writes diretos em estoque).
--
-- Contrato de concorrência (migration 032): a unidade de lock/mutação é a linha
-- (loja_id, produto_id). As RPCs de saldo (decrementar_estoque_seguro 127,
-- ajustar_estoque_manual 063, transferencia_segura 082) já respeitam isso e NÃO
-- são tocadas aqui.

-- =============================================================================
-- 1a. CHECK quantidade_atual >= 0 (invariante no grão da linha).
--     Pré-checagem: falha com mensagem clara se houver saldos negativos.
-- =============================================================================
DO $$
DECLARE
  v_neg text;
BEGIN
  SELECT string_agg(format('(loja=%s, produto=%s: %s)', loja_id, produto_id, quantidade_atual), ', ')
  INTO   v_neg
  FROM   public.estoque
  WHERE  quantidade_atual < 0;

  IF v_neg IS NOT NULL THEN
    RAISE EXCEPTION
      'ESTOQUE_QTD_NEGATIVA: linhas com quantidade_atual < 0: %. Corrija os saldos antes de aplicar esta migration.',
      v_neg;
  END IF;
END $$;

ALTER TABLE public.estoque
  DROP CONSTRAINT IF EXISTS estoque_quantidade_nao_negativa;
ALTER TABLE public.estoque
  ADD CONSTRAINT estoque_quantidade_nao_negativa CHECK (quantidade_atual >= 0);

COMMENT ON CONSTRAINT estoque_quantidade_nao_negativa ON public.estoque IS
  'Fase 2: saldo de estoque nunca negativo (backstop no grão da linha, mesmo contra bypass).';

-- =============================================================================
-- 1b. garantir_linha_estoque — writer único de "criar linha de estoque zerada".
--     Substitui os INSERT diretos em estoque (gerente/estoque e produtoRepository).
-- =============================================================================
CREATE OR REPLACE FUNCTION public.garantir_linha_estoque(
  p_produto_id uuid,
  p_loja_id    uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid          uuid := auth.uid();
  v_loja_usuario uuid;
BEGIN
  IF p_produto_id IS NULL OR p_loja_id IS NULL THEN
    RAISE EXCEPTION 'GARANTIR_ESTOQUE_ARGS_OBRIGATORIOS';
  END IF;

  -- Autorização: usuário autenticado (não service_role) só cria linha na própria
  -- loja. service_role (auth.uid() IS NULL) passa direto. Padrão do 063.
  IF v_uid IS NOT NULL THEN
    SELECT u.loja_id INTO v_loja_usuario FROM public.usuarios u WHERE u.id = v_uid;
    IF v_loja_usuario IS DISTINCT FROM p_loja_id THEN
      RAISE EXCEPTION 'GARANTIR_ESTOQUE_LOJA_INVALIDA';
    END IF;
  END IF;

  INSERT INTO public.estoque (produto_id, loja_id, quantidade_atual, estoque_minimo)
  VALUES (p_produto_id, p_loja_id, 0, 0)
  ON CONFLICT (loja_id, produto_id) DO NOTHING;
END;
$$;

REVOKE ALL ON FUNCTION public.garantir_linha_estoque(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.garantir_linha_estoque(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.garantir_linha_estoque(uuid, uuid) TO service_role;

COMMENT ON FUNCTION public.garantir_linha_estoque(uuid, uuid) IS
  'Writer único de criação de linha de estoque (0/0), idempotente por (loja_id, produto_id). Substitui INSERT direto em estoque.';

-- =============================================================================
-- 1c. FK estoque.produto_id → produtos(id) ON DELETE CASCADE.
--     Remove a necessidade do delete direto de estoque na exclusão de produto:
--     deletar o produto passa a remover a linha de estoque por cascade.
--     Já existe uma FK (001) sem CASCADE → DROP + recriar. A FK garante que não
--     há órfãos, mas a pré-checagem abaixo é defensiva.
-- =============================================================================
DO $$
DECLARE
  v_orf bigint;
BEGIN
  SELECT count(*) INTO v_orf
  FROM public.estoque e
  WHERE NOT EXISTS (SELECT 1 FROM public.produtos p WHERE p.id = e.produto_id);

  IF v_orf > 0 THEN
    RAISE EXCEPTION 'ESTOQUE_ORFAO: % linha(s) de estoque sem produto. Limpe antes de recriar a FK.', v_orf;
  END IF;
END $$;

ALTER TABLE public.estoque
  DROP CONSTRAINT IF EXISTS estoque_produto_id_fkey;
ALTER TABLE public.estoque
  ADD CONSTRAINT estoque_produto_id_fkey
  FOREIGN KEY (produto_id) REFERENCES public.produtos(id) ON DELETE CASCADE;

COMMENT ON CONSTRAINT estoque_produto_id_fkey ON public.estoque IS
  'Fase 2: exclusão de produto remove a linha de estoque por cascade (sem delete direto no app).';
