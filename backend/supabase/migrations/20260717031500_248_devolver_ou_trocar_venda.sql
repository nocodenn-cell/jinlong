-- Backport Fase 1 (Git-only) from supabase_migrations.schema_migrations.statements
-- version: 20260717031500
-- name: 248_devolver_ou_trocar_venda
-- source: production read-only export (schema_migrations)
-- Applied in production: yes (do NOT re-run on production).

-- Sprint B: Devolução/Troca pós-venda — RPC idempotente + kardex + estorno financeiro.
--
-- Escopo:
--   - Devolução parcial de itens (estoque + financeiro)
--   - Troca (mesmo fluxo + vínculo opcional com venda substituta)
--   - Idempotência por p_idempotency_key
--   - Estorno contas_receber quando forma = CREDITO_CLIENTE
--   - Patch cancelar_venda: cancela contas_receber vinculada

-- ---------------------------------------------------------------------------
-- 1. Tabelas de operação pós-venda
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.venda_pos_venda_operacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key text NOT NULL,
  venda_id uuid NOT NULL REFERENCES public.vendas (id) ON DELETE RESTRICT,
  tipo text NOT NULL CHECK (tipo IN ('DEVOLUCAO', 'TROCA')),
  motivo text NOT NULL CHECK (length(btrim(motivo)) >= 2),
  valor_estornado numeric(10, 2) NOT NULL DEFAULT 0 CHECK (valor_estornado >= 0),
  valor_caixa_estornado numeric(10, 2) NOT NULL DEFAULT 0 CHECK (valor_caixa_estornado >= 0),
  forma_estorno text NOT NULL CHECK (
    forma_estorno IN ('DINHEIRO', 'PIX', 'CARTAO_DEBITO', 'CARTAO_CREDITO', 'CREDITO_CLIENTE')
  ),
  operador_id uuid NOT NULL REFERENCES public.usuarios (id),
  caixa_id uuid NOT NULL REFERENCES public.caixas (id),
  venda_substituta_id uuid REFERENCES public.vendas (id),
  contas_receber_id uuid REFERENCES public.contas_receber (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_venda_pos_venda_operacoes_idempotency UNIQUE (idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_venda_pos_venda_operacoes_venda
  ON public.venda_pos_venda_operacoes (venda_id, created_at DESC);

COMMENT ON TABLE public.venda_pos_venda_operacoes IS
  'Operações pós-venda (devolução parcial ou troca) com idempotência e trilha financeira.';

CREATE TABLE IF NOT EXISTS public.venda_pos_venda_itens (
  operacao_id uuid NOT NULL REFERENCES public.venda_pos_venda_operacoes (id) ON DELETE CASCADE,
  item_venda_id uuid NOT NULL REFERENCES public.itens_venda (id) ON DELETE RESTRICT,
  produto_id uuid NOT NULL REFERENCES public.produtos (id) ON DELETE RESTRICT,
  quantidade numeric(10, 3) NOT NULL CHECK (quantidade > 0),
  preco_unitario numeric(10, 2) NOT NULL CHECK (preco_unitario >= 0),
  subtotal numeric(10, 2) NOT NULL CHECK (subtotal >= 0),
  PRIMARY KEY (operacao_id, item_venda_id)
);

CREATE TABLE IF NOT EXISTS public.estoque_reposicoes_devolucao (
  operacao_id uuid NOT NULL REFERENCES public.venda_pos_venda_operacoes (id) ON DELETE CASCADE,
  produto_id uuid NOT NULL REFERENCES public.produtos (id) ON DELETE RESTRICT,
  quantidade numeric(10, 3) NOT NULL CHECK (quantidade > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (operacao_id, produto_id)
);

ALTER TABLE public.venda_pos_venda_operacoes ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.venda_pos_venda_itens ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.estoque_reposicoes_devolucao ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "venda_pos_venda_operacoes_select_loja" ON public.venda_pos_venda_operacoes;

CREATE POLICY "venda_pos_venda_operacoes_select_loja"
  ON public.venda_pos_venda_operacoes FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.caixas c
      INNER JOIN public.usuarios u ON u.id = auth.uid()
      WHERE c.id = venda_pos_venda_operacoes.caixa_id
        AND c.loja_id = u.loja_id
    )
  );

DROP POLICY IF EXISTS "venda_pos_venda_itens_select_loja" ON public.venda_pos_venda_itens;

CREATE POLICY "venda_pos_venda_itens_select_loja"
  ON public.venda_pos_venda_itens FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.venda_pos_venda_operacoes o
      INNER JOIN public.caixas c ON c.id = o.caixa_id
      INNER JOIN public.usuarios u ON u.id = auth.uid()
      WHERE o.id = venda_pos_venda_itens.operacao_id
        AND c.loja_id = u.loja_id
    )
  );

