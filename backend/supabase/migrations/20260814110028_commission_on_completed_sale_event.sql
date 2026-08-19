-- FIN-298-03: comissão passa a nascer também quando a venda entra já CONCLUIDA.
--
-- Problema comprovado na reauditoria adversarial:
--
--   trg_registrar_comissao  AFTER UPDATE OF status ON vendas
--   venda ONLINE  (v4)                        -> comissões geradas: 0
--   venda OFFLINE (registrar_venda_com_itens) -> comissões geradas: 0
--   ambas inseridas com status='CONCLUIDA'
--
-- O trigger só dispara em transição de status. Os dois escritores canônicos
-- inserem a venda já concluída, então o evento nunca ocorre e nenhuma comissão
-- é criada em nenhum caminho.
--
-- Por que não um AFTER INSERT em `vendas`: o cabeçalho é inserido ANTES dos
-- itens, e a apuração lê `itens_venda`. Um trigger de INSERT na venda apuraria
-- base zero.
--
-- Correção mínima, um único sistema de comissão com dois eventos:
--   1. `processar_comissao_venda(venda_id)` recebe o corpo que já existia no
--      trigger — mesmo cálculo, mesmas regras, mesma ordem de prioridade.
--      Nada foi reescrito: o corpo foi extraído do catálogo e teve apenas as
--      referências de trigger (`NEW`/`OLD`) trocadas por leitura do cabeçalho.
--   2. `fn_registrar_comissao` vira um invólucro fino e continua atendendo
--      `AFTER UPDATE OF status` — cobre venda que nasce em outro estado e
--      depois é concluída.
--   3. Novo trigger de NÍVEL DE INSTRUÇÃO em `itens_venda AFTER INSERT`, com
--      tabela de transição: dispara uma vez por instrução, quando todos os
--      itens da venda já existem. Cobre a venda que entra já CONCLUIDA.
--      Ambos os escritores inserem os itens numa única instrução.
--
-- Sem duplicação: `comissoes_vendedores` tem UNIQUE (venda_id, operador_id) e a
-- apuração termina em `ON CONFLICT ... DO UPDATE`. Se os dois eventos ocorrerem
-- para a mesma venda, o resultado converge para a mesma linha.
--
-- Comissão continua sendo efeito colateral: a função preserva o
-- `EXCEPTION WHEN OTHERS` que impede a apuração de derrubar a venda.
--
-- Cancelamento e devolução não são tocados aqui — o ajuste pós-venda (DB-05)
-- segue pendente e fora do escopo desta unidade.
--
-- ROLLBACK:
--   DROP TRIGGER trg_itens_venda_comissao ON public.itens_venda;
--   DROP FUNCTION public.trg_comissao_apos_itens();
--   DROP FUNCTION public.processar_comissao_venda(uuid);
--   e restaurar o corpo original de fn_registrar_comissao (migration 261).

BEGIN;

CREATE OR REPLACE FUNCTION public.processar_comissao_venda(p_venda_id uuid)
RETURNS void
LANGUAGE plpgsql
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
  IF v_status IS DISTINCT FROM 'CONCLUIDA' THEN
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
      SELECT iv.quantidade, iv.preco_unitario, p.comissao_tipo, p.comissao_valor, p.preco_custo, iv.produto_id, p.categoria_id
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

    -- Insert or update comissoes_vendedores
    -- Note: We only freeze the percentual_aplicado and regra_id for the first item's rule
    -- (assumes all items use the same employee rule in most cases; could be refined later)
    INSERT INTO public.comissoes_vendedores (
      venda_id, operador_id, loja_id, valor_comissao, base_calculo, percentual_aplicado, regra_id, status
    )
    VALUES (
      p_venda_id, v_operador_id, v_loja_id,
      GREATEST(0, v_total_comissao), v_base_calculo,
      COALESCE(v_taxa_aplicada, v_taxa_global), v_regra_id, 'pendente'
    )
    ON CONFLICT (venda_id, operador_id) DO UPDATE
      SET valor_comissao = EXCLUDED.valor_comissao,
          base_calculo = EXCLUDED.base_calculo,
          percentual_aplicado = EXCLUDED.percentual_aplicado,
          regra_id = EXCLUDED.regra_id;

  EXCEPTION WHEN OTHERS THEN
    -- Falha na apuração de comissão não derruba a finalização da venda
    RETURN;
  END;

  RETURN;
END;

$fn$;

COMMENT ON FUNCTION public.processar_comissao_venda(uuid) IS
  'Apuracao canonica de comissao de uma venda concluida. Idempotente por UNIQUE (venda_id, operador_id).';

REVOKE ALL ON FUNCTION public.processar_comissao_venda(uuid) FROM PUBLIC, anon, authenticated;

-- Invólucro do evento de transição de status (comportamento preservado).
CREATE OR REPLACE FUNCTION public.fn_registrar_comissao()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  IF NEW.status = 'CONCLUIDA'
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'CONCLUIDA') THEN
    PERFORM public.processar_comissao_venda(NEW.id);
  END IF;
  RETURN NEW;
END;
$fn$;

-- Evento de venda completa: os itens da venda acabaram de ser gravados.
CREATE OR REPLACE FUNCTION public.trg_comissao_apos_itens()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_venda uuid;
BEGIN
  FOR v_venda IN SELECT DISTINCT ni.venda_id FROM novos_itens ni LOOP
    PERFORM public.processar_comissao_venda(v_venda);
  END LOOP;
  RETURN NULL;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_itens_venda_comissao ON public.itens_venda;
CREATE TRIGGER trg_itens_venda_comissao
  AFTER INSERT ON public.itens_venda
  REFERENCING NEW TABLE AS novos_itens
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.trg_comissao_apos_itens();

COMMIT;
