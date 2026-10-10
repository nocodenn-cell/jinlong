-- ============================================================================
-- ROLLBACK da F2 (pendentes/20261010140000_f2_custo_escala_6.sql).
-- Volta os três campos para numeric(10,2). ABORTA se algum valor tiver mais de 2 casas,
-- porque o retorno arredondaria dado real (não há rollback silencioso com perda).
-- ============================================================================
BEGIN;
SET LOCAL lock_timeout = '5s';

DO $$
DECLARE
  n bigint;
BEGIN
  SELECT (SELECT count(*) FROM public.produtos WHERE preco_custo <> round(preco_custo, 2) OR preco_custo_medio <> round(preco_custo_medio, 2))
       + (SELECT count(*) FROM public.importacoes_nfe_itens WHERE custo_unitario <> round(custo_unitario, 2))
    INTO n;
  IF n > 0 THEN
    RAISE EXCEPTION 'F2_ROLLBACK_PERDERIA_PRECISAO: % valor(es) com mais de 2 casas; decidir antes de reverter', n;
  END IF;
END $$;

DROP VIEW IF EXISTS public.produtos_custos;
DROP TRIGGER IF EXISTS trg_produtos_margem_bu ON public.produtos;

ALTER TABLE public.produtos
  ALTER COLUMN preco_custo TYPE numeric(10,2),
  ALTER COLUMN preco_custo_medio TYPE numeric(10,2);
ALTER TABLE public.importacoes_nfe_itens
  ALTER COLUMN custo_unitario TYPE numeric(10,2);

CREATE VIEW public.produtos_custos WITH (security_invoker = off) AS
 SELECT p.id AS produto_id,
    p.loja_id,
    p.preco_custo,
    p.preco_custo_medio
   FROM produtos p
     JOIN usuarios u ON u.id = (( SELECT auth.uid() AS uid)) AND COALESCE(u.ativo, false) AND (u.perfil = ANY (ARRAY['GERENTE'::text, 'DONO'::text, 'ADMIN'::text])) AND (u.perfil = 'ADMIN'::text OR u.loja_id = p.loja_id)
  WHERE p.loja_id = ANY ((SELECT public.fp_lojas_cerca())::uuid[]);
COMMENT ON VIEW public.produtos_custos IS
  'Custo de aquisição por produto, SOMENTE para GERENTE/DONO ativos da loja e ADMIN ativo (0 linhas para OPERADOR/inativo). Única via de leitura do custo para usuários autenticados; produtos.preco_custo tem SELECT revogado.';
REVOKE ALL ON public.produtos_custos FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.produtos_custos TO authenticated;
GRANT ALL ON public.produtos_custos TO service_role;

CREATE TRIGGER trg_produtos_margem_bu BEFORE UPDATE ON public.produtos FOR EACH ROW
  WHEN (((new.preco_varejo IS DISTINCT FROM old.preco_varejo) OR (new.preco_atacado IS DISTINCT FROM old.preco_atacado) OR (new.preco_custo IS DISTINCT FROM old.preco_custo) OR (new.permitir_abaixo_custo IS DISTINCT FROM old.permitir_abaixo_custo)))
  EXECUTE FUNCTION trg_fn_produtos_margem();

-- Definições anteriores (extraídas do banco F1 local)
CREATE OR REPLACE FUNCTION public.trg_fn_precos_atacado_margem()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
        'Preço de atacado (%s) abaixo do custo (%s) do produto %s. '
        'Defina permitir_abaixo_custo = true para autorizar margem negativa.',
        round(NEW.preco_unitario, 2), round(v_custo, 2), NEW.produto_id
      );
  END IF;

  RETURN NEW;
END;
$function$

;
CREATE OR REPLACE FUNCTION public.trg_fn_regras_preco_margem()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
        'Preço de venda efetivo (%s) abaixo do custo (%s) do produto %s. '
        'Defina permitir_abaixo_custo = true para autorizar margem negativa.',
        round(v_preco_efetivo, 2), round(v_custo, 2), NEW.produto_id
      );
  END IF;

  RETURN NEW;
END;
$function$

;

COMMIT;