DROP POLICY IF EXISTS "estoque_reposicoes_devolucao_select_loja" ON public.estoque_reposicoes_devolucao;

CREATE POLICY "estoque_reposicoes_devolucao_select_loja"
  ON public.estoque_reposicoes_devolucao FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.venda_pos_venda_operacoes o
      INNER JOIN public.caixas c ON c.id = o.caixa_id
      INNER JOIN public.usuarios u ON u.id = auth.uid()
      WHERE o.id = estoque_reposicoes_devolucao.operacao_id
        AND c.loja_id = u.loja_id
    )
  );

-- devolucoes: vínculo opcional com operação (permite múltiplas devoluções parciais)
ALTER TABLE public.devolucoes
  ADD COLUMN IF NOT EXISTS operacao_id uuid REFERENCES public.venda_pos_venda_operacoes (id) ON DELETE SET NULL;

DROP INDEX IF EXISTS public.uq_devolucoes_venda_dinheiro;

CREATE UNIQUE INDEX IF NOT EXISTS uq_devolucoes_venda_dinheiro_legacy
  ON public.devolucoes (venda_id)
  WHERE forma_pagamento = 'DINHEIRO' AND operacao_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_devolucoes_operacao_forma
  ON public.devolucoes (operacao_id, forma_pagamento)
  WHERE operacao_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 2. Ledger: evento SALE_PARTIAL_RETURN
-- ---------------------------------------------------------------------------

ALTER TABLE public.venda_eventos DROP CONSTRAINT IF EXISTS venda_eventos_event_type_check;

ALTER TABLE public.venda_eventos
  ADD CONSTRAINT venda_eventos_event_type_check
  CHECK (event_type IN ('SALE_REGISTERED', 'SALE_CANCELLED', 'SALE_PARTIAL_RETURN'));

-- ---------------------------------------------------------------------------
-- 3. Kardex: entradas por devolução parcial
-- ---------------------------------------------------------------------------

INSERT INTO public.tipos_movimento_estoque (
  codigo, rotulo, exige_gerente, permite_entrada, permite_saida
)
VALUES
  ('ENTRADA_DEVOLUCAO_CLIENTE', 'Devolução de cliente (pós-venda)', true, true, false)
ON CONFLICT (codigo) DO NOTHING;

DROP VIEW IF EXISTS public.v_kardex_unificado;

CREATE VIEW public.v_kardex_unificado
WITH (security_invoker = true)
AS
SELECT
  ('mel:' || m.id::text)::text AS evento_id,
  m.created_at AS ocorrido_em,
  m.loja_id,
  m.produto_id,
  m.quantidade_delta,
  'movimentos_estoque_log'::text AS origem,
  m.tipo_codigo,
  COALESCE(m.venda_id, m.id) AS referencia_id,
  m.usuario_id,
  m.observacao
FROM public.movimentos_estoque_log m

UNION ALL

SELECT
  ('eb:' || eb.venda_id::text || ':' || eb.produto_id::text)::text AS evento_id,
  eb.created_at AS ocorrido_em,
  c.loja_id,
  eb.produto_id,
  (-COALESCE(eb.quantidade, ivsum.qtd, 0::numeric))::numeric(10, 3) AS quantidade_delta,
  'estoque_baixas'::text AS origem,
  'SAIDA_VENDA'::text AS tipo_codigo,
  eb.venda_id AS referencia_id,
  v.operador_id AS usuario_id,
  NULL::text AS observacao
