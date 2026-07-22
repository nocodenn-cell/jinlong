-- 255 — Vendas em espera (parked sales) + consulta rápida auxiliar.
-- Isolado do núcleo transacional (não toca finalizar_venda_* / estoque / caixas).

CREATE TABLE IF NOT EXISTS public.vendas_em_espera (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  loja_id uuid NOT NULL REFERENCES public.lojas (id),
  operador_id uuid NOT NULL REFERENCES public.usuarios (id),
  caixa_id uuid REFERENCES public.caixas (id),
  numero_local integer NOT NULL,
  rotulo text,
  itens jsonb NOT NULL DEFAULT '[]'::jsonb,
  totais jsonb NOT NULL DEFAULT '{}'::jsonb,
  cliente_id uuid,
  desconto_gerente_percentual numeric(5,2),
  desconto_gerente_token text,
  status text NOT NULL DEFAULT 'EM_ESPERA'
    CHECK (status IN ('EM_ESPERA', 'RETOMADA', 'CONVERTIDA', 'DESCARTADA')),
  criada_em timestamptz NOT NULL DEFAULT now(),
  atualizada_em timestamptz NOT NULL DEFAULT now(),
  descartada_motivo text
);

CREATE INDEX IF NOT EXISTS idx_vendas_em_espera_loja_status
  ON public.vendas_em_espera (loja_id, status, atualizada_em DESC);

CREATE INDEX IF NOT EXISTS idx_vendas_em_espera_operador_status
  ON public.vendas_em_espera (operador_id, status, atualizada_em DESC);

COMMENT ON TABLE public.vendas_em_espera IS
  'Vendas pausadas no PDV (pré-finalização). Não reserva estoque.';

ALTER TABLE public.vendas_em_espera ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.vendas_em_espera FROM anon;
GRANT SELECT, INSERT, UPDATE ON TABLE public.vendas_em_espera TO authenticated;
GRANT ALL ON TABLE public.vendas_em_espera TO service_role;

CREATE POLICY vendas_em_espera_select ON public.vendas_em_espera
  FOR SELECT TO authenticated
  USING (
    operador_id = auth.uid()
    OR loja_id IN (SELECT u.loja_id FROM public.usuarios u WHERE u.id = auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.id = auth.uid() AND u.perfil IN ('ADMIN', 'DONO', 'GERENTE')
    )
  );

CREATE POLICY vendas_em_espera_insert ON public.vendas_em_espera
  FOR INSERT TO authenticated
  WITH CHECK (operador_id = auth.uid());

CREATE POLICY vendas_em_espera_update ON public.vendas_em_espera
  FOR UPDATE TO authenticated
  USING (
    operador_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.id = auth.uid() AND u.perfil IN ('ADMIN', 'DONO', 'GERENTE')
    )
  );

