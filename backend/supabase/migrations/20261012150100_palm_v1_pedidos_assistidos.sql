-- PALM V1 — pedidos assistidos em vendas_em_espera.
--
-- Origem CAIXA preserva a espera tradicional. Origem PALM é o pedido do
-- vendedor: não reserva estoque, não baixa saldo e não finaliza venda.
-- A baixa continua só em finalizar_venda_transacional_canonica_v4.
--
-- Perfil: não cria VENDEDOR. OPERADOR, GERENTE, DONO e ADMIN da loja da
-- sessão enviam e assumem. Decisão de um perfil novo fica fora desta migration.
--
-- Rollback manual:
--   DROP FUNCTION public.enviar_pedido_palm(uuid, jsonb, uuid);
--   DROP FUNCTION public.listar_pedidos_palm_disponiveis();
--   DROP FUNCTION public.listar_meus_pedidos_palm();
--   DROP FUNCTION public.assumir_pedido_palm(uuid);
--   DROP FUNCTION public.cancelar_pedido_palm(uuid, text);
--   DROP TABLE public.vendas_em_espera_eventos;
--   Recriar retomar/devolver/descartar/converter/listar/colocar a partir de
--   20260809120659 e 255. Dropar colunas origem/vendedor_id/client_request_id/
--   assumido_por/assumido_em/precos_snapshot só com a tabela sem dependência.

BEGIN;

ALTER TABLE public.vendas_em_espera
  ADD COLUMN IF NOT EXISTS origem text NOT NULL DEFAULT 'CAIXA';

ALTER TABLE public.vendas_em_espera
  DROP CONSTRAINT IF EXISTS vendas_em_espera_origem_check;

ALTER TABLE public.vendas_em_espera
  ADD CONSTRAINT vendas_em_espera_origem_check
  CHECK (origem IN ('CAIXA', 'PALM'));

ALTER TABLE public.vendas_em_espera
  ADD COLUMN IF NOT EXISTS vendedor_id uuid REFERENCES public.usuarios (id);

ALTER TABLE public.vendas_em_espera
  ADD COLUMN IF NOT EXISTS client_request_id uuid;

ALTER TABLE public.vendas_em_espera
  ADD COLUMN IF NOT EXISTS assumido_por uuid REFERENCES public.usuarios (id);

ALTER TABLE public.vendas_em_espera
  ADD COLUMN IF NOT EXISTS assumido_em timestamptz;

ALTER TABLE public.vendas_em_espera
  ADD COLUMN IF NOT EXISTS precos_snapshot jsonb;

CREATE UNIQUE INDEX IF NOT EXISTS uq_vendas_em_espera_client_request
  ON public.vendas_em_espera (client_request_id)
  WHERE client_request_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_vendas_em_espera_palm_disponivel
  ON public.vendas_em_espera (loja_id, atualizada_em DESC)
  WHERE origem = 'PALM' AND status = 'EM_ESPERA';

CREATE TABLE IF NOT EXISTS public.vendas_em_espera_eventos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venda_em_espera_id uuid NOT NULL REFERENCES public.vendas_em_espera (id),
  loja_id uuid NOT NULL,
  ator_id uuid,
  tipo text NOT NULL CHECK (tipo IN (
    'ENVIADO', 'ASSUMIDO', 'REVALIDADO', 'PRECO_ALTERADO',
    'ESTOQUE_BLOQUEADO', 'CANCELADO', 'CONVERTIDO', 'DEVOLVIDO'
  )),
  detalhe jsonb NOT NULL DEFAULT '{}'::jsonb,
  criado_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vendas_em_espera_eventos_pedido
  ON public.vendas_em_espera_eventos (venda_em_espera_id, criado_em DESC);

ALTER TABLE public.vendas_em_espera_eventos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendas_em_espera_eventos FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.vendas_em_espera_eventos FROM anon, authenticated;
GRANT SELECT ON TABLE public.vendas_em_espera_eventos TO authenticated;
GRANT ALL ON TABLE public.vendas_em_espera_eventos TO service_role;

DROP POLICY IF EXISTS vendas_em_espera_eventos_select ON public.vendas_em_espera_eventos;
CREATE POLICY vendas_em_espera_eventos_select ON public.vendas_em_espera_eventos
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.usuarios u
      WHERE u.id = auth.uid()
        AND COALESCE(u.ativo, false)
        AND u.loja_id = vendas_em_espera_eventos.loja_id
        AND u.perfil IN ('OPERADOR', 'GERENTE', 'DONO', 'ADMIN')
        AND (
          u.perfil IN ('GERENTE', 'DONO', 'ADMIN')
          OR vendas_em_espera_eventos.ator_id = u.id
          OR EXISTS (
            SELECT 1
            FROM public.vendas_em_espera v
            WHERE v.id = vendas_em_espera_eventos.venda_em_espera_id
              AND (v.vendedor_id = u.id OR v.assumido_por = u.id OR v.operador_id = u.id)
          )
        )
    )
  );

