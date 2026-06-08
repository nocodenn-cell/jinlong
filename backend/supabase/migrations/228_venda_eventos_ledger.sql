-- 228 — Ledger append-only de vendas (venda_eventos) + helpers idempotentes + backfill.

CREATE TABLE IF NOT EXISTS public.venda_eventos (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type       text NOT NULL
                   CHECK (event_type IN ('SALE_REGISTERED', 'SALE_CANCELLED')),
  sale_id          uuid NOT NULL,
  caixa_id         uuid NOT NULL,
  operador_id      uuid NOT NULL,
  loja_id          uuid NOT NULL,
  items            jsonb NOT NULL DEFAULT '[]'::jsonb,
  total            numeric(10, 2) NOT NULL,
  total_bruto      numeric(10, 2),
  forma_pagamento  text,
  occurred_at      timestamptz NOT NULL DEFAULT now(),
  source           text NOT NULL,
  idempotency_key  text NOT NULL,
  CONSTRAINT venda_eventos_idempotency_key_uniq UNIQUE (idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_venda_eventos_loja_occurred
  ON public.venda_eventos (loja_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_venda_eventos_caixa_occurred
  ON public.venda_eventos (caixa_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_venda_eventos_sale_id
  ON public.venda_eventos (sale_id);

COMMENT ON TABLE public.venda_eventos IS
  'Ledger append-only de vendas. Fonte única de leitura do painel gerente.';

ALTER TABLE public.venda_eventos ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.venda_eventos FROM anon;
GRANT SELECT ON TABLE public.venda_eventos TO authenticated;
GRANT SELECT, INSERT ON TABLE public.venda_eventos TO service_role;

CREATE POLICY venda_eventos_select_loja ON public.venda_eventos
  FOR SELECT TO authenticated
  USING (
    loja_id IN (
      SELECT u.loja_id FROM public.usuarios u WHERE u.id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.id = auth.uid() AND u.perfil = 'ADMIN'
    )
  );

-- Chave global: {source}:{sale_id} ou {source}:cancel:{sale_id}
CREATE OR REPLACE FUNCTION public.venda_evento_idempotency_key(
  p_source   text,
  p_sale_id  uuid,
  p_cancelled boolean DEFAULT false
)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_cancelled THEN btrim(p_source) || ':cancel:' || p_sale_id::text
    ELSE btrim(p_source) || ':' || p_sale_id::text
  END;
$$;

CREATE OR REPLACE FUNCTION public.venda_eventos_items_from_sale(p_sale_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'produtoId', iv.produto_id,
        'nome', p.nome,
        'quantidade', iv.quantidade,
        'precoUnitario', iv.preco_unitario,
        'total', public.round_abnt(iv.preco_unitario * iv.quantidade, 2)
      )
      ORDER BY iv.id
    ),
    '[]'::jsonb
  )
  FROM public.itens_venda iv
  JOIN public.produtos p ON p.id = iv.produto_id
  WHERE iv.venda_id = p_sale_id;
$$;

CREATE OR REPLACE FUNCTION public.venda_eventos_items_from_payload(p_itens jsonb)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'produtoId', (elem->>'produto_id')::uuid,
        'nome', p.nome,
        'quantidade', (elem->>'quantidade')::numeric,
        'precoUnitario', (elem->>'preco_unitario')::numeric,
        'total', public.round_abnt(
          COALESCE((elem->>'preco_unitario')::numeric, 0)
          * COALESCE((elem->>'quantidade')::numeric, 0),
          2
        )
      )
      ORDER BY elem.ord
    ),
    '[]'::jsonb
  )
  FROM jsonb_array_elements(COALESCE(p_itens, '[]'::jsonb))
    WITH ORDINALITY AS t(elem, ord)
  LEFT JOIN public.produtos p ON p.id = (elem->>'produto_id')::uuid;
$$;

