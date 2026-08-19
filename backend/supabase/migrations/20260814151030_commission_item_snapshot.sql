-- DB-05C: snapshot historico da comissao por item.
--
-- Achado DB05-F4 (P1), falsificado empiricamente antes desta migration:
--
--   venda de 10 un a R$89,90 com `comissao_padrao_percentual` = 5%
--     comissao original ............................ R$44,95
--   depois da venda: preco_custo muda, percentual global vai a 10%
--   devolucao de 40% dos itens
--     ajuste gerado ................................ R$ 0,00
--     ajuste historicamente correto ................ R$17,98
--
-- Nao era so imprecisao: a compensacao desaparecia por inteiro. O alvo e
-- `GREATEST(0, original - efetiva)`, e a comissao "efetiva" era RECALCULADA com
-- a configuracao ATUAL. Recalculado a 10%, o remanescente de 60% valia R$53,94,
-- maior que a comissao original de R$44,95 -> alvo zero. Uma venda antiga ficava
-- com a devolucao gratuita para o vendedor sempre que a taxa subisse.
--
-- Entradas atuais que vazavam para o passado, todas em
-- `internal.calcular_comissao_venda(..., p_efetivo => true)`:
--   `produtos.preco_custo` (define a margem, que escolhe a regra por_margem),
--   `produtos.comissao_tipo` / `comissao_valor`, `produtos.categoria_id`,
--   o vinculo atual `usuarios.funcionario_id`, as regras hoje ativas em
--   `comissoes_regras_funcionario`, a vigencia comparada com `CURRENT_DATE` e
--   `configuracoes_gerais.comissao_padrao_percentual`.
--
-- ---------------------------------------------------------------------------
-- DESENHO — UMA formula, nao duas
--
-- A correcao NAO copia a formula para um segundo lugar. Ela separa o que ja
-- estava fundido numa funcao so:
--
--   internal.resolver_comissao_itens_venda(venda)
--     RESOLUCAO DE REGRA. Le custo, categoria, vinculo do funcionario, regras
--     vigentes e percentual global. A escada de prioridade (produto ->
--     categoria -> margem -> padrao do funcionario -> legado do produto ->
--     global) e a mesma de sempre, movida sem reescrita. So faz sentido no
--     momento da venda, e passa a ser executada SO ai.
--
--   internal.comissao_valor_item(qtd, preco, tipo, percentual, fixo)
--     ARITMETICA DO DINHEIRO. Autoridade unica. Usada tanto na apuracao
--     original quanto na reconstrucao pos-venda -- e o que impede duas
--     formulas concorrentes de nascerem.
--
--   public.comissoes_itens
--     O FATO CONGELADO. Uma linha por item comissionado, com o resultado da
--     resolucao (regra, tipo, percentual ou valor fixo) e a quantidade/preco
--     elegiveis. Reconstruir a comissao historica de qualquer subconjunto de
--     itens passa a exigir apenas esta tabela mais a aritmetica acima.
--
--   internal.calcular_comissao_venda(venda, efetivo)  -- contrato preservado
--     p_efetivo=false -> resolve e soma sobre as quantidades vendidas;
--     p_efetivo=true  -> NAO resolve nada: le o snapshot e aplica a MESMA
--                        aritmetica sobre as quantidades remanescentes.
--
-- Menor estrutura suficiente: congela-se o RESULTADO da resolucao, nunca as
-- suas entradas. Custo e margem escolhem a regra; uma vez que a regra, o tipo e
-- o percentual estao congelados, custo e margem sao irrelevantes para
-- reconstruir o passado. Guardar `preco_custo` seria guardar um insumo morto.
--
-- ---------------------------------------------------------------------------
-- O CABECALHO TAMBEM PARA DE SER RECALCULADO
--
-- `processar_comissao_venda` roda mais de uma vez por venda (gatilho de itens e
-- gatilho de status). Congelar so o ajuste deixaria a mesma porta aberta no
-- fato original: uma reexecucao apos mudanca de regra reescrevia
-- `comissoes_vendedores.valor_comissao` com a taxa nova. Agora o snapshot e
-- gravado uma unica vez por item (`ON CONFLICT DO NOTHING`) e o cabecalho passa
-- a ser CONSEQUENCIA dele. Um item novo, adicionado depois, entra com fatos
-- proprios e soma -- isso e fato novo, nao reescrita do passado.
--
-- ---------------------------------------------------------------------------
-- QUIRK PRESERVADO DELIBERADAMENTE
--
-- Na formula existente, `produtos.comissao_tipo = 'fixo'` vence o calculo do
-- dinheiro mesmo quando uma regra de funcionario casou na escada -- a escada
-- define `regra_id`, mas o valor sai do fixo do produto. Isso e preservado tal
-- e qual: congelar a verdade historica significa congelar a formula que
-- realmente rodou, nao a que deveria ter rodado. `origem_regra` grava
-- `PRODUTO_FIXO` nesse caso para que a trilha explique de onde veio o dinheiro,
-- enquanto `regra_id` continua refletindo a escada, como no cabecalho de hoje.
--
-- ---------------------------------------------------------------------------
-- COMISSOES ANTERIORES A ESTA MIGRATION
--
-- Nao ha backfill: reconstruir snapshot de venda antiga usaria exatamente os
-- dados atuais que este documento proibe. Comissao sem snapshot mantem o
-- comportamento de hoje (recalculo), explicitamente, e so ela. Toda comissao
-- criada pelo caminho canonico a partir daqui nasce com snapshot -- o gate
-- prova isso.
--
-- ROLLBACK:
--   DROP TABLE public.comissoes_itens;
--   DROP FUNCTION internal.resolver_comissao_itens_venda(uuid);
--   DROP FUNCTION internal.comissao_quantidade_efetiva(uuid, numeric, boolean);
--   DROP FUNCTION internal.comissao_valor_item(numeric, numeric, text, numeric, numeric);
--   e restaurar internal.calcular_comissao_venda / public.processar_comissao_venda
--   de 20260814114654_commission_post_sale_adjustments.sql.