CREATE OR REPLACE FUNCTION public.proximo_numero_venda_em_espera(p_operador_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(MAX(numero_local), 0) + 1
  FROM public.vendas_em_espera
  WHERE operador_id = p_operador_id
    AND status = 'EM_ESPERA';
$$;

REVOKE ALL ON FUNCTION public.proximo_numero_venda_em_espera(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.proximo_numero_venda_em_espera(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.proximo_numero_venda_em_espera(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.colocar_venda_em_espera(
  p_itens jsonb,
  p_totais jsonb,
  p_caixa_id uuid DEFAULT NULL,
  p_rotulo text DEFAULT NULL,
  p_cliente_id uuid DEFAULT NULL,
  p_desconto_gerente_percentual numeric DEFAULT NULL,
  p_desconto_gerente_token text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_loja uuid;
  v_num integer;
  v_id uuid;
  v_itens_count integer;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'sessao_expirada' USING ERRCODE = '42501';
  END IF;

  v_itens_count := jsonb_array_length(COALESCE(p_itens, '[]'::jsonb));
  IF v_itens_count < 1 THEN
    RAISE EXCEPTION 'carrinho_vazio' USING ERRCODE = '22023';
  END IF;

  SELECT u.loja_id INTO v_loja FROM public.usuarios u WHERE u.id = v_uid;
  IF v_loja IS NULL THEN
    RAISE EXCEPTION 'loja_obrigatoria' USING ERRCODE = '22023';
  END IF;

  v_num := public.proximo_numero_venda_em_espera(v_uid);

  INSERT INTO public.vendas_em_espera (
    loja_id, operador_id, caixa_id, numero_local, rotulo, itens, totais,
    cliente_id, desconto_gerente_percentual, desconto_gerente_token, status
  ) VALUES (
    v_loja, v_uid, p_caixa_id, v_num, NULLIF(btrim(COALESCE(p_rotulo, '')), ''),
    p_itens, COALESCE(p_totais, '{}'::jsonb),
    p_cliente_id, p_desconto_gerente_percentual, p_desconto_gerente_token, 'EM_ESPERA'
  )
  RETURNING id INTO v_id;

  RETURN jsonb_build_object(
    'id', v_id,
    'numero_local', v_num,
    'status', 'EM_ESPERA'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.colocar_venda_em_espera(jsonb, jsonb, uuid, text, uuid, numeric, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.colocar_venda_em_espera(jsonb, jsonb, uuid, text, uuid, numeric, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.listar_vendas_em_espera()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'sessao_expirada' USING ERRCODE = '42501';
  END IF;

  RETURN COALESCE(
    (
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', v.id,
          'numero_local', v.numero_local,
          'rotulo', v.rotulo,
          'totais', v.totais,
          'qtd_itens', jsonb_array_length(v.itens),
          'criada_em', v.criada_em,
          'atualizada_em', v.atualizada_em
        )
        ORDER BY v.atualizada_em DESC
      )
      FROM public.vendas_em_espera v
      WHERE v.operador_id = v_uid AND v.status = 'EM_ESPERA'
    ),
    '[]'::jsonb
  );
END;
$$;

REVOKE ALL ON FUNCTION public.listar_vendas_em_espera() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.listar_vendas_em_espera() TO authenticated;

CREATE OR REPLACE FUNCTION public.retomar_venda_em_espera(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_row public.vendas_em_espera%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'sessao_expirada' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_row
  FROM public.vendas_em_espera
  WHERE id = p_id AND status = 'EM_ESPERA'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'venda_em_espera_nao_encontrada' USING ERRCODE = 'P0002';
  END IF;

  IF v_row.operador_id IS DISTINCT FROM v_uid THEN
    RAISE EXCEPTION 'permissao_negada' USING ERRCODE = '42501';
  END IF;

  UPDATE public.vendas_em_espera
  SET status = 'RETOMADA', atualizada_em = now()
  WHERE id = p_id;

  RETURN jsonb_build_object(
    'id', v_row.id,
    'numero_local', v_row.numero_local,
    'rotulo', v_row.rotulo,
    'itens', v_row.itens,
    'totais', v_row.totais,
    'cliente_id', v_row.cliente_id,
    'desconto_gerente_percentual', v_row.desconto_gerente_percentual,
    'desconto_gerente_token', v_row.desconto_gerente_token
  );
END;
$$;

REVOKE ALL ON FUNCTION public.retomar_venda_em_espera(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.retomar_venda_em_espera(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.descartar_venda_em_espera(
  p_id uuid,
  p_motivo text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_row public.vendas_em_espera%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'sessao_expirada' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_row
  FROM public.vendas_em_espera
  WHERE id = p_id AND status = 'EM_ESPERA'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'venda_em_espera_nao_encontrada' USING ERRCODE = 'P0002';
  END IF;

  IF v_row.operador_id IS DISTINCT FROM v_uid THEN
    RAISE EXCEPTION 'permissao_negada' USING ERRCODE = '42501';
  END IF;

  UPDATE public.vendas_em_espera
  SET
    status = 'DESCARTADA',
    descartada_motivo = NULLIF(btrim(COALESCE(p_motivo, '')), ''),
    atualizada_em = now()
  WHERE id = p_id;

  RETURN jsonb_build_object('id', p_id, 'status', 'DESCARTADA');
END;
$$;

REVOKE ALL ON FUNCTION public.descartar_venda_em_espera(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.descartar_venda_em_espera(uuid, text) TO authenticated;
