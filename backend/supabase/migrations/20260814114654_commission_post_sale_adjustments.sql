-- DB-05: ajustes pos-venda de comissao.
--
-- A geracao da comissao na venda concluida ja foi corrigida (FIN-298-03). Falta
-- o efeito economico das operacoes posteriores: cancelamento, devolucao total,
-- devolucao parcial e troca.
--
-- ---------------------------------------------------------------------------
-- MODELO ENCONTRADO (mapeado no catalogo, nao inventado aqui)
--
--   `comissoes_vendedores` tem UNIQUE (venda_id, operador_id) e a apuracao
--   termina em `ON CONFLICT DO UPDATE`. Uma segunda linha de ajuste NAO cabe
--   nessa tabela sem quebrar o contrato existente.
--
--   Fatos canonicos pos-venda:
--     * CANCELAMENTO -> `vendas.status = 'CANCELADA'`.
--       `cancelar_venda_transacional` NAO cria `venda_pos_venda_operacoes`;
--       cria `vendas_canceladas_auditoria` (uma por venda) e `devolucoes`.
--     * DEVOLUCAO/TROCA -> `venda_pos_venda_operacoes`
--       (tipo DEVOLUCAO|TROCA, `idempotency_key` UNIQUE) com detalhe por item
--       em `venda_pos_venda_itens`.
--     * `quantidade_devolvida_item_venda(item_venda_id)` ja e a autoridade da
--       quantidade devolvida por item.
--
--   TROCA: a operacao registra `venda_substituta_id`, e a venda substituta e
--   uma venda propria que gera a propria comissao pelo caminho normal. Aqui a
--   troca apenas reduz a comissao da venda original pelos itens efetivamente
--   devolvidos. Nenhuma regra de "devolucao total + nova venda" foi inventada.
--
-- ---------------------------------------------------------------------------
-- DESENHO
--
-- Um unico sistema de comissao. A formula passa a ter UMA implementacao,
-- `internal.calcular_comissao_venda(venda, efetivo)`:
--   * `efetivo = false` -> quantidades vendidas (comissao original);
--   * `efetivo = true`  -> quantidades remanescentes
--     (`quantidade - quantidade_devolvida_item_venda`, zero se venda cancelada).
-- A prioridade de regras (produto, categoria, margem, padrao do funcionario,
-- legado do produto, fallback global) e exatamente a que ja existia: o corpo
-- foi extraido do catalogo, nao reescrito. Por isso o ajuste de devolucao
-- parcial segue os ITENS devolvidos e nao uma proporcao artificial sobre o
-- total -- preserva o SSOT da formula.
--
-- `comissoes_ajustes` e o razao append-only de compensacoes, no mesmo padrao ja
-- usado em `liquidacoes_receber` e `contas_pagar_pagamentos`: valor sempre
-- positivo, sinal carregado pelo tipo, vinculo com o fato de origem e chave de
-- idempotencia deterministica. O fato original em `comissoes_vendedores` nunca
-- e apagado nem reescrito. Nao ha DELETE em nenhum caminho.
--
-- Ajuste incremental, para suportar devolucoes sucessivas:
--   alvo  = comissao original - comissao efetiva atual
--   delta = alvo - soma dos ajustes ja registrados
-- Grava apenas quando `delta > 0`.
--
-- Idempotencia: `idempotency_key` UNIQUE com identidade deterministica
--   CANCELAMENTO:<venda_id>   |   DEVOLUCAO:<operacao_id>
-- Retry do mesmo fato nao duplica; fatos diferentes geram ajustes distintos.
--
-- COMISSAO JA PAGA: o ajuste e registrado igual, e `comissoes_vendedores`
-- (inclusive `status='pago'`, `pago_em`, `pago_por`) permanece intocada. O saldo
-- economico fica em `comissoes_vendedores_liquidas.saldo_a_compensar`,
-- disponivel para compensacao futura. Nenhum pagamento e reescrito e nenhum
-- pagamento negativo e gerado.
--
-- ROLLBACK:
--   DROP TRIGGER trg_pos_venda_ajusta_comissao ON public.venda_pos_venda_itens;
--   DROP TRIGGER trg_vendas_cancelamento_ajusta_comissao ON public.vendas;
--   DROP FUNCTION public.trg_comissao_pos_venda();
--   DROP FUNCTION public.trg_comissao_cancelamento();
--   DROP VIEW public.comissoes_vendedores_liquidas;
--   DROP FUNCTION public.processar_ajuste_comissao_venda(uuid, text, uuid);
--   DROP TABLE public.comissoes_ajustes;
--   DROP FUNCTION internal.calcular_comissao_venda(uuid, boolean);
--   e restaurar processar_comissao_venda de 20260814110028.