BEGIN;

-- ===========================================================================
-- 1) Aritmetica do dinheiro: autoridade unica
-- ===========================================================================

-- A base do item e arredondada ANTES de aplicar a taxa. Nao e detalhe: a
-- formula original acumulava a base numa variavel numeric(14,2), o que
-- arredondava a cada item. Reproduzir isso aqui mantem centavo a centavo o
-- mesmo resultado da apuracao que ja roda em producao.
CREATE OR REPLACE FUNCTION internal.comissao_valor_item(
  p_quantidade numeric,
  p_preco_unitario numeric,
  p_tipo_calculo text,
  p_percentual numeric,
  p_valor_unitario_fixo numeric
)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
AS $fn$
  SELECT (CASE
    WHEN COALESCE(p_quantidade, 0) <= 0 THEN 0
    WHEN p_tipo_calculo = 'fixo'
      THEN ROUND(COALESCE(p_valor_unitario_fixo, 0) * p_quantidade, 2)
    ELSE ROUND(ROUND(p_quantidade * p_preco_unitario, 2) * COALESCE(p_percentual, 0) / 100.0, 2)
  END)::numeric(14,2);
$fn$;

COMMENT ON FUNCTION internal.comissao_valor_item(numeric, numeric, text, numeric, numeric) IS
  'Aritmetica unica da comissao de um item. Usada na apuracao original e na reconstrucao historica pos-venda.';

REVOKE ALL ON FUNCTION internal.comissao_valor_item(numeric, numeric, text, numeric, numeric)
  FROM PUBLIC, anon, authenticated;