-- Operador da loja enxerga pedidos PALM disponíveis; espera tradicional
-- continua só do próprio operador. Gerência vê a própria loja, nunca outra.
DROP POLICY IF EXISTS vendas_em_espera_select ON public.vendas_em_espera;
CREATE POLICY vendas_em_espera_select ON public.vendas_em_espera
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.usuarios u
      WHERE u.id = auth.uid()
        AND COALESCE(u.ativo, false)
        AND u.loja_id = vendas_em_espera.loja_id
        AND u.perfil IN ('OPERADOR', 'GERENTE', 'DONO', 'ADMIN')
        AND (
          u.perfil IN ('GERENTE', 'DONO', 'ADMIN')
          OR vendas_em_espera.operador_id = u.id
          OR vendas_em_espera.vendedor_id = u.id
          OR vendas_em_espera.assumido_por = u.id
          OR (vendas_em_espera.origem = 'PALM' AND vendas_em_espera.status = 'EM_ESPERA')
        )
    )
  );

DROP POLICY IF EXISTS vendas_em_espera_update ON public.vendas_em_espera;
CREATE POLICY vendas_em_espera_update ON public.vendas_em_espera
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.usuarios u
      WHERE u.id = auth.uid()
        AND COALESCE(u.ativo, false)
        AND u.loja_id = vendas_em_espera.loja_id
        AND (
          u.perfil IN ('GERENTE', 'DONO', 'ADMIN')
          OR vendas_em_espera.operador_id = u.id
          OR vendas_em_espera.vendedor_id = u.id
          OR vendas_em_espera.assumido_por = u.id
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.usuarios u
      WHERE u.id = auth.uid()
        AND u.loja_id = vendas_em_espera.loja_id
    )
  );

