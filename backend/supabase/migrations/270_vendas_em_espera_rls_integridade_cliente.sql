-- 270 — Fase 5, Entrega 3+4: fecha dívida técnica de `vendas_em_espera` mapeada em
-- pdv-importados/app/caixa/TODO_auditoria_255.md e docs/TECH_DEBT_VENDA_ESPERA_CLIENTE.md.
--
-- Escopo (aditivo, não altera o golden-flow de finalização de venda):
--   1. RLS SELECT: remove o ramo que permitia a QUALQUER usuário da loja ler
--      vendas em espera de outros operadores; mantém apenas dono da venda +
--      ADMIN/DONO/GERENTE da mesma loja.
--   2. WITH CHECK na policy de UPDATE (faltava; permitia trocar operador_id/loja_id
--      via UPDATE sem revalidação).
--   3. UNIQUE (operador_id, numero_local) WHERE status = 'EM_ESPERA' — evita
--      dois cartões "#N" simultâneos para o mesmo operador.
--   4. colocar_venda_em_espera valida que p_caixa_id (quando informado) pertence
--      ao operador autenticado.
--   5. retomar_venda_em_espera marca a origem como CONVERTIDA quando a venda
--      resultante é finalizada — nova RPC marcar_venda_em_espera_convertida,
--      chamada pelo caller autorizado da finalização (caixaVendas.impl.ts) em
--      best-effort, sem acoplar ao contrato v4.
--   6. listar_vendas_em_espera passa a incluir cliente_id + nome_cliente (join),
--      e colocar_venda_em_espera/retomar_venda_em_espera já aceitavam/retornavam
--      cliente_id — só faltava o TypeScript parar de descartar.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1+2. RLS: SELECT restrito + WITH CHECK em UPDATE
-- ─────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS vendas_em_espera_select ON public.vendas_em_espera;

CREATE POLICY vendas_em_espera_select ON public.vendas_em_espera
  FOR SELECT TO authenticated
  USING (
    operador_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.id = auth.uid()
        AND u.perfil IN ('ADMIN', 'DONO', 'GERENTE')
        AND u.loja_id = vendas_em_espera.loja_id
    )
  );

DROP POLICY IF EXISTS vendas_em_espera_update ON public.vendas_em_espera;

CREATE POLICY vendas_em_espera_update ON public.vendas_em_espera
  FOR UPDATE TO authenticated
  USING (
    operador_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.id = auth.uid()
        AND u.perfil IN ('ADMIN', 'DONO', 'GERENTE')
        AND u.loja_id = vendas_em_espera.loja_id
    )
  )
  WITH CHECK (
    operador_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.id = auth.uid()
        AND u.perfil IN ('ADMIN', 'DONO', 'GERENTE')
        AND u.loja_id = vendas_em_espera.loja_id
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Unicidade de numero_local por operador enquanto EM_ESPERA
-- ─────────────────────────────────────────────────────────────────────────────

CREATE UNIQUE INDEX IF NOT EXISTS uq_vendas_em_espera_operador_numero_ativo
  ON public.vendas_em_espera (operador_id, numero_local)
  WHERE status = 'EM_ESPERA';

-- ─────────────────────────────────────────────────────────────────────────────
-- 4+6. colocar_venda_em_espera: valida caixa do operador + já persiste cliente_id
-- (cliente_id já era aceito; a validação de caixa é o que faltava)
-- ─────────────────────────────────────────────────────────────────────────────

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

  IF p_caixa_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.caixas c
    WHERE c.id = p_caixa_id
      AND c.operador_id = v_uid
      AND c.loja_id = v_loja
  ) THEN
    RAISE EXCEPTION 'caixa_invalido' USING ERRCODE = '42501';
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

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. listar_vendas_em_espera: inclui cliente_id + nome_cliente
-- ─────────────────────────────────────────────────────────────────────────────

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
          'atualizada_em', v.atualizada_em,
          'cliente_id', v.cliente_id,
          'nome_cliente', c.nome
        )
        ORDER BY v.atualizada_em DESC
      )
      FROM public.vendas_em_espera v
      LEFT JOIN public.clientes c ON c.id = v.cliente_id
      WHERE v.operador_id = v_uid AND v.status = 'EM_ESPERA'
    ),
    '[]'::jsonb
  );
END;
$$;

REVOKE ALL ON FUNCTION public.listar_vendas_em_espera() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.listar_vendas_em_espera() TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Marcar CONVERTIDA quando a venda retomada é finalizada
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.marcar_venda_em_espera_convertida(p_id uuid)
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
  WHERE id = p_id AND status = 'RETOMADA'
  FOR UPDATE;

  -- Idempotente/best-effort: se não está mais em RETOMADA (já convertida, ou
  -- nunca existiu), não é erro — o caller não deve falhar a venda por causa disso.
  IF NOT FOUND THEN
    RETURN jsonb_build_object('id', p_id, 'status', 'NOOP');
  END IF;

  IF v_row.operador_id IS DISTINCT FROM v_uid THEN
    RAISE EXCEPTION 'permissao_negada' USING ERRCODE = '42501';
  END IF;

  UPDATE public.vendas_em_espera
  SET status = 'CONVERTIDA', atualizada_em = now()
  WHERE id = p_id;

  RETURN jsonb_build_object('id', p_id, 'status', 'CONVERTIDA');
END;
$$;

REVOKE ALL ON FUNCTION public.marcar_venda_em_espera_convertida(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.marcar_venda_em_espera_convertida(uuid) TO authenticated;