-- Quantidade ainda comissionavel de um item.
-- `quantidade_devolvida_item_venda` continua sendo a autoridade da quantidade
-- devolvida; aqui so se aplica o efeito do cancelamento por cima dela.
CREATE OR REPLACE FUNCTION internal.comissao_quantidade_efetiva(
  p_item_venda_id uuid,
  p_quantidade_vendida numeric,
  p_venda_cancelada boolean
)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT CASE
    WHEN p_venda_cancelada THEN 0::numeric
    ELSE GREATEST(0, p_quantidade_vendida - public.quantidade_devolvida_item_venda(p_item_venda_id))
  END;
$fn$;

COMMENT ON FUNCTION internal.comissao_quantidade_efetiva(uuid, numeric, boolean) IS
  'Quantidade de um item que ainda gera comissao, ja descontadas devolucoes e cancelamento.';

REVOKE ALL ON FUNCTION internal.comissao_quantidade_efetiva(uuid, numeric, boolean)
  FROM PUBLIC, anon, authenticated;

-- ===========================================================================
-- 2) Resolucao de regra: acontece UMA vez, no momento da venda
-- ===========================================================================

CREATE OR REPLACE FUNCTION internal.resolver_comissao_itens_venda(p_venda_id uuid)
RETURNS TABLE(
  o_item_venda_id uuid,
  o_produto_id uuid,
  o_quantidade numeric,
  o_preco_unitario numeric,
  o_origem_regra text,
  o_regra_id uuid,
  o_tipo_calculo text,
  o_percentual numeric,
  o_valor_unitario_fixo numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_caixa_id       uuid;
  v_loja_id        uuid;
  v_operador_id    uuid;
  v_funcionario_id uuid;
  v_taxa_global    numeric(10,4) := 0;
  v_taxa           numeric(10,4);
  v_regra          uuid;
  v_origem         text;
  v_margem         numeric(10,4);
  r                record;
  g                record;
BEGIN
  SELECT v.operador_id, v.caixa_id INTO v_operador_id, v_caixa_id
  FROM public.vendas v WHERE v.id = p_venda_id;
  IF NOT FOUND THEN RETURN; END IF;

  -- vendas NAO tem loja_id: resolve pela loja do caixa da venda
  SELECT c.loja_id INTO v_loja_id FROM public.caixas c WHERE c.id = v_caixa_id;
  IF v_loja_id IS NULL OR v_operador_id IS NULL THEN RETURN; END IF;

  SELECT u.funcionario_id INTO v_funcionario_id
  FROM public.usuarios u WHERE u.id = v_operador_id;

  SELECT COALESCE(cg.valor::numeric, 0) INTO v_taxa_global
  FROM public.configuracoes_gerais cg
  WHERE cg.chave = 'comissao_padrao_percentual' LIMIT 1;

  FOR r IN
    SELECT iv.id, iv.produto_id, iv.quantidade, iv.preco_unitario,
           p.comissao_tipo, p.comissao_valor, p.preco_custo, p.categoria_id
    FROM public.itens_venda iv
    JOIN public.produtos p ON p.id = iv.produto_id
    WHERE iv.venda_id = p_venda_id
    ORDER BY iv.id
  LOOP
    v_taxa := NULL; v_regra := NULL; v_origem := NULL;

    -- Margem do item: (preco_unitario - custo) / preco_unitario
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

    -- 1. Product-specific employee rule
    IF v_funcionario_id IS NOT NULL THEN
      SELECT cr.id, cr.percentual INTO g
      FROM public.comissoes_regras_funcionario cr
      WHERE cr.funcionario_id = v_funcionario_id
        AND cr.loja_id = v_loja_id
        AND cr.tipo_regra = 'por_produto'
        AND cr.produto_id = r.produto_id
        AND cr.ativo = true
        AND cr.vigencia_inicio <= CURRENT_DATE
        AND (cr.vigencia_fim IS NULL OR cr.vigencia_fim >= CURRENT_DATE)
      LIMIT 1;
      IF FOUND THEN
        v_taxa := g.percentual; v_regra := g.id; v_origem := 'REGRA_PRODUTO';
      END IF;
    END IF;

    -- 2. Category-specific employee rule
    IF v_taxa IS NULL AND v_funcionario_id IS NOT NULL THEN
      SELECT cr.id, cr.percentual INTO g
      FROM public.comissoes_regras_funcionario cr
      WHERE cr.funcionario_id = v_funcionario_id
        AND cr.loja_id = v_loja_id
        AND cr.tipo_regra = 'por_categoria'
        AND cr.categoria_id = r.categoria_id
        AND cr.ativo = true
        AND cr.vigencia_inicio <= CURRENT_DATE
        AND (cr.vigencia_fim IS NULL OR cr.vigencia_fim >= CURRENT_DATE)
      LIMIT 1;
      IF FOUND THEN
        v_taxa := g.percentual; v_regra := g.id; v_origem := 'REGRA_CATEGORIA';
      END IF;
    END IF;

    -- 3. Margin-specific employee rule
    IF v_taxa IS NULL AND v_funcionario_id IS NOT NULL THEN
      SELECT cr.id, cr.percentual INTO g
      FROM public.comissoes_regras_funcionario cr
      WHERE cr.funcionario_id = v_funcionario_id
        AND cr.loja_id = v_loja_id
        AND cr.tipo_regra = 'por_margem'
        AND cr.margem_minima <= v_margem
        AND cr.margem_maxima >= v_margem
        AND cr.ativo = true
        AND cr.vigencia_inicio <= CURRENT_DATE
        AND (cr.vigencia_fim IS NULL OR cr.vigencia_fim >= CURRENT_DATE)
      LIMIT 1;
      IF FOUND THEN
        v_taxa := g.percentual; v_regra := g.id; v_origem := 'REGRA_MARGEM';
      END IF;
    END IF;

    -- 4. Employee default rule (padrao)
    IF v_taxa IS NULL AND v_funcionario_id IS NOT NULL THEN
      SELECT cr.id, cr.percentual INTO g
      FROM public.comissoes_regras_funcionario cr
      WHERE cr.funcionario_id = v_funcionario_id
        AND cr.loja_id = v_loja_id
        AND cr.tipo_regra = 'padrao'
        AND cr.ativo = true
        AND cr.vigencia_inicio <= CURRENT_DATE
        AND (cr.vigencia_fim IS NULL OR cr.vigencia_fim >= CURRENT_DATE)
      LIMIT 1;
      IF FOUND THEN
        v_taxa := g.percentual; v_regra := g.id; v_origem := 'REGRA_PADRAO';
      END IF;
    END IF;

    -- 5. Product-level legacy commission override
    IF v_taxa IS NULL THEN
      IF r.comissao_tipo = 'percentual' AND r.comissao_valor IS NOT NULL THEN
        v_taxa := r.comissao_valor; v_regra := NULL; v_origem := 'PRODUTO_PERCENTUAL';
      END IF;
      -- 'fixo' nao define taxa: cai no fallback global, como na formula original
    END IF;

    -- 6. Global fallback
    IF v_taxa IS NULL THEN
      v_taxa := v_taxa_global; v_regra := NULL; v_origem := 'GLOBAL';
    END IF;

    o_item_venda_id  := r.id;
    o_produto_id     := r.produto_id;
    o_quantidade     := r.quantidade;
    o_preco_unitario := r.preco_unitario;
    o_regra_id       := v_regra;

    -- O fixo do produto vence a aritmetica mesmo com regra de funcionario
    -- casada -- comportamento existente, congelado como esta.
    IF r.comissao_tipo = 'fixo' AND r.comissao_valor IS NOT NULL THEN
      o_tipo_calculo        := 'fixo';
      o_valor_unitario_fixo := r.comissao_valor;
      o_percentual          := NULL;
      o_origem_regra        := 'PRODUTO_FIXO';
    ELSE
      o_tipo_calculo        := 'percentual';
      o_valor_unitario_fixo := NULL;
      o_percentual          := v_taxa;
      o_origem_regra        := v_origem;
    END IF;

    RETURN NEXT;
  END LOOP;

  RETURN;
END;
$fn$;

COMMENT ON FUNCTION internal.resolver_comissao_itens_venda(uuid) IS
  'Escada de prioridade de regras, por item, com os dados vigentes AGORA. So deve ser executada na apuracao da venda: o resultado e congelado em comissoes_itens.';

REVOKE ALL ON FUNCTION internal.resolver_comissao_itens_venda(uuid) FROM PUBLIC, anon, authenticated;

-- ===========================================================================
-- 3) O fato congelado por item
-- ===========================================================================

