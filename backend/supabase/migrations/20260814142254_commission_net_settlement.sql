-- DB-05A: pagamento liquido de comissao com compensacao real dos ajustes.
--
-- Achado DB05-F1 (P0), confirmado no catalogo: `marcar_comissoes_pagas` nao
-- referencia `comissoes_ajustes` nem a view de liquido -- marca a linha
-- positiva como paga pelo valor integral. O `saldo_a_compensar` da view
-- `comissoes_vendedores_liquidas` era informativo e nenhum fluxo o consumia.
--
-- Cenario falsificador (secao 10 do handoff):
--   comissao +5, pagamento 5, devolucao -2, nova comissao +5
--   pagamento seguinte DEVE ser 3, nao 5.
--
-- ---------------------------------------------------------------------------
-- MODELO
--
--   comissoes_pagamentos          -> o lote de liquidacao (fato do pagamento)
--   comissoes_pagamentos_ajustes  -> quais ajustes foram consumidos e quanto
--   comissoes_vendedores.pagamento_id -> qual lote pagou aquela comissao
--
-- O ledger `comissoes_ajustes` permanece IMUTAVEL: o consumo e registrado na
-- tabela de vinculo, com `valor_consumido`, e nunca alterando a linha do
-- ajuste. Isso permite consumo PARCIAL sem reescrever o fato -- necessario
-- quando um ajuste e maior que o bruto disponivel no lote.
--
-- Saldo disponivel de um ajuste = valor - SUM(valor_consumido).
--
-- ---------------------------------------------------------------------------
-- CONTRATO
--
-- `liquidar_comissoes(loja, operador, ids, idempotency_key)` numa unica
-- transacao:
--   1. valida ator (ativo, perfil, escopo de loja) -- mesma politica de
--      `marcar_comissoes_pagas`;
--   2. bloqueia as comissoes selecionadas com FOR UPDATE, ORDER BY id
--      (ordem estavel de aquisicao de locks, base para DB-05F);
--   3. bruto = soma das comissoes pendentes selecionadas;
--   4. bloqueia os ajustes do mesmo operador/loja ainda nao consumidos,
--      ORDER BY created_at, id, e consome ate o limite do bruto;
--   5. liquido = bruto - compensado;
--   6. grava o lote, vincula comissoes e consumos.
--
-- Idempotencia: `idempotency_key` UNIQUE no lote. Retry devolve o lote
-- existente sem novo efeito economico.
--
-- `marcar_comissoes_pagas` mantem assinatura e passa a delegar, com chave
-- deterministica derivada de (loja, operador, conjunto de ids). Nenhuma
-- mudanca de UI e necessaria e o fluxo canonico passa a ser liquido.
--
-- ROLLBACK:
--   ALTER TABLE public.comissoes_vendedores DROP COLUMN pagamento_id;
--   DROP TABLE public.comissoes_pagamentos_ajustes;
--   DROP TABLE public.comissoes_pagamentos;
--   DROP FUNCTION public.liquidar_comissoes(uuid, uuid, uuid[], text);
--   e restaurar `marcar_comissoes_pagas` de 103_comissoes.sql.

BEGIN;

-- ===========================================================================
-- 1) Fatos de pagamento
-- ===========================================================================