BEGIN;

-- ===========================================================================
-- 1) Formula unica, parametrizada por quantidade efetiva
-- ===========================================================================

CREATE OR REPLACE FUNCTION internal.calcular_comissao_venda(
  p_venda_id uuid,
  p_efetivo boolean
)
RETURNS TABLE(o_valor numeric, o_base numeric, o_taxa numeric, o_regra uuid)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$


DECLARE
  v_status                text;
  v_caixa_id              uuid;
  v_total_comissao        numeric(14,2) := 0;
  v_base_calculo          numeric(14,2) := 0;
  v_taxa_global           numeric(10,4) := 0;
  v_loja_id               uuid;
  v_operador_id           uuid;
  v_funcionario_id        uuid;
  v_taxa_aplicada         numeric(10,4);
  v_regra_id              uuid;
  r                       record;
  v_margem_produto        numeric(10,4);
BEGIN
  -- Cabeçalho da venda: substitui o registro NEW do trigger original.
  SELECT v.status, v.operador_id, v.caixa_id
    INTO v_status, v_operador_id, v_caixa_id
  FROM public.vendas v
  WHERE v.id = p_venda_id;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- Só processa a transição -> CONCLUIDA
  IF NOT p_efetivo AND v_status IS DISTINCT FROM 'CONCLUIDA' THEN
    RETURN;
  END IF;
  -- Comissão é efeito colateral: NUNCA pode abortar a venda
  BEGIN
    -- operador, caixa e status vem do cabecalho lido acima

    -- vendas NÃO tem loja_id: resolve pela loja do caixa da venda
    SELECT c.loja_id INTO v_loja_id
    FROM public.caixas c
    WHERE c.id = v_caixa_id;

    -- Sem loja/operador resolvíveis: não registra
    IF v_loja_id IS NULL OR v_operador_id IS NULL THEN
      RETURN;
    END IF;

    -- Tenta encontrar funcionario_id associado ao operador
    SELECT funcionario_id INTO v_funcionario_id
    FROM public.usuarios
    WHERE id = v_operador_id;

    -- Taxa global de fallback (0 se não configurada)
    SELECT COALESCE(valor::numeric, 0) INTO v_taxa_global
    FROM public.configuracoes_gerais
    WHERE chave = 'comissao_padrao_percentual'
    LIMIT 1;

    FOR r IN
      SELECT
        CASE
          WHEN NOT p_efetivo THEN iv.quantidade
          WHEN v_status = 'CANCELADA' THEN 0
          ELSE GREATEST(0, iv.quantidade - public.quantidade_devolvida_item_venda(iv.id))
        END AS quantidade,
        iv.preco_unitario, p.comissao_tipo, p.comissao_valor, p.preco_custo,
        iv.produto_id, p.categoria_id
      FROM public.itens_venda iv
      JOIN public.produtos p ON p.id = iv.produto_id
      WHERE iv.venda_id = p_venda_id
    LOOP
      DECLARE
        v_base_item           numeric(14,2);
        v_com_item            numeric(14,2);
        v_margem              numeric(10,4);
        v_regra_produto       record;
        v_regra_categoria     record;
        v_regra_margem        record;
        v_regra_padrao        record;
      BEGIN
        IF COALESCE(r.quantidade,0) <= 0 THEN CONTINUE; END IF;
        v_base_item    := r.quantidade * r.preco_unitario;
        v_base_calculo := v_base_calculo + v_base_item;
        v_taxa_aplicada := NULL;
        v_regra_id := NULL;

        -- Calcular margem do item (preço_unitário - custo) / preço_unitário
        IF r.preco_custo IS NOT NULL AND r.preco_unitario > 0 THEN
          v_margem := ((r.preco_unitario - r.preco_custo) / r.preco_unitario) * 100.0;
        ELSE
          v_margem := 0;
        END IF;

        -- ─────────────────────────────────────────────────────────────────────
        -- Rule Priority (in order):
        -- 1. Product-specific employee rule
        -- 2. Category-specific employee rule
        -- 3. Margin-specific employee rule
        -- 4. Employee default rule (padrao)
        -- 5. Product legacy commission
        -- 6. Global fallback
        -- ─────────────────────────────────────────────────────────────────────

        -- 1. Check for product-specific employee rule
        IF v_funcionario_id IS NOT NULL THEN
          SELECT id, percentual INTO v_regra_produto
          FROM public.comissoes_regras_funcionario
          WHERE funcionario_id = v_funcionario_id
            AND loja_id = v_loja_id
            AND tipo_regra = 'por_produto'
            AND produto_id = r.produto_id
            AND ativo = true
            AND vigencia_inicio <= CURRENT_DATE
            AND (vigencia_fim IS NULL OR vigencia_fim >= CURRENT_DATE)
          LIMIT 1;

          IF v_regra_produto IS NOT NULL THEN
            v_taxa_aplicada := v_regra_produto.percentual;
            v_regra_id := v_regra_produto.id;
          END IF;
        END IF;

        -- 2. Check for category-specific employee rule (if no product rule found)
        IF v_taxa_aplicada IS NULL AND v_funcionario_id IS NOT NULL THEN
          SELECT id, percentual INTO v_regra_categoria
          FROM public.comissoes_regras_funcionario
          WHERE funcionario_id = v_funcionario_id
            AND loja_id = v_loja_id
            AND tipo_regra = 'por_categoria'
            AND categoria_id = r.categoria_id
            AND ativo = true
            AND vigencia_inicio <= CURRENT_DATE
            AND (vigencia_fim IS NULL OR vigencia_fim >= CURRENT_DATE)
          LIMIT 1;

          IF v_regra_categoria IS NOT NULL THEN
            v_taxa_aplicada := v_regra_categoria.percentual;
            v_regra_id := v_regra_categoria.id;
          END IF;
        END IF;

        -- 3. Check for margin-specific employee rule (if no product/category rule found)
        IF v_taxa_aplicada IS NULL AND v_funcionario_id IS NOT NULL THEN
          SELECT id, percentual INTO v_regra_margem
          FROM public.comissoes_regras_funcionario
          WHERE funcionario_id = v_funcionario_id
            AND loja_id = v_loja_id
            AND tipo_regra = 'por_margem'
            AND margem_minima <= v_margem
            AND margem_maxima >= v_margem
            AND ativo = true
            AND vigencia_inicio <= CURRENT_DATE
            AND (vigencia_fim IS NULL OR vigencia_fim >= CURRENT_DATE)
          LIMIT 1;

          IF v_regra_margem IS NOT NULL THEN
            v_taxa_aplicada := v_regra_margem.percentual;
            v_regra_id := v_regra_margem.id;
          END IF;
        END IF;

        -- 4. Check for employee default rule (padrao) (if no specific rule found)
        IF v_taxa_aplicada IS NULL AND v_funcionario_id IS NOT NULL THEN
          SELECT id, percentual INTO v_regra_padrao
          FROM public.comissoes_regras_funcionario
          WHERE funcionario_id = v_funcionario_id
            AND loja_id = v_loja_id
            AND tipo_regra = 'padrao'
            AND ativo = true
            AND vigencia_inicio <= CURRENT_DATE
            AND (vigencia_fim IS NULL OR vigencia_fim >= CURRENT_DATE)
          LIMIT 1;

          IF v_regra_padrao IS NOT NULL THEN
            v_taxa_aplicada := v_regra_padrao.percentual;
            v_regra_id := v_regra_padrao.id;
          END IF;
        END IF;

        -- 5. Check for product-level legacy commission override (if no employee rule found)
        IF v_taxa_aplicada IS NULL THEN
          IF r.comissao_tipo = 'percentual' AND r.comissao_valor IS NOT NULL THEN
            v_taxa_aplicada := r.comissao_valor;
            v_regra_id := NULL;
          ELSIF r.comissao_tipo = 'fixo' AND r.comissao_valor IS NOT NULL THEN
            v_taxa_aplicada := NULL; -- Será tratado abaixo como valor fixo
            v_regra_id := NULL;
          END IF;
        END IF;

        -- 6. Fall back to global rate (if no rule applied yet)
        IF v_taxa_aplicada IS NULL THEN
          v_taxa_aplicada := v_taxa_global;
          v_regra_id := NULL;
        END IF;

        -- Calculate commission for this item
        IF r.comissao_tipo = 'fixo' AND r.comissao_valor IS NOT NULL THEN
          -- Fixed amount per unit (legacy product rule)
          v_com_item := ROUND(r.comissao_valor * r.quantidade, 2);
        ELSE
          -- Percentage-based (all employee rules use percentage)
          v_com_item := ROUND(v_base_item * v_taxa_aplicada / 100.0, 2);
        END IF;

        v_total_comissao := v_total_comissao + v_com_item;
      END;
    END LOOP;
    o_valor := GREATEST(0, v_total_comissao);
    o_base  := v_base_calculo;
    o_taxa  := COALESCE(v_taxa_aplicada, v_taxa_global);
    o_regra := v_regra_id;
    -- RETURNS TABLE em PL/pgSQL so emite linha com RETURN NEXT.
    RETURN NEXT;

  EXCEPTION WHEN OTHERS THEN
    -- Falha na apuração de comissão não derruba a finalização da venda
    RETURN;
  END;

  RETURN;