CREATE TABLE IF NOT EXISTS public.comissoes_itens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  comissao_id uuid NOT NULL REFERENCES public.comissoes_vendedores(id) ON DELETE RESTRICT,
  venda_id uuid NOT NULL REFERENCES public.vendas(id) ON DELETE RESTRICT,
  item_venda_id uuid NOT NULL REFERENCES public.itens_venda(id) ON DELETE RESTRICT,
  produto_id uuid NOT NULL REFERENCES public.produtos(id) ON DELETE RESTRICT,
  quantidade numeric(10,3) NOT NULL,
  preco_unitario numeric(10,2) NOT NULL,
  base_elegivel numeric(14,2) NOT NULL,
  origem_regra text NOT NULL,
  regra_id uuid REFERENCES public.comissoes_regras_funcionario(id) ON DELETE RESTRICT,
  tipo_calculo text NOT NULL,
  percentual_aplicado numeric(10,4),
  valor_unitario_fixo numeric(10,4),
  valor_comissao numeric(14,2) NOT NULL,
  apurado_em timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT comissoes_itens_quantidade_positiva CHECK (quantidade > 0),
  CONSTRAINT comissoes_itens_origem_check CHECK (origem_regra IN (
    'REGRA_PRODUTO', 'REGRA_CATEGORIA', 'REGRA_MARGEM', 'REGRA_PADRAO',
    'PRODUTO_PERCENTUAL', 'PRODUTO_FIXO', 'GLOBAL')),
  -- O par (tipo, parametro) tem de ser suficiente e nao ambiguo: sem isto o
  -- snapshot poderia existir sem o numero que reconstroi o dinheiro.
  CONSTRAINT comissoes_itens_parametro_check CHECK (
    (tipo_calculo = 'percentual' AND percentual_aplicado IS NOT NULL AND valor_unitario_fixo IS NULL)
    OR
    (tipo_calculo = 'fixo' AND valor_unitario_fixo IS NOT NULL AND percentual_aplicado IS NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_comissoes_itens_comissao_item
  ON public.comissoes_itens (comissao_id, item_venda_id);
CREATE INDEX IF NOT EXISTS idx_comissoes_itens_venda
  ON public.comissoes_itens (venda_id);
CREATE INDEX IF NOT EXISTS idx_comissoes_itens_item
  ON public.comissoes_itens (item_venda_id);

COMMENT ON TABLE public.comissoes_itens IS
  'Snapshot historico da comissao por item: quantidade e preco elegiveis mais a regra, o tipo e o parametro que realmente valeram na venda. Fonte exclusiva dos ajustes pos-venda.';
COMMENT ON COLUMN public.comissoes_itens.origem_regra IS
  'De onde saiu o dinheiro do item. PRODUTO_FIXO indica que o fixo do produto venceu a escada de regras.';
COMMENT ON COLUMN public.comissoes_itens.regra_id IS
  'Regra de funcionario que a escada selecionou, quando houve. Mantido mesmo quando PRODUTO_FIXO venceu a aritmetica, como no cabecalho.';

ALTER TABLE public.comissoes_itens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS comissoes_itens_select_gerencial ON public.comissoes_itens;
CREATE POLICY comissoes_itens_select_gerencial ON public.comissoes_itens
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.comissoes_vendedores cv
    JOIN public.usuarios u ON u.id = (SELECT auth.uid())
    WHERE cv.id = comissoes_itens.comissao_id
      AND u.ativo
      AND (u.perfil = 'DONO'
           OR (u.perfil IN ('GERENTE', 'ADMIN') AND u.loja_id = cv.loja_id))
  ));

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.comissoes_itens FROM authenticated, anon;

