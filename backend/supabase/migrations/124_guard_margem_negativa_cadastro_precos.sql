-- Migration 124: guard de margem negativa no cadastro de preços (auditoria do motor, Q3).
--
-- Vulnerabilidade: nenhuma constraint/trigger impedia cadastrar regra de preço ou faixa
-- de atacado com valor de venda abaixo do preço de custo do produto. Margem negativa
-- era aceita silenciosamente.
--
-- Política (recomendação aprovada): BLOQUEIO COM OVERRIDE.
--   - Por padrão, rejeita preço de venda < preco_custo.
--   - Coluna `permitir_abaixo_custo` (default false) registra intenção explícita
--     (ex.: liquidação/queima de estoque) e isenta a checagem — decisão auditável.
--   - Produtos sem preco_custo cadastrado (NULL) ficam FORA da checagem.
--
-- Escopo: CADASTRO (regras_preco, precos_atacado). O underpricing em tempo de venda
-- já é limitado pelo trigger trg_itens_venda_limite_desconto (122) e pela revalidação
-- de piso na v3 (123).

-- ---------------------------------------------------------------------------
-- 1) Colunas de override (intenção explícita de vender abaixo do custo)
-- ---------------------------------------------------------------------------

ALTER TABLE public.regras_preco
  ADD COLUMN IF NOT EXISTS permitir_abaixo_custo boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.regras_preco.permitir_abaixo_custo IS
  'Override explícito: quando true, permite cadastrar regra com preço de venda abaixo do custo '
  '(ex.: liquidação). Default false bloqueia margem negativa silenciosa.';

ALTER TABLE public.precos_atacado
  ADD COLUMN IF NOT EXISTS permitir_abaixo_custo boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.precos_atacado.permitir_abaixo_custo IS
  'Override explícito: quando true, permite faixa de atacado com preço abaixo do custo. '
  'Default false bloqueia margem negativa silenciosa.';

-- ---------------------------------------------------------------------------
-- 2) Trigger: regras_preco abaixo do custo
--    Só regras de PRODUTO (produto_id não nulo) com preco_custo conhecido.
--    Preço efetivo: VALOR_FIXO = valor_desconto; PERCENTUAL = varejo * (1 - pct/100).
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.trg_fn_regras_preco_margem()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_varejo numeric(10,2);
  v_custo  numeric(10,2);
  v_preco_efetivo numeric(12,4);
BEGIN
  IF NEW.permitir_abaixo_custo THEN
    RETURN NEW;
  END IF;

  IF NEW.produto_id IS NULL THEN
    -- Regra de CATEGORIA abrange vários produtos: sem custo único para comparar.
    RETURN NEW;
  END IF;

  SELECT p.preco_varejo, p.preco_custo
  INTO   v_varejo, v_custo
  FROM   public.produtos p
  WHERE  p.id = NEW.produto_id;

  IF v_custo IS NULL THEN
    -- Sem custo cadastrado: fora da checagem.
    RETURN NEW;
  END IF;

  IF NEW.tipo_desconto = 'VALOR_FIXO' THEN
    v_preco_efetivo := NEW.valor_desconto;
  ELSIF NEW.tipo_desconto = 'PERCENTUAL' THEN
    v_preco_efetivo := COALESCE(v_varejo, 0) * (1 - NEW.valor_desconto / 100);
  ELSE
    RETURN NEW;
  END IF;

  IF v_preco_efetivo < v_custo THEN
    RAISE EXCEPTION 'REGRA_PRECO_ABAIXO_CUSTO'
      USING DETAIL = format(
        'Preço de venda efetivo (%.2f) abaixo do custo (%.2f) do produto %s. '
        'Defina permitir_abaixo_custo = true para autorizar margem negativa.',
        v_preco_efetivo, v_custo, NEW.produto_id
      );
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.trg_fn_regras_preco_margem() FROM PUBLIC;

COMMENT ON FUNCTION public.trg_fn_regras_preco_margem() IS
  'Trigger BEFORE INSERT/UPDATE em regras_preco: bloqueia preço de venda abaixo do custo '
  '(produtos com preco_custo conhecido), salvo permitir_abaixo_custo = true.';

DROP TRIGGER IF EXISTS trg_regras_preco_margem_biu ON public.regras_preco;
CREATE TRIGGER trg_regras_preco_margem_biu
  BEFORE INSERT OR UPDATE ON public.regras_preco
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_fn_regras_preco_margem();

-- ---------------------------------------------------------------------------
-- 3) Trigger: precos_atacado abaixo do custo
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.trg_fn_precos_atacado_margem()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_custo numeric(10,2);
BEGIN
  IF NEW.permitir_abaixo_custo THEN
    RETURN NEW;
  END IF;

  SELECT p.preco_custo
  INTO   v_custo
  FROM   public.produtos p
  WHERE  p.id = NEW.produto_id;

  IF v_custo IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.preco_unitario < v_custo THEN
    RAISE EXCEPTION 'PRECO_ATACADO_ABAIXO_CUSTO'
      USING DETAIL = format(
        'Preço de atacado (%.2f) abaixo do custo (%.2f) do produto %s. '
        'Defina permitir_abaixo_custo = true para autorizar margem negativa.',
        NEW.preco_unitario, v_custo, NEW.produto_id
      );
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.trg_fn_precos_atacado_margem() FROM PUBLIC;

COMMENT ON FUNCTION public.trg_fn_precos_atacado_margem() IS
  'Trigger BEFORE INSERT/UPDATE em precos_atacado: bloqueia preco_unitario abaixo do custo '
  '(produtos com preco_custo conhecido), salvo permitir_abaixo_custo = true.';

DROP TRIGGER IF EXISTS trg_precos_atacado_margem_biu ON public.precos_atacado;
CREATE TRIGGER trg_precos_atacado_margem_biu
  BEFORE INSERT OR UPDATE ON public.precos_atacado
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_fn_precos_atacado_margem();
