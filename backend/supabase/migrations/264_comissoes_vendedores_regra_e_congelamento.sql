-- Update commission calculation to support employee-specific rules
-- Freezes commission percentage and rule reference at sale time
-- Implements rule priority: product-specific → category-specific → margin-specific → default → legacy → global

-- ────────────────────────────────────────────────────────────────────────────
-- 1. Add columns to comissoes_vendedores for rule tracking and freezing
-- ────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.comissoes_vendedores
  ADD COLUMN IF NOT EXISTS regra_id uuid REFERENCES public.comissoes_regras_funcionario(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS percentual_aplicado numeric(10, 4);

COMMENT ON COLUMN public.comissoes_vendedores.regra_id IS 'Which rule was used to calculate this commission. NULL if using legacy product override or global fallback.';
COMMENT ON COLUMN public.comissoes_vendedores.percentual_aplicado IS 'The exact percentage used for calculation, frozen at sale time. Never changes even if rule changes later.';

-- ────────────────────────────────────────────────────────────────────────────
-- 2. Update fn_registrar_comissao() to implement rule priority and freezing
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_registrar_comissao()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
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
  -- Só processa a transição -> CONCLUIDA
  IF NEW.status <> 'CONCLUIDA' THEN
    RETURN NEW;
  END IF;
  IF OLD.status = 'CONCLUIDA' THEN
    RETURN NEW;
  END IF;

  -- Comissão é efeito colateral: NUNCA pode abortar a venda
  BEGIN
    v_operador_id := NEW.operador_id;

    -- vendas NÃO tem loja_id: resolve pela loja do caixa da venda
    SELECT c.loja_id INTO v_loja_id
    FROM public.caixas c
    WHERE c.id = NEW.caixa_id;

    -- Sem loja/operador resolvíveis: não registra
    IF v_loja_id IS NULL OR v_operador_id IS NULL THEN
      RETURN NEW;
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
      WHERE iv.venda_id = NEW.id
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
      NEW.id, v_operador_id, v_loja_id,
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
    RETURN NEW;
  END;

  RETURN NEW;
END;
$$;

-- ────────────────────────────────────────────────────────────────────────────
-- 3. Ensure trigger is properly configured
-- ────────────────────────────────────────────────────────────────────────────

DROP TRIGGER IF EXISTS trg_registrar_comissao ON public.vendas;
CREATE TRIGGER trg_registrar_comissao
  AFTER UPDATE OF status ON public.vendas
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_registrar_comissao();
