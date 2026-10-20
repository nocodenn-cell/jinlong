-- golive-final-584 :: 20261007190000 caixas_fechamento_formas_snapshot :: sha256 c09427b98d00057eb71f0c73fdf5cc4e4c9a658782801467ea627a186099898c
BEGIN;
SET LOCAL lock_timeout = '5s'; SET LOCAL statement_timeout = '180s';
DO $g$ BEGIN IF EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20261007190000') THEN RAISE EXCEPTION 'GOLIVE_STOP: % já no histórico', '20261007190000'; END IF; END $g$;
-- PR B — snapshot auditável por forma no fechamento (não é SSoT).
-- Persiste resultado de calcular_valor_sistema_por_forma_caixa no mesmo TX de fechar_caixa_atomico.
-- PIX/cartão: só valor_sistema_snapshot (sem valor_informado — sem conferência externa).
-- DINHEIRO: informado = p_valor_contado; diferença = fechamento_diferenca.
-- Contrato: docs/regras-negocio/CONTRATO_FECHAMENTO_POR_FORMA.md
-- Rollback: DROP TABLE caixas_fechamento_formas; reaplicar fechar_caixa_atomico de 20260902100200.


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

;
INSERT INTO supabase_migrations.schema_migrations(version, name, statements) VALUES ('20261007190000', 'caixas_fechamento_formas_snapshot', ARRAY[$golive_stmt_c09427b98d00$-- PR B — snapshot auditável por forma no fechamento (não é SSoT).
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
$golive_stmt_c09427b98d00$]);
DO $chk$ DECLARE v text; o bigint; BEGIN
  SELECT replace((SELECT (SELECT 'vendas:'||count(*)||':'||coalesce(md5(string_agg(h,'' ORDER BY h)),'-') FROM (SELECT md5(ROW(caixa_id,chave_nf,cliente_id,created_at,data,forma_pagamento,id,idempotency_key,numero_nf,operador_id,pricing_version_id,status,tipo_venda,total_bruto,total_desconto,total_liquido)::text) h FROM public.vendas) s)||' # '||(SELECT 'itens_venda:'||count(*)||':'||coalesce(md5(string_agg(h,'' ORDER BY h)),'-') FROM (SELECT md5(ROW(custo_unitario_snap,desconto_unitario,id,preco_unitario,preco_unitario_original,pricing_version_id,produto_id,promocao_desconto_percentual,promocao_nome_snapshot,promocao_regra_id,quantidade,regra_aplicada_id,tipo_preco,tipo_preco_fonte,venda_id)::text) h FROM public.itens_venda) s)||' # '||(SELECT 'vendas_pagamentos:'||count(*)||':'||coalesce(md5(string_agg(h,'' ORDER BY h)),'-') FROM (SELECT md5(ROW(created_at,forma_pagamento,id,valor,venda_id)::text) h FROM public.vendas_pagamentos) s)||' # '||(SELECT 'caixas:'||count(*)||':'||coalesce(md5(string_agg(h,'' ORDER BY h)),'-') FROM (SELECT md5(ROW(autorizado_por,conta_financeira_id,data_abertura,data_fechamento,fechamento_diferenca,fechamento_observacao,id,loja_id,motivo_retomada,operador_id,saldo_atual,status,turno_anterior_id,valor_fechamento,valor_inicial)::text) h FROM public.caixas) s)||' # '||(SELECT 'movimentacoes_caixa:'||count(*)||':'||coalesce(md5(string_agg(h,'' ORDER BY h)),'-') FROM (SELECT md5(ROW(caixa_id,created_at,deleted_at,device_id,forma_pagamento,gerente_id,id,idempotency_key,ip_address,loja_id,motivo,motivo_codigo,movimentacao_origem_id,numero_sequencial,operador_id,saldo_antes,saldo_depois,status,terminal_id,tipo,updated_at,user_agent,valor)::text) h FROM public.movimentacoes_caixa) s)||' # '||(SELECT 'estoque:'||count(*)||':'||coalesce(md5(string_agg(h,'' ORDER BY h)),'-') FROM (SELECT md5(ROW(estoque_minimo,id,loja_id,produto_id,quantidade_atual,updated_at,version)::text) h FROM public.estoque) s)||' # '||(SELECT 'produtos:'||count(*)||':'||coalesce(md5(string_agg(h,'' ORDER BY h)),'-') FROM (SELECT md5(ROW(ativo,atualizado_por,categoria_id,cest,cfop_produto,codigo_barras,codigo_interno,comissao_tipo,comissao_valor,created_at,criado_por,csosn,cst_cofins,cst_pis,estoque_minimo,fornecedor_id,icms_origem,id,imagem_url,limite_transferencia_sem_observacao,localizacao_prateleira,loja_id,marca_id,ncm,nome,nome_reduzido_pdv,nome_sem_acento,observacao,origem,permitir_abaixo_custo,preco_atacado,preco_custo,preco_custo_medio,preco_varejo,quantidade_gatilho_atacado,referencia_fornecedor,status_publicacao,tags,tem_nf,unidade_medida,updated_at)::text) h FROM public.produtos) s)||' # '||(SELECT 'usuarios:'||count(*)||':'||coalesce(md5(string_agg(h,'' ORDER BY h)),'-') FROM (SELECT md5(ROW(ativo,created_at,funcionario_id,id,idioma_preferido,loja_id,nome,perfil)::text) h FROM public.usuarios) s)||' # '||(SELECT 'clientes:'||count(*)||':'||coalesce(md5(string_agg(h,'' ORDER BY h)),'-') FROM (SELECT md5(ROW(ativo,consentimento_privacidade_em,created_at,documento,email,endereco,id,limite_credito,loja_id,nome,telefone,termos_aceitos_em,tipo)::text) h FROM public.clientes) s)||' # '||(SELECT 'lojas:'||count(*)||':'||coalesce(md5(string_agg(h,'' ORDER BY h)),'-') FROM (SELECT md5(ROW(ativo,cnae,cnpj,codigo,created_at,email,endereco_bairro,endereco_cep,endereco_cidade,endereco_complemento,endereco_logradouro,endereco_numero,endereco_uf,id,inscricao_estadual,logo_url,nome,nome_fantasia,numero_serie_nfce,numero_serie_nfe,razao_social,telefone)::text) h FROM public.lojas) s)||' # '||(SELECT 'formas_pagamento:'||count(*)||':'||coalesce(md5(string_agg(h,'' ORDER BY h)),'-') FROM (SELECT md5(ROW(ativo,codigo,created_at,id,loja_id,nome,prazo_compensacao_dias,taxa_percentual,updated_at)::text) h FROM public.formas_pagamento) s)||' # '||(SELECT 'contas_financeiras:'||count(*)||':'||coalesce(md5(string_agg(h,'' ORDER BY h)),'-') FROM (SELECT md5(ROW(ativo,created_at,criado_por,data_inicial,id,loja_id,nome,tipo)::text) h FROM public.contas_financeiras) s)||' # '||(SELECT 'contas_pagar:'||count(*)||':'||coalesce(md5(string_agg(h,'' ORDER BY h)),'-') FROM (SELECT md5(ROW(cancelamento_em,cancelamento_motivo,categoria_id,competencia,criado_em,descricao,favorecido,fornecedor_id,id,loja_id,lote_id,nfe_importacao_id,nfe_numero,observacao,parcela,status,valor_pago,valor_total,vencimento)::text) h FROM public.contas_pagar) s)||' # '||(SELECT 'contas_receber:'||count(*)||':'||coalesce(md5(string_agg(h,'' ORDER BY h)),'-') FROM (SELECT md5(ROW(categoria_id,cliente_id,competencia,created_at,descricao,id,loja_id,status,valor_aberto,valor_total,vencimento,venda_id)::text) h FROM public.contas_receber) s)||' # '||(SELECT 'pdv_config:'||count(*)||':'||coalesce(md5(string_agg(h,'' ORDER BY h)),'-') FROM (SELECT md5(ROW(alertas_leves_ativos,auto_enqueue_fiscal,blind_closure,cfop_padrao,cst_padrao,formato_impressao,gerente_id,gerente_senha_bcrypt,id,idioma_padrao,imprimir_cupom_auto,limite_sangria_sem_gerente,limite_transferencia_obs,loja_id,max_desconto_gerente_percentual,max_desconto_manual_item_percentual,max_desconto_total_percentual,modo_limite_credito,quantidade_minima_atacado_padrao,regime_tributario,show_margin_visual,show_preco_fonte,show_stock_alerts,tema_padrao)::text) h FROM public.pdv_config) s)||' # '||(SELECT 'documentos_fiscais_pendentes:'||count(*)||':'||coalesce(md5(string_agg(h,'' ORDER BY h)),'-') FROM (SELECT md5(ROW(chave_fiscal,correlation_id,created_at,deleted_at,fiscal_action_hint,fiscal_error_category,fiscal_error_code,fiscal_error_payload,fiscal_next_step_url,fiscal_retryable,id,payload,processado_em,protocolo,provider,provider_ref,proxima_tentativa_em,status,tentativas,tipo_doc,transicao_origem,ultima_tentativa_em,ultima_transicao_em,ultimo_erro,updated_at,venda_id,xml_armazenado_em,xml_lease_expires_em,xml_lease_token,xml_proxima_tentativa_em,xml_sha256,xml_status,xml_storage_path,xml_tentativas,xml_ultimo_erro)::text) h FROM public.documentos_fiscais_pendentes) s)||' # '||(SELECT 'totais:'||coalesce(string_agg(x,';' ORDER BY x),'') FROM (SELECT md5(l.id::text)||'|'||(SELECT count(*) FROM public.vendas v JOIN public.caixas c ON c.id=v.caixa_id WHERE c.loja_id=l.id)||'|'||(SELECT coalesce(sum(v.total_liquido),0) FROM public.vendas v JOIN public.caixas c ON c.id=v.caixa_id WHERE c.loja_id=l.id AND v.status<>'CANCELADA')||'|'||(SELECT coalesce(sum(p.valor),0) FROM public.vendas_pagamentos p JOIN public.vendas v ON v.id=p.venda_id JOIN public.caixas c ON c.id=v.caixa_id WHERE c.loja_id=l.id)||'|'||(SELECT coalesce(sum(saldo_atual),0) FROM public.caixas c WHERE c.loja_id=l.id)||'|'||(SELECT coalesce(round(sum(quantidade_atual),3),0) FROM public.estoque e WHERE e.loja_id=l.id) x FROM public.lojas l) z)), ' # ', chr(1)) INTO v;
  IF v IS DISTINCT FROM $b$vendas:268:d91380e73abcf09a1086cba6e9aa094eitens_venda:266:db402eee5f6d7957110757600882edccvendas_pagamentos:201:3432d6d312e6f6f24ea9612a7257e235caixas:58:1b639b4221cdfaf9bfcc3ebf5660fbedmovimentacoes_caixa:0:-estoque:158:061c9e8da8142a531eb8d0728e3b4b15produtos:161:8fba5ff547239f94467b7a2126222120usuarios:13:2acdeaaf217d2571a434f8e8ff767aa2clientes:0:-lojas:4:812269b5692f7006f88ec49b088e9c36formas_pagamento:16:c1bbdbff97007016877776ad56afcccccontas_financeiras:0:-contas_pagar:2:2567d13b490befeaf7cc8bf48d01cfe1contas_receber:0:-pdv_config:1:899f43bdba711cfddea47afd00c8b21adocumentos_fiscais_pendentes:0:-totais:528f99d0e010f11ef321f548d3a7b51c|0|0|0|0|20.000;7ab49c7a91a109170b7e57fef3243a59|2|100.00|0|100.00|0.000;86641fb0d5893caebab1d0b38f0ef759|0|0|0|0|0;b5381bb6313900060b277d41cd1d490c|266|49013.80|38569.80|6500.00|284546.000$b$ THEN RAISE EXCEPTION 'GOLIVE_STOP: totais/hashes divergem da baseline após 20261007190000: %', replace(v, chr(1), ' # '); END IF;
  WITH fk AS (SELECT c.conrelid::regclass filho, c.confrelid::regclass pai,
 (SELECT string_agg(format('f.%I = p.%I', af.attname, ap.attname), ' AND ' ORDER BY k.i) FROM unnest(c.conkey, c.confkey) WITH ORDINALITY k(fc, pc, i) JOIN pg_attribute af ON af.attrelid=c.conrelid AND af.attnum=k.fc JOIN pg_attribute ap ON ap.attrelid=c.confrelid AND ap.attnum=k.pc) cond,
 (SELECT string_agg(format('f.%I IS NOT NULL', af.attname), ' AND ') FROM unnest(c.conkey) k(fc) JOIN pg_attribute af ON af.attrelid=c.conrelid AND af.attnum=k.fc) nn
 FROM pg_constraint c WHERE c.contype='f' AND c.connamespace IN ('public'::regnamespace) )
SELECT count(*) FILTER (WHERE (xpath('/row/c/text()', query_to_xml(format('SELECT count(*) c FROM %s f WHERE %s AND NOT EXISTS (SELECT 1 FROM %s p WHERE %s)', filho, nn, pai, cond), false, true, '')))[1]::text::bigint > 0) FROM fk INTO o;
  IF o <> 0 THEN RAISE EXCEPTION 'GOLIVE_STOP: % FK(s) com órfãos após 20261007190000', o; END IF;
  IF NOT EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20261007190000' AND name='caixas_fechamento_formas_snapshot') THEN RAISE EXCEPTION 'GOLIVE_STOP: linha de histórico ausente 20261007190000'; END IF;
END $chk$;
COMMIT;
