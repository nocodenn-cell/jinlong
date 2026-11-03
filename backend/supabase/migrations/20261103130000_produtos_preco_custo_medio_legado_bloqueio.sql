-- ============================================================================
-- ADR-008 Emenda 1 · T2 — bloqueio de novas gravações em produtos.preco_custo_medio.
--
-- A coluna é legada: o custo médio oficial passa a ser estoque.custo_medio (fase 2).
-- Esta migration não remove a coluna, não altera valores, não altera estoque, custo
-- publicado (preco_custo) ou precificação.
--
-- Regra (BEFORE INSERT OR UPDATE OF preco_custo_medio, todos os roles):
--   INSERT: somente 0 é aceito. NULL e qualquer outro valor são rejeitados.
--   UPDATE: somente o valor atual (IS DISTINCT FROM) é aceito. Reenvio do mesmo valor passa.
--   Atualização de outras colunas não dispara o trigger (UPDATE OF) e não é afetada.
--
-- Registro de tentativa: RAISE WARNING no log do banco (usuário, produto, valor tentado).
-- Sem tabela nova: a própria ocorrência fica no log de erros do Postgres, e o erro
-- PRODUTO_CUSTO_MEDIO_LEGADO é devolvido ao chamador.
-- ============================================================================
BEGIN;

CREATE OR REPLACE FUNCTION public.trg_produtos_custo_medio_legado_bloqueio()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.preco_custo_medio IS DISTINCT FROM 0 THEN
      RAISE WARNING 'PRODUTO_CUSTO_MEDIO_LEGADO tentativa=INSERT usuario=% produto=% valor=%',
        auth.uid(), NEW.id, NEW.preco_custo_medio;
      RAISE EXCEPTION 'PRODUTO_CUSTO_MEDIO_LEGADO' USING ERRCODE = 'check_violation';
    END IF;
  ELSIF NEW.preco_custo_medio IS DISTINCT FROM OLD.preco_custo_medio THEN
    RAISE WARNING 'PRODUTO_CUSTO_MEDIO_LEGADO tentativa=UPDATE usuario=% produto=% de=% para=%',
      auth.uid(), OLD.id, OLD.preco_custo_medio, NEW.preco_custo_medio;
    RAISE EXCEPTION 'PRODUTO_CUSTO_MEDIO_LEGADO' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.trg_produtos_custo_medio_legado_bloqueio() FROM PUBLIC, anon;

DROP TRIGGER IF EXISTS trg_produtos_custo_medio_legado_bloqueio ON public.produtos;
CREATE TRIGGER trg_produtos_custo_medio_legado_bloqueio
  BEFORE INSERT OR UPDATE OF preco_custo_medio ON public.produtos
  FOR EACH ROW EXECUTE FUNCTION public.trg_produtos_custo_medio_legado_bloqueio();

COMMENT ON COLUMN public.produtos.preco_custo_medio IS
  'DEPRECATED (ADR-008 Emenda 1). Campo legado: não aceita novas gravações (trigger trg_produtos_custo_medio_legado_bloqueio). Custo médio oficial: estoque.custo_medio (fase 2).';

COMMIT;
