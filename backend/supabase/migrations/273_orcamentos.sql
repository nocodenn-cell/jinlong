-- 273 — Fase 5, Entrega 6: Orçamento (venda não vinculante).
--
-- Decisão de modelagem: NÃO usar a tabela `vendas` (nem um novo status nela).
-- `vendas` tem CHECK restritivo de `forma_pagamento`/`status`, é a fonte
-- consultada por relatórios financeiros, fechamento de caixa e pela view de
-- consistência (migration 244) — todas essas leituras assumem que toda linha
-- em `vendas` é uma transação real. Um orçamento não é uma venda: não baixa
-- estoque, não gera evento fiscal, não tem pagamento. Modelar como tabela
-- própria (mesmo padrão de `vendas_em_espera`, migration 24703) é aditivo,
-- reversível, e não força nenhuma consulta existente a aprender a ignorar
-- linhas "ORCAMENTO".
--
-- Conversão: um orçamento vira venda reusando o MESMO fluxo de finalização
-- v4 (não é um terceiro caminho de venda — ver docs/venda-golden-flow.md).
-- O papel deste módulo é só: guardar itens/totais/cliente com validade, e
-- marcar `CONVERTIDO` quando uma venda concluída se originou dele (mesma
-- técnica de `marcar_venda_em_espera_convertida`, migration 270).

CREATE TABLE IF NOT EXISTS public.orcamentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  loja_id uuid NOT NULL REFERENCES public.lojas (id),
  operador_id uuid NOT NULL REFERENCES public.usuarios (id),
  numero_local integer NOT NULL,
  cliente_id uuid,
  itens jsonb NOT NULL DEFAULT '[]'::jsonb,
  totais jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'ABERTO'
    CHECK (status IN ('ABERTO', 'CONVERTIDO', 'EXPIRADO', 'CANCELADO')),
  venda_id uuid REFERENCES public.vendas (id),
  motivo_cancelamento text,
  validade_ate timestamptz NOT NULL,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_orcamentos_loja_status
  ON public.orcamentos (loja_id, status, atualizado_em DESC);

CREATE INDEX IF NOT EXISTS idx_orcamentos_operador_status
  ON public.orcamentos (operador_id, status, atualizado_em DESC);

COMMENT ON TABLE public.orcamentos IS
  'Orçamento (venda não vinculante): não reserva estoque, não gera evento fiscal. Converte em venda real via finalizar_venda_transacional_canonica_v4.';

ALTER TABLE public.orcamentos ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.orcamentos FROM anon;
GRANT SELECT, INSERT, UPDATE ON TABLE public.orcamentos TO authenticated;
GRANT ALL ON TABLE public.orcamentos TO service_role;

-- RLS restrita desde o início (aprendizado da migration 270: não expor a
-- vendas em espera/orçamentos de outros operadores para "qualquer um da loja").
CREATE POLICY orcamentos_select ON public.orcamentos
  FOR SELECT TO authenticated
  USING (
    operador_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.id = auth.uid()
        AND u.perfil IN ('ADMIN', 'DONO', 'GERENTE')
        AND u.loja_id = orcamentos.loja_id
    )
  );

CREATE POLICY orcamentos_insert ON public.orcamentos
  FOR INSERT TO authenticated
  WITH CHECK (operador_id = auth.uid());

CREATE POLICY orcamentos_update ON public.orcamentos
  FOR UPDATE TO authenticated
  USING (
    operador_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.id = auth.uid()
        AND u.perfil IN ('ADMIN', 'DONO', 'GERENTE')
        AND u.loja_id = orcamentos.loja_id
    )
  )
  WITH CHECK (
    operador_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.id = auth.uid()
        AND u.perfil IN ('ADMIN', 'DONO', 'GERENTE')
        AND u.loja_id = orcamentos.loja_id
    )
  );