FROM public.estoque_baixas eb
INNER JOIN public.vendas v ON v.id = eb.venda_id
INNER JOIN public.caixas c ON c.id = v.caixa_id
LEFT JOIN LATERAL (
  SELECT SUM(iv.quantidade)::numeric(10, 3) AS qtd
  FROM public.itens_venda iv
  WHERE iv.venda_id = eb.venda_id AND iv.produto_id = eb.produto_id
) ivsum ON true
WHERE NOT EXISTS (
  SELECT 1 FROM public.movimentos_estoque_log mel
  WHERE mel.venda_id = eb.venda_id
    AND mel.produto_id = eb.produto_id
    AND mel.tipo_codigo = 'SAIDA_VENDA'
)

UNION ALL

SELECT
  ('erc:' || erc.venda_id::text || ':' || erc.produto_id::text)::text AS evento_id,
  erc.created_at AS ocorrido_em,
  c.loja_id,
  erc.produto_id,
  erc.quantidade AS quantidade_delta,
  'estoque_reposicoes_cancelamento'::text AS origem,
  'ENTRADA_CANCELAMENTO_VENDA'::text AS tipo_codigo,
  erc.venda_id AS referencia_id,
  vca.operador_id AS usuario_id,
  vca.motivo AS observacao
FROM public.estoque_reposicoes_cancelamento erc
INNER JOIN public.vendas v ON v.id = erc.venda_id
INNER JOIN public.caixas c ON c.id = v.caixa_id
LEFT JOIN public.vendas_canceladas_auditoria vca ON vca.venda_id = erc.venda_id

UNION ALL

SELECT
  ('erd:' || erd.operacao_id::text || ':' || erd.produto_id::text)::text AS evento_id,
  erd.created_at AS ocorrido_em,
  c.loja_id,
  erd.produto_id,
  erd.quantidade AS quantidade_delta,
  'estoque_reposicoes_devolucao'::text AS origem,
  'ENTRADA_DEVOLUCAO_CLIENTE'::text AS tipo_codigo,
  o.venda_id AS referencia_id,
  o.operador_id AS usuario_id,
  o.motivo AS observacao
FROM public.estoque_reposicoes_devolucao erd
INNER JOIN public.venda_pos_venda_operacoes o ON o.id = erd.operacao_id
INNER JOIN public.caixas c ON c.id = o.caixa_id;

COMMENT ON VIEW public.v_kardex_unificado IS
  'Kardex: movimentos_estoque_log + baixas legadas + cancelamento + devolução parcial.';

GRANT SELECT ON public.v_kardex_unificado TO authenticated;

GRANT SELECT ON public.v_kardex_unificado TO service_role;

-- ---------------------------------------------------------------------------
-- 4. Helper: quantidade já devolvida por item
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.quantidade_devolvida_item_venda(p_item_venda_id uuid)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(SUM(vpi.quantidade), 0)::numeric(10, 3)
  FROM public.venda_pos_venda_itens vpi
  INNER JOIN public.venda_pos_venda_operacoes o ON o.id = vpi.operacao_id
  WHERE vpi.item_venda_id = p_item_venda_id;
$$;