CREATE TABLE IF NOT EXISTS public.comissoes_pagamentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  loja_id uuid NOT NULL REFERENCES public.lojas(id),
  operador_id uuid NOT NULL REFERENCES public.usuarios(id),
  valor_bruto numeric(14,2) NOT NULL,
  valor_compensado numeric(14,2) NOT NULL DEFAULT 0,
  valor_liquido numeric(14,2) NOT NULL,
  pago_por uuid REFERENCES public.usuarios(id),
  pago_em timestamptz NOT NULL DEFAULT now(),
  idempotency_key text NOT NULL,
  CONSTRAINT comissoes_pagamentos_valores_check
    CHECK (valor_bruto >= 0 AND valor_compensado >= 0 AND valor_liquido >= 0
           AND valor_liquido = valor_bruto - valor_compensado),
  CONSTRAINT comissoes_pagamentos_key_not_blank
    CHECK (length(btrim(idempotency_key)) > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_comissoes_pagamentos_idempotency
  ON public.comissoes_pagamentos (idempotency_key);
CREATE INDEX IF NOT EXISTS idx_comissoes_pagamentos_operador
  ON public.comissoes_pagamentos (loja_id, operador_id, pago_em);

COMMENT ON TABLE public.comissoes_pagamentos IS
  'Lote de liquidacao de comissao: bruto selecionado, compensado por ajustes e liquido efetivamente pago.';

-- Consumo de ajustes pelo lote. Permite consumo parcial sem tocar no ledger.
CREATE TABLE IF NOT EXISTS public.comissoes_pagamentos_ajustes (
  pagamento_id uuid NOT NULL REFERENCES public.comissoes_pagamentos(id) ON DELETE RESTRICT,
  ajuste_id uuid NOT NULL REFERENCES public.comissoes_ajustes(id) ON DELETE RESTRICT,
  valor_consumido numeric(14,2) NOT NULL,
  PRIMARY KEY (pagamento_id, ajuste_id),
  CONSTRAINT comissoes_pagamentos_ajustes_valor_positivo CHECK (valor_consumido > 0)
);

CREATE INDEX IF NOT EXISTS idx_comissoes_pagamentos_ajustes_ajuste
  ON public.comissoes_pagamentos_ajustes (ajuste_id);

COMMENT ON TABLE public.comissoes_pagamentos_ajustes IS
  'Quanto de cada ajuste foi consumido por cada lote. O ledger comissoes_ajustes nunca e alterado.';

ALTER TABLE public.comissoes_vendedores
  ADD COLUMN IF NOT EXISTS pagamento_id uuid REFERENCES public.comissoes_pagamentos(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_comissoes_vendedores_pagamento
  ON public.comissoes_vendedores (pagamento_id) WHERE pagamento_id IS NOT NULL;

COMMENT ON COLUMN public.comissoes_vendedores.pagamento_id IS
  'Lote de liquidacao que pagou esta comissao. NULL enquanto pendente.';

ALTER TABLE public.comissoes_pagamentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comissoes_pagamentos_ajustes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS comissoes_pagamentos_select_gerencial ON public.comissoes_pagamentos;
CREATE POLICY comissoes_pagamentos_select_gerencial ON public.comissoes_pagamentos
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.usuarios u
    WHERE u.id = (SELECT auth.uid()) AND u.ativo
      AND (u.perfil = 'DONO'
           OR (u.perfil IN ('GERENTE', 'ADMIN') AND u.loja_id = comissoes_pagamentos.loja_id))
  ));

DROP POLICY IF EXISTS comissoes_pagamentos_ajustes_select_gerencial ON public.comissoes_pagamentos_ajustes;
CREATE POLICY comissoes_pagamentos_ajustes_select_gerencial ON public.comissoes_pagamentos_ajustes
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.comissoes_pagamentos p
    JOIN public.usuarios u ON u.id = (SELECT auth.uid())
    WHERE p.id = comissoes_pagamentos_ajustes.pagamento_id AND u.ativo
      AND (u.perfil = 'DONO'
           OR (u.perfil IN ('GERENTE', 'ADMIN') AND u.loja_id = p.loja_id))
  ));

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.comissoes_pagamentos FROM authenticated, anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.comissoes_pagamentos_ajustes FROM authenticated, anon;

-- ===========================================================================
-- 2) Saldo economico canonico
-- ===========================================================================

-- A view ganha `pagamento_id`; CREATE OR REPLACE nao aceita coluna nova no meio.
DROP VIEW IF EXISTS public.comissoes_vendedores_liquidas;
CREATE VIEW public.comissoes_vendedores_liquidas
WITH (security_invoker = true) AS
SELECT
  cv.id,
  cv.venda_id,
  cv.operador_id,
  cv.loja_id,
  cv.status,
  cv.pago_em,
  cv.pagamento_id,
  cv.valor_comissao,
  COALESCE(aj.total_ajustes, 0)::numeric(14,2) AS total_ajustes,
  (cv.valor_comissao - COALESCE(aj.total_ajustes, 0))::numeric(14,2) AS valor_liquido,
  CASE
    WHEN cv.status = 'pago' THEN (0 - COALESCE(aj.total_ajustes, 0))::numeric(14,2)
    ELSE 0::numeric(14,2)
  END AS saldo_a_compensar