CREATE OR REPLACE FUNCTION public.proximo_numero_orcamento(p_operador_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(MAX(numero_local), 0) + 1
  FROM public.orcamentos
  WHERE operador_id = p_operador_id
    AND status = 'ABERTO';
$$;

REVOKE ALL ON FUNCTION public.proximo_numero_orcamento(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.proximo_numero_orcamento(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.proximo_numero_orcamento(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.criar_orcamento(
  p_itens jsonb,
  p_totais jsonb,
  p_cliente_id uuid DEFAULT NULL,
  p_validade_dias integer DEFAULT 7
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
  v_validade_dias integer := GREATEST(1, LEAST(COALESCE(p_validade_dias, 7), 90));
  v_validade_ate timestamptz;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'sessao_expirada' USING ERRCODE = '42501';
  END IF;

  IF jsonb_array_length(COALESCE(p_itens, '[]'::jsonb)) < 1 THEN
    RAISE EXCEPTION 'carrinho_vazio' USING ERRCODE = '22023';
  END IF;

  SELECT u.loja_id INTO v_loja FROM public.usuarios u WHERE u.id = v_uid;
  IF v_loja IS NULL THEN
    RAISE EXCEPTION 'loja_obrigatoria' USING ERRCODE = '22023';
  END IF;

  v_validade_ate := now() + make_interval(days => v_validade_dias);
  v_num := public.proximo_numero_orcamento(v_uid);

  INSERT INTO public.orcamentos (
    loja_id, operador_id, numero_local, cliente_id, itens, totais, status, validade_ate
  ) VALUES (
    v_loja, v_uid, v_num, p_cliente_id, p_itens, COALESCE(p_totais, '{}'::jsonb),
    'ABERTO', v_validade_ate
  )
  RETURNING id INTO v_id;

  RETURN jsonb_build_object(
    'id', v_id,
    'numero_local', v_num,
    'validade_ate', v_validade_ate,
    'status', 'ABERTO'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.criar_orcamento(jsonb, jsonb, uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.criar_orcamento(jsonb, jsonb, uuid, integer) TO authenticated;

-- Marca ABERTO vencido como EXPIRADO (lazy, chamada pelas leituras abaixo).
CREATE OR REPLACE FUNCTION public.expirar_orcamentos_vencidos(p_operador_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.orcamentos
  SET status = 'EXPIRADO', atualizado_em = now()
  WHERE operador_id = p_operador_id
    AND status = 'ABERTO'
    AND validade_ate < now();
$$;

REVOKE ALL ON FUNCTION public.expirar_orcamentos_vencidos(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.expirar_orcamentos_vencidos(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.expirar_orcamentos_vencidos(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.listar_orcamentos()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'sessao_expirada' USING ERRCODE = '42501';
  END IF;

  PERFORM public.expirar_orcamentos_vencidos(v_uid);

  RETURN COALESCE(
    (
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', o.id,
          'numero_local', o.numero_local,
          'totais', o.totais,
          'qtd_itens', jsonb_array_length(o.itens),
          'cliente_id', o.cliente_id,
          'nome_cliente', c.nome,
          'validade_ate', o.validade_ate,
          'criado_em', o.criado_em,
          'atualizado_em', o.atualizado_em
        )
        ORDER BY o.atualizado_em DESC
      )
      FROM public.orcamentos o
      LEFT JOIN public.clientes c ON c.id = o.cliente_id
      WHERE o.operador_id = v_uid AND o.status = 'ABERTO'
    ),
    '[]'::jsonb
  );
END;
$$;

REVOKE ALL ON FUNCTION public.listar_orcamentos() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.listar_orcamentos() TO authenticated;

CREATE OR REPLACE FUNCTION public.obter_orcamento(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_row public.orcamentos%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'sessao_expirada' USING ERRCODE = '42501';
  END IF;

  PERFORM public.expirar_orcamentos_vencidos(v_uid);

  SELECT * INTO v_row FROM public.orcamentos WHERE id = p_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'orcamento_nao_encontrado' USING ERRCODE = 'P0002';
  END IF;
  IF v_row.operador_id IS DISTINCT FROM v_uid THEN
    RAISE EXCEPTION 'permissao_negada' USING ERRCODE = '42501';
  END IF;

  RETURN jsonb_build_object(
    'id', v_row.id,
    'numero_local', v_row.numero_local,
    'itens', v_row.itens,
    'totais', v_row.totais,
    'cliente_id', v_row.cliente_id,
    'status', v_row.status,
    'validade_ate', v_row.validade_ate
  );
END;
$$;

REVOKE ALL ON FUNCTION public.obter_orcamento(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.obter_orcamento(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.cancelar_orcamento(
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
  v_row public.orcamentos%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'sessao_expirada' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_row FROM public.orcamentos WHERE id = p_id AND status = 'ABERTO' FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'orcamento_nao_encontrado' USING ERRCODE = 'P0002';
  END IF;
  IF v_row.operador_id IS DISTINCT FROM v_uid THEN
    RAISE EXCEPTION 'permissao_negada' USING ERRCODE = '42501';
  END IF;

  UPDATE public.orcamentos
  SET status = 'CANCELADO',
    motivo_cancelamento = NULLIF(btrim(COALESCE(p_motivo, '')), ''),
    atualizado_em = now()
  WHERE id = p_id;

  RETURN jsonb_build_object('id', p_id, 'status', 'CANCELADO');
END;
$$;

REVOKE ALL ON FUNCTION public.cancelar_orcamento(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cancelar_orcamento(uuid, text) TO authenticated;

-- Best-effort, análoga a marcar_venda_em_espera_convertida (migration 270):
-- chamada pelo caixa depois que a venda prefillada a partir do orçamento é
-- finalizada com sucesso pela v4. Não bloqueia nem reverte a venda já feita.
CREATE OR REPLACE FUNCTION public.marcar_orcamento_convertido(
  p_id uuid,
  p_venda_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_row public.orcamentos%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'sessao_expirada' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_row FROM public.orcamentos WHERE id = p_id AND status = 'ABERTO' FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('id', p_id, 'status', 'NOOP');
  END IF;
  IF v_row.operador_id IS DISTINCT FROM v_uid THEN
    RAISE EXCEPTION 'permissao_negada' USING ERRCODE = '42501';
  END IF;

  UPDATE public.orcamentos
  SET status = 'CONVERTIDO', venda_id = p_venda_id, atualizado_em = now()
  WHERE id = p_id;

  RETURN jsonb_build_object('id', p_id, 'status', 'CONVERTIDO', 'venda_id', p_venda_id);
END;
$$;

REVOKE ALL ON FUNCTION public.marcar_orcamento_convertido(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.marcar_orcamento_convertido(uuid, uuid) TO authenticated;