-- ---------------------------------------------------------------------------
-- 5. RPC canônica: devolver_ou_trocar_venda
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.devolver_ou_trocar_venda(
  p_venda_id uuid,
  p_idempotency_key text,
  p_motivo text,
  p_tipo text,
  p_itens jsonb,
  p_valor_estorno numeric,
  p_forma_estorno text,
  p_venda_substituta_id uuid DEFAULT NULL,
  p_operador_id uuid DEFAULT NULL
)
RETURNS TABLE (
  operacao_id uuid,
  venda_id uuid,
  tipo text,
  valor_estornado numeric,
  valor_caixa_estornado numeric,
  status_venda text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := COALESCE(auth.uid(), p_operador_id);
  v_key text := NULLIF(btrim(p_idempotency_key), '');
  v_motivo text := NULLIF(btrim(p_motivo), '');
  v_tipo text := upper(NULLIF(btrim(p_tipo), ''));
  v_forma text := upper(NULLIF(btrim(p_forma_estorno), ''));
  v_venda record;
  v_caixa record;
  v_existing record;
  v_operacao_id uuid;
  v_item jsonb;
  v_item_venda_id uuid;
  v_produto_id uuid;
  v_qtd numeric(10, 3);
  v_qtd_vendida numeric(10, 3);
  v_qtd_ja_devolvida numeric(10, 3);
  v_preco_unit numeric(10, 2);
  v_subtotal numeric(10, 2);
  v_total_itens numeric(10, 2) := 0;
  v_valor_estorno numeric(10, 2);
  v_valor_caixa numeric(10, 2) := 0;
  v_cr record;
  v_contas_receber_id uuid := NULL;
  v_event_items jsonb := '[]'::jsonb;
  c_source constant text := 'gerente_panel';
BEGIN
  PERFORM set_config('lock_timeout', '4s', true);

  IF v_uid IS NULL THEN RAISE EXCEPTION 'DEVOLVER_VENDA_AUTH'; END IF;
  IF v_key IS NULL THEN RAISE EXCEPTION 'DEVOLVER_VENDA_IDEMPOTENCY_OBRIGATORIA'; END IF;
  IF v_motivo IS NULL THEN RAISE EXCEPTION 'DEVOLVER_VENDA_MOTIVO_OBRIGATORIO'; END IF;
  IF v_tipo NOT IN ('DEVOLUCAO', 'TROCA') THEN RAISE EXCEPTION 'DEVOLVER_VENDA_TIPO_INVALIDO'; END IF;
  IF v_forma NOT IN ('DINHEIRO', 'PIX', 'CARTAO_DEBITO', 'CARTAO_CREDITO', 'CREDITO_CLIENTE') THEN
    RAISE EXCEPTION 'DEVOLVER_VENDA_FORMA_INVALIDA';
  END IF;
  IF p_itens IS NULL OR jsonb_typeof(p_itens) <> 'array' OR jsonb_array_length(p_itens) <= 0 THEN
    RAISE EXCEPTION 'DEVOLVER_VENDA_ITENS_OBRIGATORIOS';
  END IF;

  -- Idempotência: retorno da operação existente
  SELECT o.* INTO v_existing
  FROM public.venda_pos_venda_operacoes o
  WHERE o.idempotency_key = v_key;

  IF FOUND THEN
    RETURN QUERY
    SELECT v_existing.id, v_existing.venda_id, v_existing.tipo,
      v_existing.valor_estornado, v_existing.valor_caixa_estornado, 'CONCLUIDA'::text;
    RETURN;
  END IF;

  SELECT v.* INTO v_venda FROM public.vendas v WHERE v.id = p_venda_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'DEVOLVER_VENDA_NAO_ENCONTRADA'; END IF;
  IF v_venda.status <> 'CONCLUIDA' THEN RAISE EXCEPTION 'DEVOLVER_VENDA_STATUS_INVALIDO'; END IF;

  SELECT c.* INTO v_caixa FROM public.caixas c WHERE c.id = v_venda.caixa_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'DEVOLVER_VENDA_CAIXA_NAO_ENCONTRADO'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.usuarios u
    WHERE u.id = v_uid AND u.loja_id = v_caixa.loja_id AND u.perfil IN ('GERENTE', 'DONO', 'ADMIN')
  ) THEN
    RAISE EXCEPTION 'DEVOLVER_VENDA_SEM_PERMISSAO';
  END IF;

  IF v_tipo = 'TROCA' AND p_venda_substituta_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.vendas vs
      WHERE vs.id = p_venda_substituta_id AND vs.status = 'CONCLUIDA'
    ) THEN
      RAISE EXCEPTION 'DEVOLVER_VENDA_SUBSTITUTA_INVALIDA';
    END IF;
  END IF;

  -- Calcular total dos itens devolvidos
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_itens)
  LOOP
    v_item_venda_id := (v_item->>'item_venda_id')::uuid;
    v_qtd := (v_item->>'quantidade')::numeric(10, 3);

    IF v_item_venda_id IS NULL OR v_qtd IS NULL OR v_qtd <= 0 THEN
      RAISE EXCEPTION 'DEVOLVER_VENDA_ITEM_INVALIDO';
    END IF;

    SELECT iv.produto_id, iv.quantidade, iv.preco_unitario
    INTO v_produto_id, v_qtd_vendida, v_preco_unit
    FROM public.itens_venda iv
    WHERE iv.id = v_item_venda_id AND iv.venda_id = p_venda_id;

    IF NOT FOUND THEN RAISE EXCEPTION 'DEVOLVER_VENDA_ITEM_NAO_PERTENCE'; END IF;

    v_qtd_ja_devolvida := public.quantidade_devolvida_item_venda(v_item_venda_id);
    IF v_qtd_ja_devolvida + v_qtd > v_qtd_vendida + 0.0005 THEN
      RAISE EXCEPTION 'DEVOLVER_VENDA_QTD_EXCEDE_VENDIDA';
    END IF;

    v_subtotal := public.round_abnt(v_preco_unit * v_qtd, 2);
    v_total_itens := v_total_itens + v_subtotal;
  END LOOP;

  v_total_itens := public.round_abnt(v_total_itens, 2);
  v_valor_estorno := public.round_abnt(COALESCE(p_valor_estorno, v_total_itens), 2);

  IF ABS(v_valor_estorno - v_total_itens) > 0.02 THEN
    RAISE EXCEPTION 'DEVOLVER_VENDA_VALOR_DIVERGENTE';
  END IF;

  IF v_valor_estorno <= 0 THEN RAISE EXCEPTION 'DEVOLVER_VENDA_VALOR_ZERO'; END IF;

  -- Estorno contas_receber
  IF v_forma = 'CREDITO_CLIENTE' THEN
    SELECT cr.* INTO v_cr
    FROM public.contas_receber cr
    WHERE cr.venda_id = p_venda_id AND cr.status IN ('ABERTO', 'PARCIAL')
    FOR UPDATE;

    IF NOT FOUND THEN RAISE EXCEPTION 'DEVOLVER_VENDA_SEM_CONTA_RECEBER'; END IF;
    IF v_cr.valor_aberto < v_valor_estorno - 0.01 THEN
      RAISE EXCEPTION 'DEVOLVER_VENDA_VALOR_EXCEDE_ABERTO';
    END IF;
    v_contas_receber_id := v_cr.id;
  END IF;

  v_operacao_id := gen_random_uuid();

  INSERT INTO public.venda_pos_venda_operacoes (
    id, idempotency_key, venda_id, tipo, motivo,
    valor_estornado, valor_caixa_estornado, forma_estorno,
    operador_id, caixa_id, venda_substituta_id, contas_receber_id
  ) VALUES (
    v_operacao_id, v_key, p_venda_id, v_tipo, v_motivo,
    v_valor_estorno, 0, v_forma,
    v_uid, v_caixa.id, p_venda_substituta_id,
    v_contas_receber_id
  );

  -- Processar itens: estoque + linhas de operação
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_itens)
  LOOP
    v_item_venda_id := (v_item->>'item_venda_id')::uuid;
    v_qtd := (v_item->>'quantidade')::numeric(10, 3);

    SELECT iv.produto_id, iv.preco_unitario
    INTO v_produto_id, v_preco_unit
    FROM public.itens_venda iv
    WHERE iv.id = v_item_venda_id AND iv.venda_id = p_venda_id;

    v_subtotal := public.round_abnt(v_preco_unit * v_qtd, 2);

    PERFORM 1 FROM public.estoque e
    WHERE e.produto_id = v_produto_id AND e.loja_id = v_caixa.loja_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'DEVOLVER_VENDA_ESTOQUE_NAO_ENCONTRADO'; END IF;

    UPDATE public.estoque e
    SET quantidade_atual = e.quantidade_atual + v_qtd,
      version = e.version + 1,
      updated_at = now()
    WHERE e.produto_id = v_produto_id AND e.loja_id = v_caixa.loja_id;

    INSERT INTO public.estoque_reposicoes_devolucao (operacao_id, produto_id, quantidade)
    VALUES (v_operacao_id, v_produto_id, v_qtd);

    INSERT INTO public.venda_pos_venda_itens (
      operacao_id, item_venda_id, produto_id, quantidade, preco_unitario, subtotal
    ) VALUES (
      v_operacao_id, v_item_venda_id, v_produto_id, v_qtd, v_preco_unit, v_subtotal
    );

    v_event_items := v_event_items || jsonb_build_array(
      jsonb_build_object(
        'item_venda_id', v_item_venda_id,
        'produto_id', v_produto_id,
        'quantidade', v_qtd,
        'preco_unitario', v_preco_unit,
        'subtotal', v_subtotal
      )
    );
  END LOOP;

  -- Financeiro: devolucoes + caixa / contas_receber
  IF v_forma = 'CREDITO_CLIENTE' THEN
    UPDATE public.contas_receber cr
    SET valor_aberto = public.round_abnt(cr.valor_aberto - v_valor_estorno, 2),
      status = CASE
        WHEN public.round_abnt(cr.valor_aberto - v_valor_estorno, 2) <= 0.009 THEN 'QUITADO'
        ELSE 'PARCIAL'
      END
    WHERE cr.id = v_cr.id;

    INSERT INTO public.devolucoes (venda_id, valor, forma_pagamento, motivo, operador_id, operacao_id)
    VALUES (p_venda_id, v_valor_estorno, 'PIX', v_motivo, v_uid, v_operacao_id);
  ELSIF v_forma = 'DINHEIRO' THEN
    v_valor_caixa := v_valor_estorno;
    IF v_caixa.status = 'ABERTO' AND v_valor_caixa > 0 THEN
      UPDATE public.caixas c
      SET saldo_atual = public.round_abnt(c.saldo_atual - v_valor_caixa, 2)
      WHERE c.id = v_caixa.id AND (c.saldo_atual - v_valor_caixa) >= 0;
      IF NOT FOUND THEN RAISE EXCEPTION 'DEVOLVER_VENDA_SALDO_CAIXA_INSUFICIENTE'; END IF;
    ELSE
      v_valor_caixa := 0;
    END IF;

    INSERT INTO public.devolucoes (venda_id, valor, forma_pagamento, motivo, operador_id, operacao_id)
    VALUES (p_venda_id, v_valor_estorno, 'DINHEIRO', v_motivo, v_uid, v_operacao_id);
  ELSE
    INSERT INTO public.devolucoes (venda_id, valor, forma_pagamento, motivo, operador_id, operacao_id)
    VALUES (p_venda_id, v_valor_estorno, v_forma, v_motivo, v_uid, v_operacao_id);
  END IF;

  UPDATE public.venda_pos_venda_operacoes
  SET valor_caixa_estornado = v_valor_caixa
  WHERE id = v_operacao_id;

  INSERT INTO public.venda_eventos (
    event_type, sale_id, caixa_id, operador_id, loja_id,
    items, total, total_bruto, forma_pagamento, source, idempotency_key
  ) VALUES (
    'SALE_PARTIAL_RETURN', p_venda_id, v_caixa.id, v_uid, v_caixa.loja_id,
    v_event_items, v_valor_estorno, v_valor_estorno, v_forma, c_source,
    c_source || ':partial_return:' || v_operacao_id::text
  ) ON CONFLICT (idempotency_key) DO NOTHING;

  RETURN QUERY
  SELECT v_operacao_id, p_venda_id, v_tipo, v_valor_estorno, v_valor_caixa, 'CONCLUIDA'::text;
