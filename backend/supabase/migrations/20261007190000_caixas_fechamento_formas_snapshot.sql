-- PR B — snapshot auditável por forma no fechamento (não é SSoT).
-- Persiste resultado de calcular_valor_sistema_por_forma_caixa no mesmo TX de fechar_caixa_atomico.
-- PIX/cartão: só valor_sistema_snapshot (sem valor_informado — sem conferência externa).
-- DINHEIRO: informado = p_valor_contado; diferença = fechamento_diferenca.
-- Contrato: docs/regras-negocio/CONTRATO_FECHAMENTO_POR_FORMA.md
-- Rollback: DROP TABLE caixas_fechamento_formas; reaplicar fechar_caixa_atomico de 20260902100200.

BEGIN;

CREATE TABLE IF NOT EXISTS public.caixas_fechamento_formas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  caixa_id uuid NOT NULL REFERENCES public.caixas(id) ON DELETE RESTRICT,
  forma_pagamento text NOT NULL
    CHECK (forma_pagamento IN ('DINHEIRO', 'PIX', 'CARTAO_DEBITO', 'CARTAO_CREDITO')),
  metrica text NOT NULL
    CHECK (metrica IN ('E_C_AUTORIDADE', 'REGISTRADO_JINLONG')),
  valor_sistema_snapshot numeric(10,2) NOT NULL,
  valor_informado numeric(10,2),
  diferenca numeric(10,2),
  origem_regra text NOT NULL DEFAULT 'calcular_valor_sistema_por_forma_caixa',
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.usuarios(id) ON DELETE SET NULL,
  CONSTRAINT uq_caixas_fechamento_formas_caixa_forma UNIQUE (caixa_id, forma_pagamento)
);

COMMENT ON TABLE public.caixas_fechamento_formas IS
  'SNAPSHOT_AUDITAVEL do fechamento por forma. Não é fonte de verdade transacional; autoridade = E(c)/vendas_pagamentos.';

COMMENT ON COLUMN public.caixas_fechamento_formas.valor_sistema_snapshot IS
  'Cópia no instante do fechamento de calcular_valor_sistema_por_forma_caixa; reconstruível pelas fontes canônicas.';

COMMENT ON COLUMN public.caixas_fechamento_formas.valor_informado IS
  'Só DINHEIRO nesta sprint (contado na gaveta). NULL em PIX/cartão — sem falsa conciliação.';

CREATE INDEX IF NOT EXISTS idx_caixas_fechamento_formas_caixa
  ON public.caixas_fechamento_formas (caixa_id);

ALTER TABLE public.caixas_fechamento_formas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS caixas_fechamento_formas_select_loja ON public.caixas_fechamento_formas;
CREATE POLICY caixas_fechamento_formas_select_loja
  ON public.caixas_fechamento_formas
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.caixas c
      JOIN public.usuarios u ON u.id = auth.uid()
      WHERE c.id = caixas_fechamento_formas.caixa_id
        AND c.loja_id = u.loja_id
        AND (
          c.operador_id = auth.uid()
          OR u.perfil IN ('GERENTE', 'DONO', 'ADMIN')
        )
    )
  );

REVOKE ALL ON TABLE public.caixas_fechamento_formas FROM PUBLIC, anon;
GRANT SELECT ON TABLE public.caixas_fechamento_formas TO authenticated;
GRANT ALL ON TABLE public.caixas_fechamento_formas TO service_role;