END;


$fn$;

COMMENT ON FUNCTION internal.calcular_comissao_venda(uuid, boolean) IS
  'Formula unica de comissao. p_efetivo=false usa quantidades vendidas; true usa remanescentes apos devolucao/cancelamento.';

REVOKE ALL ON FUNCTION internal.calcular_comissao_venda(uuid, boolean) FROM PUBLIC, anon, authenticated;

-- Apuracao original: mesmo contrato, mesmo upsert, agora sobre a formula unica.
CREATE OR REPLACE FUNCTION public.processar_comissao_venda(p_venda_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_status text;
  v_operador_id uuid;
  v_caixa_id uuid;
  v_loja_id uuid;
  c record;
BEGIN
  SELECT v.status, v.operador_id, v.caixa_id
    INTO v_status, v_operador_id, v_caixa_id
  FROM public.vendas v WHERE v.id = p_venda_id;
  IF NOT FOUND OR v_status IS DISTINCT FROM 'CONCLUIDA' OR v_operador_id IS NULL THEN
    RETURN;
  END IF;

  SELECT c2.loja_id INTO v_loja_id FROM public.caixas c2 WHERE c2.id = v_caixa_id;
  IF v_loja_id IS NULL THEN RETURN; END IF;

  SELECT * INTO c FROM internal.calcular_comissao_venda(p_venda_id, false);
  IF c.o_valor IS NULL THEN RETURN; END IF;

  INSERT INTO public.comissoes_vendedores (
    venda_id, operador_id, loja_id, valor_comissao, base_calculo,
    percentual_aplicado, regra_id, status
  ) VALUES (
    p_venda_id, v_operador_id, v_loja_id, c.o_valor, c.o_base,
    c.o_taxa, c.o_regra, 'pendente'
  )
  ON CONFLICT (venda_id, operador_id) DO UPDATE
    SET valor_comissao = EXCLUDED.valor_comissao,
        base_calculo = EXCLUDED.base_calculo,
        percentual_aplicado = EXCLUDED.percentual_aplicado,
        regra_id = EXCLUDED.regra_id;
END;
$fn$;

-- ===========================================================================
-- 2) Razao append-only de ajustes
-- ===========================================================================

