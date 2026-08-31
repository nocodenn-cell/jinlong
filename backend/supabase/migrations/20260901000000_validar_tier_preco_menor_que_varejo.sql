-- ID 44: Validação — tier.preco_unitario sempre < produtos.preco_varejo
-- Impede criação/atualização de tiers com preço >= varejo (ilógico economicamente).
--
-- NOTA: um CHECK constraint não pode referenciar outra tabela via subquery —
-- Postgres rejeita `CHECK ((SELECT ... FROM outra_tabela))`. A validação
-- cross-table precisa de trigger BEFORE INSERT/UPDATE.

BEGIN;

CREATE OR REPLACE FUNCTION public.validar_tier_preco_menor_que_varejo()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_preco_varejo numeric;
BEGIN
  SELECT p.preco_varejo INTO v_preco_varejo
  FROM public.produtos p
  WHERE p.id = NEW.produto_id;

  IF v_preco_varejo IS NOT NULL AND NEW.preco_unitario >= v_preco_varejo THEN
    RAISE EXCEPTION 'TIER_PRECO_MAIOR_OU_IGUAL_VAREJO: preco_unitario (%) deve ser menor que preco_varejo (%) do produto %',
      NEW.preco_unitario, v_preco_varejo, NEW.produto_id
      USING ERRCODE = '23514'; -- check_violation, mesmo código de um CHECK constraint
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.validar_tier_preco_menor_que_varejo() IS
  'ID 44: Rejeita INSERT/UPDATE em precos_atacado quando preco_unitario >= preco_varejo do produto. Trigger (não CHECK) por exigir leitura de outra tabela.';

DROP TRIGGER IF EXISTS trg_validar_tier_preco_menor_que_varejo ON public.precos_atacado;
CREATE TRIGGER trg_validar_tier_preco_menor_que_varejo
  BEFORE INSERT OR UPDATE OF preco_unitario, produto_id ON public.precos_atacado
  FOR EACH ROW EXECUTE FUNCTION public.validar_tier_preco_menor_que_varejo();

COMMIT;
