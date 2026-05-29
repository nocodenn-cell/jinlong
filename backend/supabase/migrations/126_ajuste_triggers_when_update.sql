-- Migration 126: restringe os triggers de margem (124/125) a UPDATEs que mexem em preço.
--
-- Problema (achado em code review): os triggers de margem das migrations 124 e 125 eram
-- BEFORE INSERT OR UPDATE sem cláusula WHEN. Num BEFORE UPDATE, NEW contém a linha inteira,
-- então o guard rodava em QUALQUER update — inclusive operações legítimas que não mexem
-- em preço (ex.: alternarAtivoProduto faz UPDATE só de `ativo`). Para um produto com
-- preco_custo definido e preco_varejo abaixo dele (sem override), inativar/editar o produto
-- passava a falhar com PRODUTO_VAREJO_ABAIXO_CUSTO.
--
-- Solução (padrão da migration 122): separar em dois triggers por tabela —
--   _bi: BEFORE INSERT, sempre valida (linha nova).
--   _bu: BEFORE UPDATE, valida APENAS quando colunas relevantes de preço mudam.
-- As funções de trigger (trg_fn_*_margem) permanecem inalteradas.

-- ---------------------------------------------------------------------------
-- produtos (mig 125)
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_produtos_margem_biu ON public.produtos;

DROP TRIGGER IF EXISTS trg_produtos_margem_bi ON public.produtos;
CREATE TRIGGER trg_produtos_margem_bi
  BEFORE INSERT ON public.produtos
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_fn_produtos_margem();

DROP TRIGGER IF EXISTS trg_produtos_margem_bu ON public.produtos;
CREATE TRIGGER trg_produtos_margem_bu
  BEFORE UPDATE ON public.produtos
  FOR EACH ROW
  WHEN (
    NEW.preco_varejo          IS DISTINCT FROM OLD.preco_varejo
    OR NEW.preco_atacado      IS DISTINCT FROM OLD.preco_atacado
    OR NEW.preco_custo        IS DISTINCT FROM OLD.preco_custo
    OR NEW.permitir_abaixo_custo IS DISTINCT FROM OLD.permitir_abaixo_custo
  )
  EXECUTE FUNCTION public.trg_fn_produtos_margem();

-- ---------------------------------------------------------------------------
-- regras_preco (mig 124)
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_regras_preco_margem_biu ON public.regras_preco;

DROP TRIGGER IF EXISTS trg_regras_preco_margem_bi ON public.regras_preco;
CREATE TRIGGER trg_regras_preco_margem_bi
  BEFORE INSERT ON public.regras_preco
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_fn_regras_preco_margem();

DROP TRIGGER IF EXISTS trg_regras_preco_margem_bu ON public.regras_preco;
CREATE TRIGGER trg_regras_preco_margem_bu
  BEFORE UPDATE ON public.regras_preco
  FOR EACH ROW
  WHEN (
    NEW.tipo_desconto         IS DISTINCT FROM OLD.tipo_desconto
    OR NEW.valor_desconto     IS DISTINCT FROM OLD.valor_desconto
    OR NEW.produto_id         IS DISTINCT FROM OLD.produto_id
    OR NEW.permitir_abaixo_custo IS DISTINCT FROM OLD.permitir_abaixo_custo
  )
  EXECUTE FUNCTION public.trg_fn_regras_preco_margem();

-- ---------------------------------------------------------------------------
-- precos_atacado (mig 124)
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_precos_atacado_margem_biu ON public.precos_atacado;

DROP TRIGGER IF EXISTS trg_precos_atacado_margem_bi ON public.precos_atacado;
CREATE TRIGGER trg_precos_atacado_margem_bi
  BEFORE INSERT ON public.precos_atacado
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_fn_precos_atacado_margem();

DROP TRIGGER IF EXISTS trg_precos_atacado_margem_bu ON public.precos_atacado;
CREATE TRIGGER trg_precos_atacado_margem_bu
  BEFORE UPDATE ON public.precos_atacado
  FOR EACH ROW
  WHEN (
    NEW.preco_unitario        IS DISTINCT FROM OLD.preco_unitario
    OR NEW.produto_id         IS DISTINCT FROM OLD.produto_id
    OR NEW.permitir_abaixo_custo IS DISTINCT FROM OLD.permitir_abaixo_custo
  )
  EXECUTE FUNCTION public.trg_fn_precos_atacado_margem();
