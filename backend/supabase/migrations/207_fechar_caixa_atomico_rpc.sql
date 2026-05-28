-- RPC fechar_caixa_atomico: elimina a race condition TOCTOU do fechamento anterior.
--
-- Problema anterior (caixaSessaoOperador.impl.ts):
--   1. supabase.rpc('calcular_valor_sistema_dinheiro_caixa')   ← round-trip A
--   2. (janela aberta: vendas podem entrar aqui)
--   3. supabase.from('caixas').update({ status: 'FECHADO' })   ← round-trip B
--
-- Solução: FOR UPDATE na linha do caixa + cálculo + UPDATE na mesma transação PL/pgSQL.
-- O trigger trg_vendas_caixa_aberto_bi (migration 206) usa FOR SHARE no mesmo row,
-- portanto qualquer INSERT em vendas fica em espera enquanto o lock está ativo e,
-- ao desbloquear, lê status = 'FECHADO' e é rejeitado.

CREATE OR REPLACE FUNCTION public.fechar_caixa_atomico(
  p_operador_id uuid,
  p_valor_contado numeric,
  p_motivo       text DEFAULT ''
)
RETURNS TABLE (
  o_caixa_id      uuid,
  o_valor_sistema numeric(10,2),
  o_valor_contado numeric(10,2),
  o_diferenca     numeric(10,2)
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid            uuid    := auth.uid();
  v_caixa_id       uuid;
  v_valor_sistema  numeric(10,2);
  v_diferenca      numeric(10,2);
  v_motivo         text;
  c_limite         CONSTANT numeric := 5.00;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'FECHAR_CAIXA_SESSAO_EXPIRADA';
  END IF;

  IF v_uid <> p_operador_id THEN
    RAISE EXCEPTION 'FECHAR_CAIXA_SEM_PERMISSAO';
  END IF;

  v_motivo := TRIM(COALESCE(p_motivo, ''));

  -- Adquire lock exclusivo na linha do caixa.
  -- Impede que vendas concorrentes (que usam FOR SHARE no mesmo row via trigger) leiam
  -- status = 'ABERTO' enquanto o fechamento está em curso.
  SELECT c.id
  INTO   v_caixa_id
  FROM   public.caixas c
  WHERE  c.operador_id = p_operador_id
    AND  c.status      = 'ABERTO'
  ORDER BY c.data_abertura DESC
  LIMIT  1
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'FECHAR_CAIXA_CAIXA_NAO_ENCONTRADO';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM   public.movimentacoes_caixa m
    WHERE  m.caixa_id   = v_caixa_id
      AND  m.status     = 'pendente'
      AND  m.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'FECHAR_CAIXA_MOVIMENTACOES_PENDENTES';
  END IF;

  -- Cálculo dentro da transação com lock mantido: nenhuma venda nova entra neste caixa
  -- entre esta linha e o UPDATE abaixo.
  v_valor_sistema := public.calcular_valor_sistema_dinheiro_caixa(v_caixa_id);
  v_diferenca     := ROUND(p_valor_contado - v_valor_sistema, 2);

  IF ABS(v_diferenca) > c_limite AND LENGTH(v_motivo) < 5 THEN
    RAISE EXCEPTION 'FECHAR_CAIXA_DIVERGENCIA_SEM_MOTIVO'
      USING DETAIL = v_diferenca::text;
  END IF;

  UPDATE public.caixas
  SET
    status               = 'FECHADO',
    data_fechamento      = now(),
    valor_fechamento     = ROUND(p_valor_contado, 2),
    fechamento_diferenca = v_diferenca,
    fechamento_observacao = NULLIF(v_motivo, '')
  WHERE id = v_caixa_id;

  RETURN QUERY
  SELECT
    v_caixa_id,
    v_valor_sistema,
    ROUND(p_valor_contado, 2)::numeric(10,2),
    v_diferenca;
END;
$$;

REVOKE ALL ON FUNCTION public.fechar_caixa_atomico(uuid, numeric, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fechar_caixa_atomico(uuid, numeric, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fechar_caixa_atomico(uuid, numeric, text) TO service_role;

COMMENT ON FUNCTION public.fechar_caixa_atomico(uuid, numeric, text) IS
  'Fecha caixa atomicamente: FOR UPDATE + calcular_valor_sistema_dinheiro_caixa + UPDATE '
  'em uma única transação. Elimina TOCTOU entre cálculo de saldo e gravação de status FECHADO.';