CREATE OR REPLACE FUNCTION internal.palm_ator()
RETURNS TABLE (uid uuid, loja_id uuid, perfil text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_loja uuid;
  v_perfil text;
  v_ativo boolean;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'sessao_expirada' USING ERRCODE = '42501';
  END IF;

  SELECT u.loja_id, u.perfil, COALESCE(u.ativo, false)
    INTO v_loja, v_perfil, v_ativo
  FROM public.usuarios u
  WHERE u.id = v_uid;

  IF NOT FOUND OR NOT v_ativo OR v_loja IS NULL THEN
    RAISE EXCEPTION 'nao_autorizado' USING ERRCODE = '42501';
  END IF;

  IF v_perfil NOT IN ('OPERADOR', 'GERENTE', 'DONO', 'ADMIN') THEN
    RAISE EXCEPTION 'perfil_nao_autorizado' USING ERRCODE = '42501';
  END IF;

  uid := v_uid;
  loja_id := v_loja;
  perfil := v_perfil;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION internal.palm_ator() FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION internal.palm_registrar_evento(
  p_pedido uuid,
  p_loja uuid,
  p_ator uuid,
  p_tipo text,
  p_detalhe jsonb
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  INSERT INTO public.vendas_em_espera_eventos (venda_em_espera_id, loja_id, ator_id, tipo, detalhe)
  VALUES (p_pedido, p_loja, p_ator, p_tipo, COALESCE(p_detalhe, '{}'::jsonb));
$$;

REVOKE ALL ON FUNCTION internal.palm_registrar_evento(uuid, uuid, uuid, text, jsonb)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION internal.palm_canon_itens(p_itens jsonb)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, public
AS $$
  SELECT COALESCE(jsonb_agg(s.item ORDER BY s.item->>'produto_id'), '[]'::jsonb)
  FROM (
    SELECT jsonb_build_object(
      'produto_id', t.produto_id::text,
      'quantidade', SUM(t.quantidade)
    ) AS item
    FROM (
      SELECT (e->>'produto_id')::uuid AS produto_id,
             (e->>'quantidade')::integer AS quantidade
      FROM jsonb_array_elements(COALESCE(p_itens, '[]'::jsonb)) e
    ) t
    GROUP BY t.produto_id
  ) s;
$$;

REVOKE ALL ON FUNCTION internal.palm_canon_itens(jsonb) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION internal.palm_preco_mudou(p_antes jsonb, p_depois jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM jsonb_array_elements(COALESCE(p_antes, '[]'::jsonb)) a
    FULL JOIN jsonb_array_elements(COALESCE(p_depois, '[]'::jsonb)) d
      ON a->>'produto_id' = d->>'produto_id'
    WHERE (a->>'preco_unitario') IS DISTINCT FROM (d->>'preco_unitario')
       OR (a->>'quantidade') IS DISTINCT FROM (d->>'quantidade')
  );
$$;

REVOKE ALL ON FUNCTION internal.palm_preco_mudou(jsonb, jsonb) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION internal.palm_preparar_itens(p_loja uuid, p_itens jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_el jsonb;
  v_pid uuid;
  v_qtd integer;
  v_agg jsonb := '{}'::jsonb;
  v_key text;
  v_q integer;
  v_nome text;
  v_codigo text;
  v_desc text;
  v_imagem text;
  v_local text;
  v_calc jsonb;
  v_estoque numeric;
  v_preco numeric;
  v_linhas jsonb := '[]'::jsonb;
  v_total numeric := 0;
BEGIN
  IF jsonb_typeof(p_itens) IS DISTINCT FROM 'array' OR jsonb_array_length(p_itens) < 1 THEN
    RAISE EXCEPTION 'carrinho_vazio' USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(p_itens) > 50 THEN
    RAISE EXCEPTION 'quantidade_invalida' USING ERRCODE = '22023';
  END IF;

  FOR v_el IN SELECT value FROM jsonb_array_elements(p_itens)
  LOOP
    BEGIN
      v_pid := (v_el->>'produto_id')::uuid;
      v_qtd := (v_el->>'quantidade')::integer;
    EXCEPTION WHEN others THEN
      RAISE EXCEPTION 'quantidade_invalida' USING ERRCODE = '22023';
    END;
    IF v_pid IS NULL OR v_qtd IS NULL OR v_qtd < 1 OR v_qtd > 99999 THEN
      RAISE EXCEPTION 'quantidade_invalida' USING ERRCODE = '22023';
    END IF;
    v_key := v_pid::text;
    v_q := COALESCE((v_agg->>v_key)::integer, 0) + v_qtd;
    v_agg := jsonb_set(v_agg, ARRAY[v_key], to_jsonb(v_q), true);
  END LOOP;

  FOR v_key, v_q IN SELECT key, value::integer FROM jsonb_each_text(v_agg)
  LOOP
    v_pid := v_key::uuid;
    SELECT p.nome,
           COALESCE(p.codigo_barras, p.codigo_interno),
           p.observacao,
           p.imagem_url,
           p.localizacao_prateleira
      INTO v_nome, v_codigo, v_desc, v_imagem, v_local
    FROM public.produtos p
    WHERE p.id = v_pid AND p.ativo = true AND p.loja_id = p_loja;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'produto_nao_encontrado' USING ERRCODE = 'P0002';
    END IF;

    v_calc := public.calcular_preco_produto(v_pid, v_q, p_loja);
    IF v_calc->>'erro' IS NOT NULL THEN
      RAISE EXCEPTION '%', v_calc->>'erro' USING ERRCODE = '22023';
    END IF;

    v_preco := (v_calc->>'preco')::numeric;
    SELECT e.quantidade_atual INTO v_estoque
    FROM public.estoque e
    WHERE e.produto_id = v_pid AND e.loja_id = p_loja;

    IF v_estoque IS NULL OR v_estoque < v_q THEN
      RETURN jsonb_build_object('erro', 'estoque_insuficiente', 'produto_id', v_pid);
    END IF;

    v_total := round(v_total + (v_preco * v_q), 2);
    v_linhas := v_linhas || jsonb_build_array(jsonb_build_object(
      'produto_id', v_pid,
      'quantidade', v_q,
      'nome', v_nome,
      'codigo', v_codigo,
      'descricao', v_desc,
      'imagem', v_imagem,
      'localizacao', v_local,
      'preco_unitario', v_preco,
      'tipo', v_calc->>'tipo',
      'quantidade_minima', v_calc->'quantidade_minima',
      'estoque_disponivel', v_estoque
    ));
  END LOOP;

  RETURN jsonb_build_object('itens', v_linhas, 'total', v_total);
END;
$$;

REVOKE ALL ON FUNCTION internal.palm_preparar_itens(uuid, jsonb) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION internal.palm_cliente_da_loja(p_cliente uuid, p_loja uuid)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF p_cliente IS NULL THEN
    RETURN;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.clientes c
    WHERE c.id = p_cliente AND c.loja_id = p_loja
  ) THEN
    RAISE EXCEPTION 'cliente_invalido' USING ERRCODE = '22023';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION internal.palm_cliente_da_loja(uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.enviar_pedido_palm(
  p_client_request_id uuid,
  p_itens jsonb,
  p_cliente_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_ator record;
  v_exist public.vendas_em_espera%ROWTYPE;
  v_prep jsonb;
  v_id uuid;
  v_num integer;
  v_total numeric;
BEGIN
  IF p_client_request_id IS NULL THEN
    RAISE EXCEPTION 'quantidade_invalida' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_ator FROM internal.palm_ator();
  PERFORM internal.palm_cliente_da_loja(p_cliente_id, v_ator.loja_id);
  PERFORM pg_advisory_xact_lock(hashtextextended(p_client_request_id::text, 0));

  SELECT * INTO v_exist
  FROM public.vendas_em_espera
  WHERE client_request_id = p_client_request_id
  FOR UPDATE;

  IF FOUND THEN
    IF v_exist.vendedor_id IS DISTINCT FROM v_ator.uid
       OR v_exist.loja_id IS DISTINCT FROM v_ator.loja_id THEN
      RAISE EXCEPTION 'pedido_idempotencia_conflito' USING ERRCODE = '23505';
    END IF;
    IF internal.palm_canon_itens(v_exist.itens) IS DISTINCT FROM internal.palm_canon_itens(p_itens) THEN
      RAISE EXCEPTION 'pedido_idempotencia_payload_divergente' USING ERRCODE = '22023';
    END IF;
    RETURN jsonb_build_object(
      'id', v_exist.id,
      'numero_local', v_exist.numero_local,
      'status', v_exist.status,
      'idempotente', true
    );
  END IF;

  v_prep := internal.palm_preparar_itens(v_ator.loja_id, p_itens);
  IF v_prep ? 'erro' THEN
    RAISE EXCEPTION '%', v_prep->>'erro' USING ERRCODE = 'P0001';
  END IF;

  v_num := public.proximo_numero_venda_em_espera(v_ator.uid);
  v_total := (v_prep->>'total')::numeric;

  INSERT INTO public.vendas_em_espera (
    loja_id, operador_id, vendedor_id, numero_local, rotulo, itens, totais,
    cliente_id, status, origem, client_request_id, precos_snapshot
  ) VALUES (
    v_ator.loja_id, v_ator.uid, v_ator.uid, v_num, 'PALM',
    v_prep->'itens',
    jsonb_build_object('totalBruto', v_total, 'totalDesconto', 0, 'totalLiquido', v_total),
    p_cliente_id, 'EM_ESPERA', 'PALM', p_client_request_id, v_prep->'itens'
  )
  RETURNING id INTO v_id;

  PERFORM internal.palm_registrar_evento(
    v_id, v_ator.loja_id, v_ator.uid, 'ENVIADO',
    jsonb_build_object('total', v_total, 'client_request_id', p_client_request_id)
  );

  RETURN jsonb_build_object(
    'id', v_id,
    'numero_local', v_num,
    'status', 'EM_ESPERA',
    'idempotente', false,
    'total', v_total
  );
END;
$$;

REVOKE ALL ON FUNCTION public.enviar_pedido_palm(uuid, jsonb, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.enviar_pedido_palm(uuid, jsonb, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.listar_pedidos_palm_disponiveis()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_ator record;
BEGIN
  SELECT * INTO v_ator FROM internal.palm_ator();
  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'id', v.id,
      'numero_local', v.numero_local,
      'qtd_itens', jsonb_array_length(v.itens),
      'total', COALESCE(v.totais->>'totalLiquido', '0'),
      'criada_em', v.criada_em,
      'vendedor_id', v.vendedor_id,
      'vendedor_nome', u.nome
    ) ORDER BY v.criada_em)
    FROM public.vendas_em_espera v
    LEFT JOIN public.usuarios u ON u.id = v.vendedor_id
    WHERE v.loja_id = v_ator.loja_id
      AND v.origem = 'PALM'
      AND v.status = 'EM_ESPERA'
  ), '[]'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.listar_pedidos_palm_disponiveis() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.listar_pedidos_palm_disponiveis() TO authenticated;

CREATE OR REPLACE FUNCTION public.listar_meus_pedidos_palm()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_ator record;
BEGIN
  SELECT * INTO v_ator FROM internal.palm_ator();
  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'id', v.id,
      'numero_local', v.numero_local,
      'status', v.status,
      'total', COALESCE(v.totais->>'totalLiquido', '0'),
      'criada_em', v.criada_em,
      'qtd_itens', jsonb_array_length(v.itens)
    ) ORDER BY v.atualizada_em DESC)
    FROM (
      SELECT *
      FROM public.vendas_em_espera v
      WHERE v.vendedor_id = v_ator.uid
        AND v.origem = 'PALM'
        AND v.loja_id = v_ator.loja_id
      ORDER BY v.atualizada_em DESC
      LIMIT 30
    ) v
  ), '[]'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.listar_meus_pedidos_palm() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.listar_meus_pedidos_palm() TO authenticated;

