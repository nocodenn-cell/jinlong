-- D1 (PLANO_LIBERACAO_PRIMEIRO_CLIENTE_2026-11-06, P0-6 / D-06 aprovado):
-- Fechamento de caixa é recusado enquanto houver venda EM_ESPERA do turno.
--
-- Por que trigger e não nova versão de função: o fechamento tem duas RPCs
-- (fechar_caixa_atomico, usada pelo web; fechar_caixa_pdv_atomico, usada pelo
-- sync do PDV local). Uma regra em caixas cobre as duas sem copiar corpos
-- grandes e sem risco de divergir entre elas (SSoT).
--
-- Escopo da espera vinculada ao caixa:
--   (a) vendas_em_espera.caixa_id = caixa; ou
--   (b) caixa_id NULL, mesma loja e mesmo operador do caixa (espera criada sem caixa).
-- Não altera dados existentes. Só bloqueia a transição ABERTO -> FECHADO.

CREATE OR REPLACE FUNCTION internal.bloqueia_fechamento_com_venda_em_espera()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_qtd integer;
BEGIN
  IF NEW.status = 'FECHADO' AND OLD.status IS DISTINCT FROM 'FECHADO' THEN
    SELECT COUNT(*)::integer INTO v_qtd
    FROM public.vendas_em_espera v
    WHERE v.status = 'EM_ESPERA'
      AND v.loja_id = NEW.loja_id
      AND (
        v.caixa_id = NEW.id
        OR (v.caixa_id IS NULL AND v.operador_id = NEW.operador_id)
      );

    IF v_qtd > 0 THEN
      RAISE EXCEPTION 'FECHAR_CAIXA_VENDAS_EM_ESPERA'
        USING DETAIL = format('vendas_em_espera=%s', v_qtd),
              HINT = 'Converta, retome ou descarte as vendas em espera antes de fechar o caixa.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION internal.bloqueia_fechamento_com_venda_em_espera() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_caixas_bloqueia_fechamento_em_espera ON public.caixas;
CREATE TRIGGER trg_caixas_bloqueia_fechamento_em_espera
  BEFORE UPDATE OF status ON public.caixas
  FOR EACH ROW
  EXECUTE FUNCTION internal.bloqueia_fechamento_com_venda_em_espera();

COMMENT ON FUNCTION internal.bloqueia_fechamento_com_venda_em_espera() IS
  'D-06: recusa ABERTO->FECHADO com venda EM_ESPERA do turno (caixa_id ou operador sem caixa).';
