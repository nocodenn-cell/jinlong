-- Cancelamento transacional de venda com:
-- - reposição de estoque por item
-- - impacto financeiro em dinheiro (devolução + ajuste de saldo do caixa)
-- - trilha de auditoria

CREATE TABLE IF NOT EXISTS public.vendas_canceladas_auditoria (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venda_id uuid NOT NULL REFERENCES public.vendas(id) ON DELETE RESTRICT,
  caixa_id uuid NOT NULL REFERENCES public.caixas(id) ON DELETE RESTRICT,
  operador_id uuid NOT NULL REFERENCES public.usuarios(id) ON DELETE RESTRICT,
  motivo text NOT NULL CHECK (length(btrim(motivo)) >= 2),
  forma_pagamento text NOT NULL,
  valor_estornado numeric(10,2) NOT NULL DEFAULT 0 CHECK (valor_estornado >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_vendas_canceladas_auditoria_venda UNIQUE (venda_id)
);

CREATE TABLE IF NOT EXISTS public.estoque_reposicoes_cancelamento (
  venda_id uuid NOT NULL REFERENCES public.vendas(id) ON DELETE CASCADE,
  produto_id uuid NOT NULL REFERENCES public.produtos(id) ON DELETE RESTRICT,
  quantidade numeric(10,3) NOT NULL CHECK (quantidade > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (venda_id, produto_id)
);

ALTER TABLE public.vendas_canceladas_auditoria ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.estoque_reposicoes_cancelamento ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "vendas_canceladas_auditoria_select_loja" ON public.vendas_canceladas_auditoria;
CREATE POLICY "vendas_canceladas_auditoria_select_loja"
  ON public.vendas_canceladas_auditoria FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.caixas c
      INNER JOIN public.usuarios u ON u.id = auth.uid()
      WHERE c.id = vendas_canceladas_auditoria.caixa_id
        AND c.loja_id = u.loja_id
        AND (
          vendas_canceladas_auditoria.operador_id = auth.uid()
          OR u.perfil IN ('GERENTE', 'DONO', 'ADMIN')
        )
    )
  );

DROP POLICY IF EXISTS "vendas_canceladas_auditoria_insert_gerente" ON public.vendas_canceladas_auditoria;
CREATE POLICY "vendas_canceladas_auditoria_insert_gerente"
  ON public.vendas_canceladas_auditoria FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.caixas c
      INNER JOIN public.usuarios u ON u.id = auth.uid()
      WHERE c.id = vendas_canceladas_auditoria.caixa_id
        AND c.loja_id = u.loja_id
        AND u.perfil IN ('GERENTE', 'DONO', 'ADMIN')
    )
  );

DROP POLICY IF EXISTS "estoque_reposicoes_cancelamento_select_loja" ON public.estoque_reposicoes_cancelamento;
CREATE POLICY "estoque_reposicoes_cancelamento_select_loja"
  ON public.estoque_reposicoes_cancelamento FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.vendas v
      INNER JOIN public.caixas c ON c.id = v.caixa_id
      INNER JOIN public.usuarios u ON u.id = auth.uid()
      WHERE v.id = estoque_reposicoes_cancelamento.venda_id
        AND c.loja_id = u.loja_id
        AND (
          v.operador_id = auth.uid()
          OR u.perfil IN ('GERENTE', 'DONO', 'ADMIN')
        )
    )
  );

DROP POLICY IF EXISTS "estoque_reposicoes_cancelamento_insert_gerente" ON public.estoque_reposicoes_cancelamento;
CREATE POLICY "estoque_reposicoes_cancelamento_insert_gerente"
  ON public.estoque_reposicoes_cancelamento FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.vendas v
      INNER JOIN public.caixas c ON c.id = v.caixa_id
      INNER JOIN public.usuarios u ON u.id = auth.uid()
      WHERE v.id = estoque_reposicoes_cancelamento.venda_id
        AND c.loja_id = u.loja_id
        AND u.perfil IN ('GERENTE', 'DONO', 'ADMIN')
    )
  );

CREATE UNIQUE INDEX IF NOT EXISTS uq_devolucoes_venda_dinheiro
  ON public.devolucoes(venda_id)
  WHERE forma_pagamento = 'DINHEIRO';