CREATE OR REPLACE FUNCTION public.assumir_pedido_palm(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_ator record;
  v_row public.vendas_em_espera%ROWTYPE;
  v_prep jsonb;
  v_mudou boolean := false;
  v_total numeric;
BEGIN
  SELECT * INTO v_ator FROM internal.palm_ator();

  SELECT * INTO v_row
  FROM public.vendas_em_espera
  WHERE id = p_id
  FOR UPDATE;

  IF NOT FOUND
     OR v_row.loja_id IS DISTINCT FROM v_ator.loja_id
     OR v_row.origem IS DISTINCT FROM 'PALM' THEN
    RAISE EXCEPTION 'venda_em_espera_nao_encontrada' USING ERRCODE = 'P0002';
  END IF;

  IF v_row.status = 'RETOMADA' AND v_row.assumido_por IS DISTINCT FROM v_ator.uid THEN
    RAISE EXCEPTION 'pedido_ja_assumido' USING ERRCODE = 'P0001';
  END IF;

  IF v_row.status NOT IN ('EM_ESPERA', 'RETOMADA') THEN
    RAISE EXCEPTION 'venda_em_espera_nao_encontrada' USING ERRCODE = 'P0002';
  END IF;

  v_prep := internal.palm_preparar_itens(v_ator.loja_id, v_row.itens);
  IF v_prep ? 'erro' THEN
    PERFORM internal.palm_registrar_evento(
      v_row.id, v_ator.loja_id, v_ator.uid, 'ESTOQUE_BLOQUEADO',
      jsonb_build_object('motivo', v_prep->>'erro', 'produto_id', v_prep->>'produto_id')
    );
    RETURN jsonb_build_object(
      'id', v_row.id,
      'numero_local', v_row.numero_local,
      'cliente_id', v_row.cliente_id,
      'status', v_row.status,
      'bloqueado', true,
      'motivo', v_prep->>'erro',
      'preco_alterado', false,
      'itens', v_row.itens
    );
  END IF;

  v_mudou := internal.palm_preco_mudou(v_row.itens, v_prep->'itens');
  v_total := (v_prep->>'total')::numeric;

  UPDATE public.vendas_em_espera
  SET status = 'RETOMADA',
      assumido_por = v_ator.uid,
      assumido_em = COALESCE(assumido_em, now()),
      itens = v_prep->'itens',
      precos_snapshot = CASE WHEN v_mudou THEN v_row.itens ELSE precos_snapshot END,
      totais = jsonb_build_object('totalBruto', v_total, 'totalDesconto', 0, 'totalLiquido', v_total),
      atualizada_em = now()
  WHERE id = v_row.id;

  IF v_row.status = 'EM_ESPERA' THEN
    PERFORM internal.palm_registrar_evento(
      v_row.id, v_ator.loja_id, v_ator.uid, 'ASSUMIDO',
      jsonb_build_object('total', v_total)
    );
  ELSE
    PERFORM internal.palm_registrar_evento(
      v_row.id, v_ator.loja_id, v_ator.uid, 'REVALIDADO',
      jsonb_build_object('total', v_total)
    );
  END IF;

  IF v_mudou THEN
    PERFORM internal.palm_registrar_evento(
      v_row.id, v_ator.loja_id, v_ator.uid, 'PRECO_ALTERADO',
      jsonb_build_object('antes', v_row.itens, 'depois', v_prep->'itens')
    );
  END IF;

  RETURN jsonb_build_object(
    'id', v_row.id,
    'numero_local', v_row.numero_local,
    'cliente_id', v_row.cliente_id,
    'status', 'RETOMADA',
    'bloqueado', false,
    'motivo', NULL,
    'preco_alterado', v_mudou,
    'itens', v_prep->'itens',
    'total', v_total
  );
END;
$$;

REVOKE ALL ON FUNCTION public.assumir_pedido_palm(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assumir_pedido_palm(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.cancelar_pedido_palm(p_id uuid, p_motivo text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_ator record;
  v_row public.vendas_em_espera%ROWTYPE;
  v_motivo text := NULLIF(btrim(COALESCE(p_motivo, '')), '');
  v_pode boolean;
BEGIN
  IF v_motivo IS NULL OR char_length(v_motivo) < 3 THEN
    RAISE EXCEPTION 'motivo_obrigatorio' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_ator FROM internal.palm_ator();

  SELECT * INTO v_row
  FROM public.vendas_em_espera
  WHERE id = p_id
  FOR UPDATE;

  IF NOT FOUND
     OR v_row.loja_id IS DISTINCT FROM v_ator.loja_id
     OR v_row.origem IS DISTINCT FROM 'PALM' THEN
    RAISE EXCEPTION 'venda_em_espera_nao_encontrada' USING ERRCODE = 'P0002';
  END IF;

  IF v_row.status = 'DESCARTADA' THEN
    RETURN jsonb_build_object('id', p_id, 'status', 'DESCARTADA', 'idempotente', true);
  END IF;

  IF v_row.status NOT IN ('EM_ESPERA', 'RETOMADA') THEN
    RAISE EXCEPTION 'venda_em_espera_nao_encontrada' USING ERRCODE = 'P0002';
  END IF;

  v_pode := v_ator.perfil IN ('GERENTE', 'DONO', 'ADMIN')
    OR (v_row.status = 'EM_ESPERA' AND v_row.vendedor_id = v_ator.uid)
    OR (v_row.status = 'RETOMADA' AND v_row.assumido_por = v_ator.uid);

  IF NOT v_pode THEN
    RAISE EXCEPTION 'permissao_negada' USING ERRCODE = '42501';
  END IF;

  UPDATE public.vendas_em_espera
  SET status = 'DESCARTADA',
      descartada_motivo = v_motivo,
      atualizada_em = now()
  WHERE id = p_id;

  PERFORM internal.palm_registrar_evento(
    p_id, v_ator.loja_id, v_ator.uid, 'CANCELADO',
    jsonb_build_object('motivo', v_motivo, 'status_anterior', v_row.status)
  );

  RETURN jsonb_build_object('id', p_id, 'status', 'DESCARTADA', 'idempotente', false);
END;
$$;

REVOKE ALL ON FUNCTION public.cancelar_pedido_palm(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancelar_pedido_palm(uuid, text) TO authenticated;

-- Espera tradicional: loja da sessão e origem CAIXA. PALM não entra na lista.
CREATE OR REPLACE FUNCTION public.listar_vendas_em_espera()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_ator record;
BEGIN
  SELECT * INTO v_ator FROM internal.palm_ator();
  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'id', v.id,
      'numero_local', v.numero_local,
      'rotulo', v.rotulo,
      'totais', v.totais,
      'qtd_itens', jsonb_array_length(v.itens),
      'criada_em', v.criada_em,
      'atualizada_em', v.atualizada_em
    ) ORDER BY v.atualizada_em DESC)
    FROM public.vendas_em_espera v
    WHERE v.operador_id = v_ator.uid
      AND v.loja_id = v_ator.loja_id
      AND v.status = 'EM_ESPERA'
      AND v.origem = 'CAIXA'
  ), '[]'::jsonb);
END;
$$;

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
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_ator record;
  v_num integer;
  v_id uuid;
BEGIN
  SELECT * INTO v_ator FROM internal.palm_ator();
  IF COALESCE(jsonb_array_length(p_itens), 0) < 1 THEN
    RAISE EXCEPTION 'carrinho_vazio' USING ERRCODE = '22023';
  END IF;
  IF p_caixa_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.caixas c
    WHERE c.id = p_caixa_id AND c.loja_id = v_ator.loja_id
  ) THEN
    RAISE EXCEPTION 'caixa_invalido' USING ERRCODE = '22023';
  END IF;
  PERFORM internal.palm_cliente_da_loja(p_cliente_id, v_ator.loja_id);

  v_num := public.proximo_numero_venda_em_espera(v_ator.uid);
  INSERT INTO public.vendas_em_espera (
    loja_id, operador_id, caixa_id, numero_local, rotulo, itens, totais,
    cliente_id, desconto_gerente_percentual, desconto_gerente_token, status, origem
  ) VALUES (
    v_ator.loja_id, v_ator.uid, p_caixa_id, v_num,
    NULLIF(btrim(COALESCE(p_rotulo, '')), ''),
    p_itens, COALESCE(p_totais, '{}'::jsonb),
    p_cliente_id, p_desconto_gerente_percentual, p_desconto_gerente_token,
    'EM_ESPERA', 'CAIXA'
  )
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('id', v_id, 'numero_local', v_num, 'status', 'EM_ESPERA');
END;
$$;