CREATE TABLE IF NOT EXISTS public.comissoes_ajustes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  comissao_id uuid NOT NULL REFERENCES public.comissoes_vendedores(id) ON DELETE CASCADE,
  venda_id uuid NOT NULL REFERENCES public.vendas(id) ON DELETE CASCADE,
  operador_id uuid NOT NULL REFERENCES public.usuarios(id),
  loja_id uuid NOT NULL REFERENCES public.lojas(id),
  tipo text NOT NULL,
  valor numeric(14,2) NOT NULL,
  origem_id uuid,
  idempotency_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT comissoes_ajustes_tipo_check CHECK (tipo IN ('CANCELAMENTO', 'DEVOLUCAO')),
  CONSTRAINT comissoes_ajustes_valor_positivo CHECK (valor > 0),
  CONSTRAINT comissoes_ajustes_key_not_blank CHECK (length(btrim(idempotency_key)) > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_comissoes_ajustes_idempotency
  ON public.comissoes_ajustes (idempotency_key);
CREATE INDEX IF NOT EXISTS idx_comissoes_ajustes_comissao
  ON public.comissoes_ajustes (comissao_id);
CREATE INDEX IF NOT EXISTS idx_comissoes_ajustes_venda
  ON public.comissoes_ajustes (venda_id);

COMMENT ON TABLE public.comissoes_ajustes IS
  'Compensacoes append-only da comissao apos cancelamento/devolucao. Valor sempre positivo; o sinal e o tipo. O fato original em comissoes_vendedores nunca e alterado.';

ALTER TABLE public.comissoes_ajustes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS comissoes_ajustes_select_gerencial ON public.comissoes_ajustes;
CREATE POLICY comissoes_ajustes_select_gerencial ON public.comissoes_ajustes
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.usuarios u
    WHERE u.id = (SELECT auth.uid())
      AND u.ativo
      AND (u.perfil = 'DONO'
           OR (u.perfil IN ('GERENTE', 'ADMIN') AND u.loja_id = comissoes_ajustes.loja_id))
  ));

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.comissoes_ajustes FROM authenticated, anon;