CREATE OR REPLACE FUNCTION public.cancelar_venda_transacional(
  p_venda_id uuid,
  p_motivo text,
  p_operador_id uuid DEFAULT NULL
)
RETURNS TABLE (
  venda_id uuid,
  status_venda text,
  valor_estornado numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := COALESCE(auth.uid(), p_operador_id);
  v_motivo text := NULLIF(btrim(p_motivo), '');
  v_venda record;
  v_caixa record;
  v_item record;
  v_valor_estornado numeric(10,2) := 0;
BEGIN
  PERFORM set_config('lock_timeout', '4s', true);

  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'CANCELAR_VENDA_AUTH';
  END IF;
  IF v_motivo IS NULL THEN
    RAISE EXCEPTION 'CANCELAR_VENDA_MOTIVO_OBRIGATORIO';
  END IF;

  SELECT v.*
  INTO v_venda
  FROM public.vendas v
  WHERE v.id = p_venda_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'CANCELAR_VENDA_NAO_ENCONTRADA';
  END IF;
  IF v_venda.status = 'CANCELADA' THEN
    RAISE EXCEPTION 'CANCELAR_VENDA_JA_CANCELADA';
  END IF;

  SELECT c.*
  INTO v_caixa
  FROM public.caixas c
  WHERE c.id = v_venda.caixa_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'CANCELAR_VENDA_CAIXA_NAO_ENCONTRADO';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.usuarios u
    WHERE u.id = v_uid
      AND u.loja_id = v_caixa.loja_id
      AND u.perfil IN ('GERENTE', 'DONO', 'ADMIN')
  ) THEN
    RAISE EXCEPTION 'CANCELAR_VENDA_SEM_PERMISSAO';
  END IF;

  -- Reposição de estoque com lock por linha.
  FOR v_item IN
    SELECT iv.produto_id, iv.quantidade
    FROM public.itens_venda iv
    WHERE iv.venda_id = p_venda_id
  LOOP
    PERFORM 1
    FROM public.estoque e
    WHERE e.produto_id = v_item.produto_id
      AND e.loja_id = v_caixa.loja_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'CANCELAR_VENDA_ESTOQUE_NAO_ENCONTRADO';
    END IF;

    UPDATE public.estoque e
    SET
      quantidade_atual = e.quantidade_atual + v_item.quantidade,
      version = e.version + 1,
      updated_at = now()
    WHERE e.produto_id = v_item.produto_id
      AND e.loja_id = v_caixa.loja_id;

    INSERT INTO public.estoque_reposicoes_cancelamento (venda_id, produto_id, quantidade)
    VALUES (p_venda_id, v_item.produto_id, v_item.quantidade)
    ON CONFLICT (venda_id, produto_id) DO NOTHING;
  END LOOP;

  IF v_venda.forma_pagamento = 'DINHEIRO' THEN
    v_valor_estornado := ROUND(COALESCE(v_venda.total_liquido, 0), 2);

    INSERT INTO public.devolucoes (venda_id, valor, forma_pagamento, motivo, operador_id)
    VALUES (p_venda_id, v_valor_estornado, 'DINHEIRO', v_motivo, v_uid)
    ON CONFLICT DO NOTHING;

    UPDATE public.caixas c
    SET saldo_atual = ROUND(c.saldo_atual - v_valor_estornado, 2)
    WHERE c.id = v_caixa.id
      AND (c.saldo_atual - v_valor_estornado) >= 0;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'CANCELAR_VENDA_SALDO_CAIXA_INSUFICIENTE';
    END IF;
  END IF;

  UPDATE public.vendas
  SET status = 'CANCELADA'
  WHERE id = p_venda_id;

  INSERT INTO public.vendas_canceladas_auditoria (
    venda_id,
    caixa_id,
    operador_id,
    motivo,
    forma_pagamento,
    valor_estornado
  )
  VALUES (
    p_venda_id,
    v_caixa.id,
    v_uid,
    v_motivo,
    v_venda.forma_pagamento,
    v_valor_estornado
  )
  ON CONFLICT (venda_id) DO NOTHING;

  RETURN QUERY
  SELECT p_venda_id, 'CANCELADA'::text, v_valor_estornado;
END;
$$;

REVOKE ALL ON FUNCTION public.cancelar_venda_transacional(uuid, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cancelar_venda_transacional(uuid, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancelar_venda_transacional(uuid, text, uuid) TO service_role;

COMMENT ON FUNCTION public.cancelar_venda_transacional(uuid, text, uuid) IS
  'Cancela venda de forma transacional: repõe estoque, registra devolução em dinheiro, ajusta saldo do caixa e grava auditoria.';
