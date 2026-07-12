-- Migration 125: guard de margem negativa no catálogo de produtos (formulário do gerente).
--
-- Complementa a 124 (que cobre precos_atacado/regras_preco). O gerente define preço
-- pela tela de produto (produtos.preco_varejo e produtos.preco_atacado), que NÃO eram
-- cobertos por nenhuma trava de margem. Esta migration estende o guard a essas colunas.
--
-- Política (mesma da 124): BLOQUEIO COM OVERRIDE.
--   - Coluna produtos.permitir_abaixo_custo (default false) registra intenção explícita.
--   - Produtos sem preco_custo (NULL) ficam fora da checagem.
--   - Verifica preco_varejo e preco_atacado (quando informado) contra preco_custo.

-- ---------------------------------------------------------------------------
-- 1) Coluna de override no produto
-- ---------------------------------------------------------------------------

ALTER TABLE public.produtos
  ADD COLUMN IF NOT EXISTS permitir_abaixo_custo boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.produtos.permitir_abaixo_custo IS
  'Override explícito: quando true, permite preço de varejo/atacado abaixo do custo '
  '(ex.: liquidação). Default false bloqueia margem negativa silenciosa.';

-- ---------------------------------------------------------------------------
-- 2) Trigger: produtos.preco_varejo / preco_atacado abaixo do custo
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.trg_fn_produtos_margem()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.permitir_abaixo_custo THEN
    RETURN NEW;
  END IF;

  IF NEW.preco_custo IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.preco_varejo < NEW.preco_custo THEN
    RAISE EXCEPTION 'PRODUTO_VAREJO_ABAIXO_CUSTO'
      USING DETAIL = format(
        'Preço de varejo (%s) abaixo do custo (%s). '
        'Marque "permitir abaixo do custo" para autorizar margem negativa.',
        round(NEW.preco_varejo, 2), round(NEW.preco_custo, 2)
      );
  END IF;

  IF NEW.preco_atacado IS NOT NULL AND NEW.preco_atacado < NEW.preco_custo THEN
    RAISE EXCEPTION 'PRODUTO_ATACADO_ABAIXO_CUSTO'
      USING DETAIL = format(
        'Preço de atacado (%s) abaixo do custo (%s). '
        'Marque "permitir abaixo do custo" para autorizar margem negativa.',
        round(NEW.preco_atacado, 2), round(NEW.preco_custo, 2)
      );
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.trg_fn_produtos_margem() FROM PUBLIC;

COMMENT ON FUNCTION public.trg_fn_produtos_margem() IS
  'Trigger BEFORE INSERT/UPDATE em produtos: bloqueia preco_varejo/preco_atacado abaixo '
  'do preco_custo (quando conhecido), salvo permitir_abaixo_custo = true.';

DROP TRIGGER IF EXISTS trg_produtos_margem_biu ON public.produtos;
CREATE TRIGGER trg_produtos_margem_biu
  BEFORE INSERT OR UPDATE ON public.produtos
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_fn_produtos_margem();