CREATE OR REPLACE FUNCTION public.retomar_venda_em_espera(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_ator record;
  v_row public.vendas_em_espera%ROWTYPE;
BEGIN
  SELECT * INTO v_ator FROM internal.palm_ator();

  SELECT * INTO v_row
  FROM public.vendas_em_espera
  WHERE id = p_id
  FOR UPDATE;

  IF NOT FOUND OR v_row.loja_id IS DISTINCT FROM v_ator.loja_id THEN
    RAISE EXCEPTION 'venda_em_espera_nao_encontrada' USING ERRCODE = 'P0002';
  END IF;

  IF v_row.origem = 'PALM' THEN
    RAISE EXCEPTION 'pedido_palm_use_assumir' USING ERRCODE = 'P0001';
  END IF;

  IF v_row.operador_id IS DISTINCT FROM v_ator.uid THEN
    RAISE EXCEPTION 'permissao_negada' USING ERRCODE = '42501';
  END IF;

  IF v_row.status = 'RETOMADA' THEN
    RAISE EXCEPTION 'venda_em_espera_em_uso' USING ERRCODE = 'P0001';
  END IF;

  IF v_row.status IS DISTINCT FROM 'EM_ESPERA' THEN
    RAISE EXCEPTION 'venda_em_espera_nao_encontrada' USING ERRCODE = 'P0002';
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

CREATE OR REPLACE FUNCTION public.devolver_venda_em_espera(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_ator record;
  v_row public.vendas_em_espera%ROWTYPE;
BEGIN
  SELECT * INTO v_ator FROM internal.palm_ator();

  SELECT * INTO v_row
  FROM public.vendas_em_espera
  WHERE id = p_id
  FOR UPDATE;

  IF NOT FOUND OR v_row.loja_id IS DISTINCT FROM v_ator.loja_id THEN
    RAISE EXCEPTION 'venda_em_espera_nao_encontrada' USING ERRCODE = 'P0002';
  END IF;

  IF v_row.origem = 'PALM' THEN
    IF v_row.assumido_por IS DISTINCT FROM v_ator.uid THEN
      RAISE EXCEPTION 'permissao_negada' USING ERRCODE = '42501';
    END IF;
    IF v_row.status = 'EM_ESPERA' THEN
      RETURN jsonb_build_object('id', p_id, 'status', 'EM_ESPERA');
    END IF;
    IF v_row.status IS DISTINCT FROM 'RETOMADA' THEN
      RAISE EXCEPTION 'venda_em_espera_nao_encontrada' USING ERRCODE = 'P0002';
    END IF;
    UPDATE public.vendas_em_espera
    SET status = 'EM_ESPERA', assumido_por = NULL, assumido_em = NULL, atualizada_em = now()
    WHERE id = p_id;
    PERFORM internal.palm_registrar_evento(
      p_id, v_ator.loja_id, v_ator.uid, 'DEVOLVIDO', '{}'::jsonb
    );
    RETURN jsonb_build_object('id', p_id, 'status', 'EM_ESPERA');
  END IF;

  IF v_row.operador_id IS DISTINCT FROM v_ator.uid THEN
    RAISE EXCEPTION 'permissao_negada' USING ERRCODE = '42501';
  END IF;
  IF v_row.status = 'EM_ESPERA' THEN
    RETURN jsonb_build_object('id', p_id, 'status', 'EM_ESPERA');
  END IF;
  IF v_row.status IS DISTINCT FROM 'RETOMADA' THEN
    RAISE EXCEPTION 'venda_em_espera_nao_encontrada' USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.vendas_em_espera
  SET status = 'EM_ESPERA', atualizada_em = now()
  WHERE id = p_id;

  RETURN jsonb_build_object('id', p_id, 'status', 'EM_ESPERA');
END;
$$;

CREATE OR REPLACE FUNCTION public.descartar_venda_em_espera(
  p_id uuid,
  p_motivo text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_ator record;
  v_row public.vendas_em_espera%ROWTYPE;
BEGIN
  SELECT * INTO v_ator FROM internal.palm_ator();

  SELECT * INTO v_row
  FROM public.vendas_em_espera
  WHERE id = p_id
    AND status IN ('EM_ESPERA', 'RETOMADA')
  FOR UPDATE;

  IF NOT FOUND OR v_row.loja_id IS DISTINCT FROM v_ator.loja_id THEN
    RAISE EXCEPTION 'venda_em_espera_nao_encontrada' USING ERRCODE = 'P0002';
  END IF;

  IF v_row.origem = 'PALM' THEN
    IF v_row.assumido_por IS DISTINCT FROM v_ator.uid
       AND v_row.vendedor_id IS DISTINCT FROM v_ator.uid
       AND v_ator.perfil NOT IN ('GERENTE', 'DONO', 'ADMIN') THEN
      RAISE EXCEPTION 'permissao_negada' USING ERRCODE = '42501';
    END IF;
  ELSIF v_row.operador_id IS DISTINCT FROM v_ator.uid THEN
    RAISE EXCEPTION 'permissao_negada' USING ERRCODE = '42501';
  END IF;

  UPDATE public.vendas_em_espera
  SET status = 'DESCARTADA',
      descartada_motivo = NULLIF(btrim(COALESCE(p_motivo, '')), ''),
      atualizada_em = now()
  WHERE id = p_id;

  IF v_row.origem = 'PALM' THEN
    PERFORM internal.palm_registrar_evento(
      p_id, v_ator.loja_id, v_ator.uid, 'CANCELADO',
      jsonb_build_object('via', 'descartar_venda_em_espera')
    );
  END IF;

  RETURN jsonb_build_object('id', p_id, 'status', 'DESCARTADA');
END;
$$;

CREATE OR REPLACE FUNCTION public.converter_venda_em_espera(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_ator record;
  v_row public.vendas_em_espera%ROWTYPE;
BEGIN
  SELECT * INTO v_ator FROM internal.palm_ator();

  SELECT * INTO v_row
  FROM public.vendas_em_espera
  WHERE id = p_id
  FOR UPDATE;

  IF NOT FOUND OR v_row.loja_id IS DISTINCT FROM v_ator.loja_id THEN
    RAISE EXCEPTION 'venda_em_espera_nao_encontrada' USING ERRCODE = 'P0002';
  END IF;

  IF v_row.origem = 'PALM' THEN
    IF v_row.assumido_por IS DISTINCT FROM v_ator.uid THEN
      RAISE EXCEPTION 'permissao_negada' USING ERRCODE = '42501';
    END IF;
  ELSIF v_row.operador_id IS DISTINCT FROM v_ator.uid THEN
    RAISE EXCEPTION 'permissao_negada' USING ERRCODE = '42501';
  END IF;

  IF v_row.status = 'CONVERTIDA' THEN
    RETURN jsonb_build_object('id', p_id, 'status', 'CONVERTIDA');
  END IF;

  IF v_row.status NOT IN ('EM_ESPERA', 'RETOMADA') THEN
    RAISE EXCEPTION 'venda_em_espera_nao_encontrada' USING ERRCODE = 'P0002';
  END IF;

  IF v_row.origem = 'PALM' AND v_row.status IS DISTINCT FROM 'RETOMADA' THEN
    RAISE EXCEPTION 'pedido_palm_use_assumir' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.vendas_em_espera
  SET status = 'CONVERTIDA', atualizada_em = now()
  WHERE id = p_id;

  IF v_row.origem = 'PALM' THEN
    PERFORM internal.palm_registrar_evento(
      p_id, v_ator.loja_id, v_ator.uid, 'CONVERTIDO', '{}'::jsonb
    );
  END IF;

  RETURN jsonb_build_object('id', p_id, 'status', 'CONVERTIDA');
END;
$$;

COMMENT ON FUNCTION public.assumir_pedido_palm(uuid) IS
  'Claim exclusivo do pedido PALM na loja da sessão. Revalida preço e estoque. Não baixa estoque.';

COMMENT ON FUNCTION public.enviar_pedido_palm(uuid, jsonb, uuid) IS
  'Cria pedido assistido idempotente. Preço vem de calcular_preco_produto. Estoque insuficiente não grava e não reserva.';

REVOKE ALL ON FUNCTION public.listar_vendas_em_espera() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.listar_vendas_em_espera() TO authenticated;

REVOKE ALL ON FUNCTION public.colocar_venda_em_espera(jsonb, jsonb, uuid, text, uuid, numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.colocar_venda_em_espera(jsonb, jsonb, uuid, text, uuid, numeric, text) TO authenticated;

REVOKE ALL ON FUNCTION public.retomar_venda_em_espera(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.retomar_venda_em_espera(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.devolver_venda_em_espera(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.devolver_venda_em_espera(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.descartar_venda_em_espera(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.descartar_venda_em_espera(uuid, text) TO authenticated;

REVOKE ALL ON FUNCTION public.converter_venda_em_espera(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.converter_venda_em_espera(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