FROM public.comissoes_vendedores cv
LEFT JOIN LATERAL (
  SELECT SUM(a.valor) AS total_ajustes
  FROM public.comissoes_ajustes a WHERE a.comissao_id = cv.id
) aj ON true;

-- Saldo por operador: o que ainda ha para pagar e o debito que sobrou.
CREATE OR REPLACE VIEW public.comissoes_saldo_operador
WITH (security_invoker = true) AS
SELECT
  cv.loja_id,
  cv.operador_id,
  COALESCE(SUM(cv.valor_comissao) FILTER (WHERE cv.status = 'pendente'), 0)::numeric(14,2) AS comissao_pendente,
  COALESCE((
    SELECT SUM(a.valor) - COALESCE(SUM(pa.valor_consumido), 0)
    FROM public.comissoes_ajustes a
    LEFT JOIN public.comissoes_pagamentos_ajustes pa ON pa.ajuste_id = a.id
    WHERE a.loja_id = cv.loja_id AND a.operador_id = cv.operador_id
  ), 0)::numeric(14,2) AS ajuste_nao_compensado
FROM public.comissoes_vendedores cv
GROUP BY cv.loja_id, cv.operador_id;

COMMENT ON VIEW public.comissoes_saldo_operador IS
  'Saldo economico por operador: comissao ainda pendente e debito de ajuste ainda nao compensado.';

-- ===========================================================================
-- 3) Liquidacao canonica
-- ===========================================================================