-- Saldo economico: comissao apurada menos compensacoes.
CREATE OR REPLACE VIEW public.comissoes_vendedores_liquidas
WITH (security_invoker = true) AS
SELECT
  cv.id,
  cv.venda_id,
  cv.operador_id,
  cv.loja_id,
  cv.status,
  cv.pago_em,
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

COMMENT ON VIEW public.comissoes_vendedores_liquidas IS
  'Comissao apurada, compensacoes e liquido. saldo_a_compensar fica negativo quando a comissao ja foi paga e sofreu ajuste posterior.';

-- ===========================================================================
-- 3) Registro do ajuste
-- ===========================================================================

CREATE OR REPLACE FUNCTION public.processar_ajuste_comissao_venda(
  p_venda_id uuid,
  p_tipo text,
  p_origem_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_com public.comissoes_vendedores%ROWTYPE;
  v_efetivo record;
  v_alvo numeric(14,2);
  v_ja numeric(14,2);
  v_delta numeric(14,2);
  v_key text;
BEGIN
  IF p_tipo NOT IN ('CANCELAMENTO', 'DEVOLUCAO') THEN
    RAISE EXCEPTION 'COMISSAO_AJUSTE_TIPO_INVALIDO';
  END IF;

  -- Sem comissao apurada nao ha o que compensar.
  SELECT * INTO v_com FROM public.comissoes_vendedores cv
  WHERE cv.venda_id = p_venda_id
  FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;

  v_key := p_tipo || ':' || COALESCE(p_origem_id, p_venda_id)::text;

  -- Retry do mesmo fato logico: nada a fazer.
  IF EXISTS (SELECT 1 FROM public.comissoes_ajustes a WHERE a.idempotency_key = v_key) THEN
    RETURN;
  END IF;

  SELECT * INTO v_efetivo FROM internal.calcular_comissao_venda(p_venda_id, true);

  v_alvo := GREATEST(0, v_com.valor_comissao - COALESCE(v_efetivo.o_valor, 0));
  SELECT COALESCE(SUM(a.valor), 0) INTO v_ja
  FROM public.comissoes_ajustes a WHERE a.comissao_id = v_com.id;
  v_delta := public.round_abnt(v_alvo - v_ja, 2);

  IF v_delta <= 0 THEN RETURN; END IF;

  INSERT INTO public.comissoes_ajustes (
    comissao_id, venda_id, operador_id, loja_id, tipo, valor, origem_id, idempotency_key
  ) VALUES (
    v_com.id, p_venda_id, v_com.operador_id, v_com.loja_id, p_tipo, v_delta, p_origem_id, v_key
  )
  ON CONFLICT (idempotency_key) DO NOTHING;
END;
$fn$;

COMMENT ON FUNCTION public.processar_ajuste_comissao_venda(uuid, text, uuid) IS
  'Compensacao incremental da comissao apos cancelamento ou devolucao. Idempotente pela chave do fato de origem.';

REVOKE ALL ON FUNCTION public.processar_ajuste_comissao_venda(uuid, text, uuid) FROM PUBLIC, anon, authenticated;

-- ===========================================================================
-- 4) Os dois eventos canonicos
-- ===========================================================================