-- ===========================================================================
-- 4) A formula unica, agora com duas fontes de quantidade e UMA de parametro
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
  v_status         text;
  v_cancelada      boolean;
  v_tem_snapshot   boolean := false;
  v_total          numeric(14,2) := 0;
  v_base           numeric(14,2) := 0;
  v_taxa_global    numeric(10,4) := 0;
  v_taxa           numeric(10,4);
  v_regra          uuid;
  v_qtd            numeric;
  r                record;
BEGIN
  SELECT v.status INTO v_status FROM public.vendas v WHERE v.id = p_venda_id;
  IF NOT FOUND THEN RETURN; END IF;

  -- Apuracao original so existe na venda concluida.
  IF NOT p_efetivo AND v_status IS DISTINCT FROM 'CONCLUIDA' THEN RETURN; END IF;
  v_cancelada := (v_status = 'CANCELADA');

  -- Comissao e efeito colateral: NUNCA pode abortar a venda.
  BEGIN
    SELECT COALESCE(cg.valor::numeric, 0) INTO v_taxa_global
    FROM public.configuracoes_gerais cg
    WHERE cg.chave = 'comissao_padrao_percentual' LIMIT 1;

    IF p_efetivo THEN
      SELECT EXISTS (
        SELECT 1 FROM public.comissoes_itens ci
        WHERE ci.venda_id = p_venda_id
      ) INTO v_tem_snapshot;
    END IF;

    IF p_efetivo AND v_tem_snapshot THEN
      -- CAMINHO HISTORICO: nenhuma regra, custo ou configuracao atual e lida.
      -- Quantidade remanescente e o unico dado do presente que entra.
      FOR r IN
        SELECT ci.item_venda_id, ci.quantidade, ci.preco_unitario, ci.tipo_calculo,
               ci.percentual_aplicado, ci.valor_unitario_fixo, ci.regra_id
        FROM public.comissoes_itens ci
        WHERE ci.venda_id = p_venda_id
        ORDER BY ci.item_venda_id
      LOOP
        v_qtd := internal.comissao_quantidade_efetiva(r.item_venda_id, r.quantidade, v_cancelada);
        IF COALESCE(v_qtd, 0) <= 0 THEN CONTINUE; END IF;
        v_base  := v_base + ROUND(v_qtd * r.preco_unitario, 2);
        v_total := v_total + internal.comissao_valor_item(
          v_qtd, r.preco_unitario, r.tipo_calculo, r.percentual_aplicado, r.valor_unitario_fixo);
        v_taxa  := r.percentual_aplicado;
        v_regra := r.regra_id;
      END LOOP;
    ELSE
      -- Apuracao original (p_efetivo=false) ou comissao legada sem snapshot.
      FOR r IN SELECT * FROM internal.resolver_comissao_itens_venda(p_venda_id)
      LOOP
        v_qtd := CASE
          WHEN p_efetivo THEN internal.comissao_quantidade_efetiva(
            r.o_item_venda_id, r.o_quantidade, v_cancelada)
          ELSE r.o_quantidade
        END;
        IF COALESCE(v_qtd, 0) <= 0 THEN CONTINUE; END IF;
        v_base  := v_base + ROUND(v_qtd * r.o_preco_unitario, 2);
        v_total := v_total + internal.comissao_valor_item(
          v_qtd, r.o_preco_unitario, r.o_tipo_calculo, r.o_percentual, r.o_valor_unitario_fixo);
        v_taxa  := r.o_percentual;
        v_regra := r.o_regra_id;
      END LOOP;
    END IF;

    o_valor := GREATEST(0, v_total);
    o_base  := v_base;
    o_taxa  := COALESCE(v_taxa, v_taxa_global);
    o_regra := v_regra;
    -- RETURNS TABLE em PL/pgSQL so emite linha com RETURN NEXT.
    RETURN NEXT;

  EXCEPTION WHEN OTHERS THEN
    -- Falha na apuracao de comissao nao derruba a finalizacao da venda
    RETURN;
  END;

  RETURN;