CREATE OR REPLACE FUNCTION public.registrar_venda_evento(
  p_event_type       text,
  p_sale_id          uuid,
  p_source           text,
  p_caixa_id         uuid,
  p_operador_id      uuid,
  p_loja_id          uuid,
  p_items            jsonb,
  p_total            numeric,
  p_total_bruto      numeric,
  p_forma_pagamento  text,
  p_cancelled        boolean DEFAULT false
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_idempotency_key text;
  v_event_id        uuid;
BEGIN
  IF p_source IS NULL OR btrim(p_source) = '' THEN
    RAISE EXCEPTION 'VENDA_EVENTO_SOURCE_OBRIGATORIO';
  END IF;

  v_idempotency_key := public.venda_evento_idempotency_key(p_source, p_sale_id, p_cancelled);

  INSERT INTO public.venda_eventos (
    event_type,
    sale_id,
    caixa_id,
    operador_id,
    loja_id,
    items,
    total,
    total_bruto,
    forma_pagamento,
    source,
    idempotency_key,
    occurred_at
  )
  VALUES (
    p_event_type,
    p_sale_id,
    p_caixa_id,
    p_operador_id,
    p_loja_id,
    COALESCE(p_items, '[]'::jsonb),
    public.round_abnt(p_total, 2),
    CASE WHEN p_total_bruto IS NULL THEN NULL ELSE public.round_abnt(p_total_bruto, 2) END,
    p_forma_pagamento,
    p_source,
    v_idempotency_key,
    now()
  )
  ON CONFLICT (idempotency_key) DO NOTHING
  RETURNING id INTO v_event_id;

  IF v_event_id IS NULL THEN
    SELECT e.id INTO v_event_id
    FROM public.venda_eventos e
    WHERE e.idempotency_key = v_idempotency_key;
  END IF;

  RETURN v_event_id;
END;
$$;

REVOKE ALL ON FUNCTION public.registrar_venda_evento(
  text, uuid, text, uuid, uuid, uuid, jsonb, numeric, numeric, text, boolean
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.registrar_venda_evento(
  text, uuid, text, uuid, uuid, uuid, jsonb, numeric, numeric, text, boolean
) TO service_role;

CREATE OR REPLACE FUNCTION public.ensure_venda_evento_registrado(
  p_sale_id  uuid,
  p_source   text DEFAULT 'backfill'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_venda record;
BEGIN
  SELECT v.*, c.loja_id AS caixa_loja_id
  INTO v_venda
  FROM public.vendas v
  JOIN public.caixas c ON c.id = v.caixa_id
  WHERE v.id = p_sale_id;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  RETURN public.registrar_venda_evento(
    'SALE_REGISTERED',
    p_sale_id,
    p_source,
    v_venda.caixa_id,
    v_venda.operador_id,
    v_venda.caixa_loja_id,
    public.venda_eventos_items_from_sale(p_sale_id),
    v_venda.total_liquido,
    v_venda.total_bruto,
    v_venda.forma_pagamento,
    false
  );
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_venda_evento_registrado(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ensure_venda_evento_registrado(uuid, text) TO service_role;

-- Backfill idempotente (pode rodar N vezes).
INSERT INTO public.venda_eventos (
  event_type, sale_id, caixa_id, operador_id, loja_id,
  items, total, total_bruto, forma_pagamento, source, idempotency_key, occurred_at
)
SELECT
  'SALE_REGISTERED',
  v.id,
  v.caixa_id,
  v.operador_id,
  c.loja_id,
  public.venda_eventos_items_from_sale(v.id),
  v.total_liquido,
  v.total_bruto,
  v.forma_pagamento,
  'backfill',
  public.venda_evento_idempotency_key('backfill', v.id, false),
  COALESCE(v.data, now())
FROM public.vendas v
JOIN public.caixas c ON c.id = v.caixa_id
WHERE v.status = 'CONCLUIDA'
ON CONFLICT (idempotency_key) DO NOTHING;

INSERT INTO public.venda_eventos (
  event_type, sale_id, caixa_id, operador_id, loja_id,
  items, total, total_bruto, forma_pagamento, source, idempotency_key, occurred_at
)
SELECT
  'SALE_CANCELLED',
  v.id,
  v.caixa_id,
  v.operador_id,
  c.loja_id,
  public.venda_eventos_items_from_sale(v.id),
  v.total_liquido,
  v.total_bruto,
  v.forma_pagamento,
  'backfill',
  public.venda_evento_idempotency_key('backfill', v.id, true),
  COALESCE(v.data, now())
FROM public.vendas v
JOIN public.caixas c ON c.id = v.caixa_id
WHERE v.status = 'CANCELADA'
ON CONFLICT (idempotency_key) DO NOTHING;