CREATE OR REPLACE FUNCTION internal.persistir_fechamento_formas(
  p_caixa_id uuid,
  p_valor_contado numeric,
  p_diferenca_dinheiro numeric,
  p_uid uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.caixas_fechamento_formas (
    caixa_id, forma_pagamento, metrica,
    valor_sistema_snapshot, valor_informado, diferenca,
    origem_regra, created_by
  )
  SELECT
    p_caixa_id,
    r.forma_pagamento,
    r.metrica,
    r.valor_sistema,
    CASE WHEN r.forma_pagamento = 'DINHEIRO' THEN ROUND(p_valor_contado, 2) ELSE NULL END,
    CASE WHEN r.forma_pagamento = 'DINHEIRO' THEN ROUND(p_diferenca_dinheiro, 2) ELSE NULL END,
    'calcular_valor_sistema_por_forma_caixa',
    p_uid
  FROM public.calcular_valor_sistema_por_forma_caixa(p_caixa_id) AS r
  ON CONFLICT (caixa_id, forma_pagamento) DO NOTHING;
END;
$function$;

REVOKE ALL ON FUNCTION internal.persistir_fechamento_formas(uuid, numeric, numeric, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION internal.persistir_fechamento_formas(uuid, numeric, numeric, uuid)
  TO service_role;

CREATE OR REPLACE FUNCTION public.listar_caixas_fechamento_formas(p_caixa_id uuid)
RETURNS TABLE (
  forma_pagamento text,
  metrica text,
  valor_sistema_snapshot numeric(10,2),
  valor_informado numeric(10,2),
  diferenca numeric(10,2),
  origem_regra text,
  created_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF p_caixa_id IS NULL THEN
    RAISE EXCEPTION 'CAIXA_ID_OBRIGATORIO';
  END IF;

  IF auth.uid() IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.caixas c
      JOIN public.usuarios u ON u.id = auth.uid()
      WHERE c.id = p_caixa_id
        AND c.loja_id = u.loja_id
        AND (c.operador_id = auth.uid() OR u.perfil IN ('GERENTE', 'DONO', 'ADMIN'))
    ) THEN
      RAISE EXCEPTION 'Acesso negado ao caixa informado.' USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN QUERY
  SELECT
    f.forma_pagamento,
    f.metrica,
    f.valor_sistema_snapshot,
    f.valor_informado,
    f.diferenca,
    f.origem_regra,
    f.created_at
  FROM public.caixas_fechamento_formas f
  WHERE f.caixa_id = p_caixa_id
  ORDER BY
    CASE f.forma_pagamento
      WHEN 'DINHEIRO' THEN 1
      WHEN 'PIX' THEN 2
      WHEN 'CARTAO_DEBITO' THEN 3
      WHEN 'CARTAO_CREDITO' THEN 4
      ELSE 9
    END;
END;
$function$;

COMMENT ON FUNCTION public.listar_caixas_fechamento_formas(uuid) IS
  'Lê SNAPSHOT_AUDITAVEL do fechamento por forma. Não recalcula; não é SSoT.';

REVOKE ALL ON FUNCTION public.listar_caixas_fechamento_formas(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.listar_caixas_fechamento_formas(uuid)
  TO authenticated, service_role;

-- fechar_caixa_atomico: corpo vigente + persistência de snapshot no mesmo TX.
CREATE OR REPLACE FUNCTION public.fechar_caixa_atomico(
  p_operador_id uuid,
  p_valor_contado numeric,
  p_motivo text DEFAULT ''
)
RETURNS TABLE (
  o_caixa_id uuid,
  o_valor_sistema numeric(10,2),
  o_valor_contado numeric(10,2),
  o_diferenca numeric(10,2),
  o_ja_fechado boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_caixa_id uuid;
  v_valor_sistema numeric(10,2);
  v_diferenca numeric(10,2);
  v_motivo text;
  v_fechado record;
  v_valor_contado_novo numeric(10,2);
  c_limite CONSTANT numeric := 5.00;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'FECHAR_CAIXA_SESSAO_EXPIRADA';
  END IF;
  IF v_uid <> p_operador_id THEN
    RAISE EXCEPTION 'FECHAR_CAIXA_SEM_PERMISSAO';
  END IF;

  v_motivo := TRIM(COALESCE(p_motivo, ''));

  SELECT c.id INTO v_caixa_id
  FROM public.caixas c
  WHERE c.operador_id = p_operador_id AND c.status = 'ABERTO'
  ORDER BY c.data_abertura DESC
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    SELECT c.id, c.valor_fechamento, c.fechamento_diferenca, c.data_fechamento
    INTO v_fechado
    FROM public.caixas c
    WHERE c.operador_id = p_operador_id AND c.status = 'FECHADO'
    ORDER BY c.data_fechamento DESC NULLS LAST, c.data_abertura DESC
    LIMIT 1;

    IF FOUND AND v_fechado.data_fechamento IS NOT NULL
       AND v_fechado.data_fechamento >= (now() - interval '24 hours') THEN
      v_valor_contado_novo := ROUND(p_valor_contado, 2);
      IF v_fechado.valor_fechamento IS NOT NULL
         AND v_fechado.valor_fechamento IS DISTINCT FROM v_valor_contado_novo THEN
        RAISE EXCEPTION 'FECHAR_CAIXA_REPETICAO_VALOR_DIVERGENTE'
          USING DETAIL = format('valor_fechamento_persistido=%s valor_contado_nova_chamada=%s',
            v_fechado.valor_fechamento, v_valor_contado_novo);
      END IF;

      RETURN QUERY SELECT
        v_fechado.id,
        ROUND(COALESCE(v_fechado.valor_fechamento, 0) - COALESCE(v_fechado.fechamento_diferenca, 0), 2)::numeric(10,2),
        COALESCE(v_fechado.valor_fechamento, v_valor_contado_novo),
        COALESCE(v_fechado.fechamento_diferenca, 0::numeric(10,2)),
        true;
      RETURN;
    END IF;

    RAISE EXCEPTION 'FECHAR_CAIXA_CAIXA_NAO_ENCONTRADO';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.movimentacoes_caixa m
    WHERE m.caixa_id = v_caixa_id AND m.status = 'pendente' AND m.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'FECHAR_CAIXA_MOVIMENTACOES_PENDENTES';
  END IF;

  v_valor_sistema := public.calcular_valor_sistema_dinheiro_caixa(v_caixa_id);
  v_diferenca := ROUND(p_valor_contado - v_valor_sistema, 2);

  IF ABS(v_diferenca) > c_limite AND LENGTH(v_motivo) < 5 THEN
    RAISE EXCEPTION 'FECHAR_CAIXA_DIVERGENCIA_SEM_MOTIVO' USING DETAIL = v_diferenca::text;
  END IF;

  UPDATE public.caixas SET
    status = 'FECHADO',
    data_fechamento = now(),
    valor_fechamento = ROUND(p_valor_contado, 2),
    fechamento_diferenca = v_diferenca,
    fechamento_observacao = NULLIF(v_motivo, '')
  WHERE id = v_caixa_id;

  -- Snapshot por forma no mesmo TX (idempotente em retry via UNIQUE + DO NOTHING).
  PERFORM internal.persistir_fechamento_formas(
    v_caixa_id, p_valor_contado, v_diferenca, v_uid
  );

  RETURN QUERY SELECT v_caixa_id, v_valor_sistema, ROUND(p_valor_contado, 2)::numeric(10,2), v_diferenca, false;
END;
$$;

REVOKE ALL ON FUNCTION public.fechar_caixa_atomico(uuid, numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fechar_caixa_atomico(uuid, numeric, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fechar_caixa_atomico(uuid, numeric, text) TO service_role;

COMMENT ON FUNCTION public.fechar_caixa_atomico(uuid, numeric, text) IS
  'Fechamento idempotente + snapshot auditável por forma (PR B). Snapshot ≠ SSoT; E(c) permanece autoridade do dinheiro.';

DO $verify$
DECLARE
  v_def text;
BEGIN
  v_def := pg_get_functiondef('public.fechar_caixa_atomico(uuid, numeric, text)'::regprocedure);
  IF position('persistir_fechamento_formas' IN v_def) = 0 THEN
    RAISE EXCEPTION 'PR_B_SNAPSHOT_NAO_PERSISTIDO_NO_FECHAR';
  END IF;
  IF position('FECHAR_CAIXA_REPETICAO_VALOR_DIVERGENTE' IN v_def) = 0 THEN
    RAISE EXCEPTION 'GATE_2_1_GUARD_AUSENTE';
  END IF;
  IF has_function_privilege('anon', 'public.fechar_caixa_atomico(uuid, numeric, text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'GRANT_ANON_INDEVIDO';
  END IF;
END
$verify$;

COMMIT;