END;
$fn$;

COMMENT ON FUNCTION internal.calcular_comissao_venda(uuid, boolean) IS
  'Formula unica de comissao. p_efetivo=false resolve as regras e usa quantidades vendidas; true reconstroi pelo snapshot congelado e usa quantidades remanescentes.';

REVOKE ALL ON FUNCTION internal.calcular_comissao_venda(uuid, boolean) FROM PUBLIC, anon, authenticated;

-- ===========================================================================
-- 5) Apuracao: grava o snapshot e deriva o cabecalho dele
-- ===========================================================================

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
  v_comissao_id uuid;
  v_taxa_global numeric(10,4) := 0;
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
        regra_id = EXCLUDED.regra_id
  RETURNING id INTO v_comissao_id;

  -- Congelamento por item. `DO NOTHING` e a garantia estrutural de que uma
  -- reexecucao nao reescreve o passado: item ja congelado permanece como esta,
  -- item novo entra com os fatos do momento em que existiu.
  INSERT INTO public.comissoes_itens (
    comissao_id, venda_id, item_venda_id, produto_id, quantidade, preco_unitario,
    base_elegivel, origem_regra, regra_id, tipo_calculo, percentual_aplicado,
    valor_unitario_fixo, valor_comissao
  )
  SELECT
    v_comissao_id, p_venda_id, r.o_item_venda_id, r.o_produto_id,
    r.o_quantidade, r.o_preco_unitario,
    ROUND(r.o_quantidade * r.o_preco_unitario, 2),
    r.o_origem_regra, r.o_regra_id, r.o_tipo_calculo, r.o_percentual,
    r.o_valor_unitario_fixo,
    internal.comissao_valor_item(r.o_quantidade, r.o_preco_unitario,
      r.o_tipo_calculo, r.o_percentual, r.o_valor_unitario_fixo)
  FROM internal.resolver_comissao_itens_venda(p_venda_id) r
  WHERE COALESCE(r.o_quantidade, 0) > 0
  ON CONFLICT (comissao_id, item_venda_id) DO NOTHING;

  SELECT COALESCE(cg.valor::numeric, 0) INTO v_taxa_global
  FROM public.configuracoes_gerais cg
  WHERE cg.chave = 'comissao_padrao_percentual' LIMIT 1;

  -- O cabecalho e consequencia do snapshot, nao das regras de hoje. Sem isto,
  -- uma reexecucao apos mudanca de taxa reescreveria o fato original.
  UPDATE public.comissoes_vendedores cv
  SET valor_comissao = COALESCE((
        SELECT GREATEST(0, SUM(ci.valor_comissao))
        FROM public.comissoes_itens ci WHERE ci.comissao_id = v_comissao_id), 0),
      base_calculo = COALESCE((
        SELECT SUM(ci.base_elegivel)
        FROM public.comissoes_itens ci WHERE ci.comissao_id = v_comissao_id), 0),
      percentual_aplicado = COALESCE((
        SELECT ci.percentual_aplicado FROM public.comissoes_itens ci
        WHERE ci.comissao_id = v_comissao_id
        ORDER BY ci.item_venda_id DESC LIMIT 1), v_taxa_global),
      regra_id = (
        SELECT ci.regra_id FROM public.comissoes_itens ci
        WHERE ci.comissao_id = v_comissao_id
        ORDER BY ci.item_venda_id DESC LIMIT 1)
  WHERE cv.id = v_comissao_id;
END;
$fn$;

COMMENT ON FUNCTION public.processar_comissao_venda(uuid) IS
  'Apura a comissao da venda concluida, congela os fatos por item em comissoes_itens e deriva o cabecalho do snapshot.';

COMMIT;
