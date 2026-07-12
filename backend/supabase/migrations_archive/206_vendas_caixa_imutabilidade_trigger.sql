-- Trigger BEFORE INSERT / BEFORE UPDATE em public.vendas
-- Garante imutabilidade: rejeita inserção ou reatribuição de venda a caixa não-ABERTO.
--
-- Coordenação com fechar_caixa_atomico (migration 207):
--   • fechar_caixa_atomico adquire FOR UPDATE na linha de caixas.
--   • Este trigger usa FOR SHARE na mesma linha.
--   • FOR SHARE bloqueia enquanto FOR UPDATE está ativo → venda concorrente espera o
--     commit do fechamento e, ao desbloquear, lê status = 'FECHADO' e é rejeitada.
-- Isso elimina o TOCTOU entre o check de status e o INSERT de venda.

CREATE OR REPLACE FUNCTION public.trg_fn_vendas_caixa_aberto()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status text;
BEGIN
  IF NEW.caixa_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT c.status
  INTO v_status
  FROM public.caixas c
  WHERE c.id = NEW.caixa_id
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'VENDA_CAIXA_NAO_ENCONTRADO'
      USING HINT = 'O caixa_id informado não existe na tabela caixas.';
  END IF;

  IF v_status <> 'ABERTO' THEN
    RAISE EXCEPTION 'VENDA_CAIXA_FECHADO'
      USING HINT = 'Não é possível inserir ou reatribuir vendas a um caixa que não está ABERTO.';
  END IF;

  RETURN NEW;
END;
$$;

-- BEFORE INSERT: toda venda nova deve ter caixa ABERTO
DROP TRIGGER IF EXISTS trg_vendas_caixa_aberto_bi ON public.vendas;
CREATE TRIGGER trg_vendas_caixa_aberto_bi
  BEFORE INSERT ON public.vendas
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_fn_vendas_caixa_aberto();

-- BEFORE UPDATE: dispara apenas quando caixa_id muda (cancelamentos de status não disparam)
DROP TRIGGER IF EXISTS trg_vendas_caixa_aberto_bu ON public.vendas;
CREATE TRIGGER trg_vendas_caixa_aberto_bu
  BEFORE UPDATE ON public.vendas
  FOR EACH ROW
  WHEN (NEW.caixa_id IS DISTINCT FROM OLD.caixa_id)
  EXECUTE FUNCTION public.trg_fn_vendas_caixa_aberto();

REVOKE ALL ON FUNCTION public.trg_fn_vendas_caixa_aberto() FROM PUBLIC;

COMMENT ON FUNCTION public.trg_fn_vendas_caixa_aberto() IS
  'Trigger BEFORE INSERT/UPDATE em vendas: rejeita se caixa_id não estiver ABERTO. '
  'Usa FOR SHARE para serializar com fechar_caixa_atomico (FOR UPDATE), eliminando TOCTOU.';