CREATE OR REPLACE FUNCTION public.liquidar_comissoes(
  p_loja_id uuid,
  p_operador_id uuid,
  p_ids uuid[],
  p_idempotency_key text
)
RETURNS TABLE(
  pagamento_id uuid,
  valor_bruto numeric,
  valor_compensado numeric,
  valor_liquido numeric,
  comissoes_pagas integer,
  idempotent_replay boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
#variable_conflict use_column
DECLARE
  v_uid uuid := auth.uid();
  v_perfil text;
  v_loja_ator uuid;
  v_key text := btrim(COALESCE(p_idempotency_key, ''));
  v_pag public.comissoes_pagamentos%ROWTYPE;
  v_bruto numeric(14,2) := 0;
  v_compensado numeric(14,2) := 0;
  v_restante numeric(14,2);
  v_n integer := 0;
  r record;
  v_disp numeric(14,2);
  v_usar numeric(14,2);
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'COMISSOES_LIQUIDAR_AUTH'; END IF;
  IF v_key = '' THEN RAISE EXCEPTION 'COMISSOES_LIQUIDAR_IDEMPOTENCY_KEY'; END IF;

  SELECT u.perfil, u.loja_id INTO v_perfil, v_loja_ator
  FROM public.usuarios u WHERE u.id = v_uid AND u.ativo = true;
  IF NOT FOUND OR v_perfil NOT IN ('GERENTE', 'DONO', 'ADMIN') THEN
    RAISE EXCEPTION 'COMISSOES_LIQUIDAR_PERMISSAO';
  END IF;
  IF v_perfil IN ('GERENTE', 'ADMIN') AND v_loja_ator IS DISTINCT FROM p_loja_id THEN
    RAISE EXCEPTION 'COMISSOES_LIQUIDAR_PERMISSAO';
  END IF;

  -- Replay: mesmo lote logico devolve o fato ja criado.
  SELECT * INTO v_pag FROM public.comissoes_pagamentos cp
  WHERE cp.idempotency_key = v_key;
  IF FOUND THEN
    RETURN QUERY SELECT v_pag.id, v_pag.valor_bruto, v_pag.valor_compensado, v_pag.valor_liquido,
      (SELECT count(*)::integer FROM public.comissoes_vendedores cv WHERE cv.pagamento_id = v_pag.id),
      true;
    RETURN;
  END IF;

  -- Ordem estavel de locks: comissoes por id, depois ajustes por created_at/id.
  SELECT COALESCE(SUM(cv.valor_comissao), 0), count(*)
  INTO v_bruto, v_n
  FROM (
    SELECT cv2.* FROM public.comissoes_vendedores cv2
    WHERE cv2.loja_id = p_loja_id
      AND cv2.operador_id = p_operador_id
      AND cv2.id = ANY(p_ids)
      AND cv2.status = 'pendente'
    ORDER BY cv2.id
    FOR UPDATE
  ) cv;

  IF v_n = 0 THEN
    RAISE EXCEPTION 'COMISSOES_LIQUIDAR_NADA_A_PAGAR';
  END IF;

  v_restante := v_bruto;

  INSERT INTO public.comissoes_pagamentos (
    loja_id, operador_id, valor_bruto, valor_compensado, valor_liquido, pago_por, idempotency_key
  ) VALUES (p_loja_id, p_operador_id, v_bruto, 0, v_bruto, v_uid, v_key)
  RETURNING * INTO v_pag;

  -- Consome ajustes ainda nao compensados, do mais antigo para o mais novo.
  FOR r IN
    SELECT a.id, a.valor,
           a.valor - COALESCE((
             SELECT SUM(pa.valor_consumido) FROM public.comissoes_pagamentos_ajustes pa
             WHERE pa.ajuste_id = a.id), 0) AS disponivel
    FROM public.comissoes_ajustes a
    WHERE a.loja_id = p_loja_id AND a.operador_id = p_operador_id
    ORDER BY a.created_at, a.id
    FOR UPDATE
  LOOP
    EXIT WHEN v_restante <= 0;
    v_disp := r.disponivel;
    IF v_disp IS NULL OR v_disp <= 0 THEN CONTINUE; END IF;
    v_usar := LEAST(v_disp, v_restante);
    INSERT INTO public.comissoes_pagamentos_ajustes (pagamento_id, ajuste_id, valor_consumido)
    VALUES (v_pag.id, r.id, v_usar);
    v_compensado := v_compensado + v_usar;
    v_restante := v_restante - v_usar;
  END LOOP;

  UPDATE public.comissoes_pagamentos cp
  SET valor_compensado = v_compensado,
      valor_liquido = v_bruto - v_compensado
  WHERE cp.id = v_pag.id;

  UPDATE public.comissoes_vendedores cv
  SET status = 'pago', pago_em = now(), pago_por = v_uid, pagamento_id = v_pag.id
  WHERE cv.loja_id = p_loja_id
    AND cv.operador_id = p_operador_id
    AND cv.id = ANY(p_ids)
    AND cv.status = 'pendente';

  RETURN QUERY SELECT v_pag.id, v_bruto, v_compensado, (v_bruto - v_compensado), v_n, false;
END;
$fn$;

COMMENT ON FUNCTION public.liquidar_comissoes(uuid, uuid, uuid[], text) IS
  'Liquidacao canonica de comissao: consome ajustes negativos e paga o liquido, tudo numa transacao.';

REVOKE ALL ON FUNCTION public.liquidar_comissoes(uuid, uuid, uuid[], text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.liquidar_comissoes(uuid, uuid, uuid[], text) TO authenticated, service_role;

-- ===========================================================================
-- 4) O fluxo existente passa a ser liquido, sem mudar a assinatura
-- ===========================================================================

CREATE OR REPLACE FUNCTION public.marcar_comissoes_pagas(
  p_loja_id uuid,
  p_operador_id uuid,
  p_ids uuid[]
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_key text;
  v_n integer;
BEGIN
  -- Chave deterministica pelo conjunto selecionado: retry do mesmo lote
  -- converge para o mesmo pagamento em vez de pagar de novo.
  SELECT 'liquidacao:' || p_loja_id::text || ':' || p_operador_id::text || ':' ||
         md5(COALESCE(string_agg(x::text, ',' ORDER BY x), ''))
  INTO v_key
  FROM unnest(COALESCE(p_ids, ARRAY[]::uuid[])) AS x;

  SELECT comissoes_pagas INTO v_n
  FROM public.liquidar_comissoes(p_loja_id, p_operador_id, p_ids, v_key);

  RETURN COALESCE(v_n, 0);
END;
$fn$;

COMMENT ON FUNCTION public.marcar_comissoes_pagas(uuid, uuid, uuid[]) IS
  'Compatibilidade: delega para liquidar_comissoes, que compensa ajustes antes de pagar.';

REVOKE ALL ON FUNCTION public.marcar_comissoes_pagas(uuid, uuid, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.marcar_comissoes_pagas(uuid, uuid, uuid[]) TO authenticated, service_role;

COMMIT;