END;
$$;

REVOKE ALL ON FUNCTION public.devolver_ou_trocar_venda(
  uuid, text, text, text, jsonb, numeric, text, uuid, uuid
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.devolver_ou_trocar_venda(
  uuid, text, text, text, jsonb, numeric, text, uuid, uuid
) TO authenticated;

GRANT EXECUTE ON FUNCTION public.devolver_ou_trocar_venda(
  uuid, text, text, text, jsonb, numeric, text, uuid, uuid
) TO service_role;

COMMENT ON FUNCTION public.devolver_ou_trocar_venda IS
  'Devolução parcial ou troca pós-venda: estoque, devolucoes, caixa/contas_receber, kardex e ledger. Idempotente.';

-- ---------------------------------------------------------------------------
-- 6. Patch cancelar_venda: estornar contas_receber
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.cancelar_venda_transacional(
  p_venda_id uuid,
  p_motivo text,
  p_operador_id uuid DEFAULT NULL
)
RETURNS TABLE (venda_id uuid, status_venda text, valor_estornado numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  v_uid uuid := COALESCE(auth.uid(), p_operador_id);
  v_motivo text := NULLIF(btrim(p_motivo), '');
  v_venda record;
  v_caixa record;
  v_item record;
  v_valor_estornado numeric(10,2) := 0;
  v_tem_split boolean := false;
  v_forma_auditoria text;
  c_source constant text := 'gerente_panel';
BEGIN
  PERFORM set_config('lock_timeout', '4s', true);
  IF v_uid IS NULL THEN RAISE EXCEPTION 'CANCELAR_VENDA_AUTH'; END IF;
  IF v_motivo IS NULL THEN RAISE EXCEPTION 'CANCELAR_VENDA_MOTIVO_OBRIGATORIO'; END IF;

  SELECT v.* INTO v_venda FROM public.vendas v WHERE v.id = p_venda_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'CANCELAR_VENDA_NAO_ENCONTRADA'; END IF;
  IF v_venda.status = 'CANCELADA' THEN RAISE EXCEPTION 'CANCELAR_VENDA_JA_CANCELADA'; END IF;

  SELECT c.* INTO v_caixa FROM public.caixas c WHERE c.id = v_venda.caixa_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'CANCELAR_VENDA_CAIXA_NAO_ENCONTRADO'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.usuarios u
    WHERE u.id = v_uid AND u.loja_id = v_caixa.loja_id AND u.perfil IN ('GERENTE', 'DONO', 'ADMIN')
  ) THEN
    RAISE EXCEPTION 'CANCELAR_VENDA_SEM_PERMISSAO';
  END IF;

  -- Estorno contas_receber vinculada
  UPDATE public.contas_receber cr
  SET valor_aberto = 0,
    status = 'CANCELADO'
  WHERE cr.venda_id = p_venda_id AND cr.status IN ('ABERTO', 'PARCIAL');

  SELECT EXISTS (SELECT 1 FROM public.vendas_pagamentos vp WHERE vp.venda_id = p_venda_id LIMIT 1) INTO v_tem_split;

  FOR v_item IN SELECT iv.produto_id, iv.quantidade FROM public.itens_venda iv WHERE iv.venda_id = p_venda_id
  LOOP
    PERFORM 1 FROM public.estoque e
    WHERE e.produto_id = v_item.produto_id AND e.loja_id = v_caixa.loja_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'CANCELAR_VENDA_ESTOQUE_NAO_ENCONTRADO'; END IF;

    UPDATE public.estoque e SET quantidade_atual = e.quantidade_atual + v_item.quantidade,
      version = e.version + 1, updated_at = now()
    WHERE e.produto_id = v_item.produto_id AND e.loja_id = v_caixa.loja_id;

    INSERT INTO public.estoque_reposicoes_cancelamento (venda_id, produto_id, quantidade)
    VALUES (p_venda_id, v_item.produto_id, v_item.quantidade)
    ON CONFLICT (venda_id, produto_id) DO NOTHING;
  END LOOP;

  IF v_tem_split THEN
    SELECT COALESCE(SUM(vp.valor) FILTER (WHERE vp.forma_pagamento = 'DINHEIRO'), 0)::numeric(10,2)
    INTO v_valor_estornado FROM public.vendas_pagamentos vp WHERE vp.venda_id = p_venda_id;
    v_valor_estornado := ROUND(v_valor_estornado, 2);

    INSERT INTO public.devolucoes (venda_id, valor, forma_pagamento, motivo, operador_id)
    SELECT p_venda_id, ROUND(SUM(vp.valor), 2), vp.forma_pagamento, v_motivo, v_uid
    FROM public.vendas_pagamentos vp WHERE vp.venda_id = p_venda_id GROUP BY vp.forma_pagamento;

    IF v_valor_estornado > 0 THEN
      UPDATE public.caixas c SET saldo_atual = ROUND(c.saldo_atual - v_valor_estornado, 2)
      WHERE c.id = v_caixa.id AND (c.saldo_atual - v_valor_estornado) >= 0;
      IF NOT FOUND THEN RAISE EXCEPTION 'CANCELAR_VENDA_SALDO_CAIXA_INSUFICIENTE'; END IF;
    END IF;
    v_forma_auditoria := 'SPLIT';
  ELSIF v_venda.forma_pagamento = 'DINHEIRO' THEN
    v_valor_estornado := ROUND(COALESCE(v_venda.total_liquido, 0), 2);
    INSERT INTO public.devolucoes (venda_id, valor, forma_pagamento, motivo, operador_id)
    VALUES (p_venda_id, v_valor_estornado, 'DINHEIRO', v_motivo, v_uid) ON CONFLICT DO NOTHING;
    UPDATE public.caixas c SET saldo_atual = ROUND(c.saldo_atual - v_valor_estornado, 2)
    WHERE c.id = v_caixa.id AND (c.saldo_atual - v_valor_estornado) >= 0;
    IF NOT FOUND THEN RAISE EXCEPTION 'CANCELAR_VENDA_SALDO_CAIXA_INSUFICIENTE'; END IF;
    v_forma_auditoria := v_venda.forma_pagamento;
  ELSE
    INSERT INTO public.devolucoes (venda_id, valor, forma_pagamento, motivo, operador_id)
    VALUES (p_venda_id, ROUND(COALESCE(v_venda.total_liquido, 0), 2), v_venda.forma_pagamento, v_motivo, v_uid);
    v_valor_estornado := 0;
    v_forma_auditoria := v_venda.forma_pagamento;
  END IF;

  UPDATE public.vendas SET status = 'CANCELADA' WHERE id = p_venda_id;

  INSERT INTO public.vendas_canceladas_auditoria (
    venda_id, caixa_id, operador_id, motivo, forma_pagamento, valor_estornado
  ) VALUES (
    p_venda_id, v_caixa.id, v_uid, v_motivo, v_forma_auditoria,
    CASE WHEN v_tem_split THEN (
      SELECT COALESCE(SUM(vp.valor) FILTER (WHERE vp.forma_pagamento = 'DINHEIRO'), 0)::numeric(10,2)
      FROM public.vendas_pagamentos vp WHERE vp.venda_id = p_venda_id
    ) WHEN v_venda.forma_pagamento = 'DINHEIRO' THEN ROUND(COALESCE(v_venda.total_liquido, 0), 2)
    ELSE 0::numeric(10,2) END
  ) ON CONFLICT (venda_id) DO NOTHING;

  PERFORM public.registrar_venda_evento(
    'SALE_CANCELLED', p_venda_id, c_source, v_caixa.id, v_venda.operador_id, v_caixa.loja_id,
    public.venda_eventos_items_from_sale(p_venda_id),
    COALESCE(v_venda.total_liquido, 0), v_venda.total_bruto, v_venda.forma_pagamento, true
  );

  RETURN QUERY SELECT p_venda_id, 'CANCELADA'::text, v_valor_estornado;
END;
$$;