-- CANCELAMENTO: o fato e a transicao de status da venda.
CREATE OR REPLACE FUNCTION public.trg_comissao_cancelamento()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  IF NEW.status = 'CANCELADA' AND OLD.status IS DISTINCT FROM 'CANCELADA' THEN
    PERFORM public.processar_ajuste_comissao_venda(NEW.id, 'CANCELAMENTO', NEW.id);
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_vendas_cancelamento_ajusta_comissao ON public.vendas;
CREATE TRIGGER trg_vendas_cancelamento_ajusta_comissao
  AFTER UPDATE OF status ON public.vendas
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_comissao_cancelamento();

-- DEVOLUCAO/TROCA: o fato e a operacao pos-venda, mas o ajuste depende dos
-- ITENS. O trigger e de nivel de instrucao em `venda_pos_venda_itens`, quando
-- os itens da operacao ja estao gravados -- mesmo padrao do gatilho de geracao
-- em `itens_venda`.
CREATE OR REPLACE FUNCTION public.trg_comissao_pos_venda()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  o record;
BEGIN
  FOR o IN
    SELECT DISTINCT ni.operacao_id, op.venda_id
    FROM novos_itens ni
    JOIN public.venda_pos_venda_operacoes op ON op.id = ni.operacao_id
  LOOP
    PERFORM public.processar_ajuste_comissao_venda(o.venda_id, 'DEVOLUCAO', o.operacao_id);
  END LOOP;
  RETURN NULL;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_pos_venda_ajusta_comissao ON public.venda_pos_venda_itens;
CREATE TRIGGER trg_pos_venda_ajusta_comissao
  AFTER INSERT ON public.venda_pos_venda_itens
  REFERENCING NEW TABLE AS novos_itens
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.trg_comissao_pos_venda();

COMMIT;
