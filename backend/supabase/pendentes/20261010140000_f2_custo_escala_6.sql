-- ============================================================================
-- F2 — Escala de custo unitário dos campos legados do ERP: numeric(10,2) → numeric(14,6)
-- (D4: seis casas para custo unitário de alta precisão).
--
-- >>> PENDENTE — NÃO ESTÁ EM supabase/migrations/. GATE F2 BLOQUEADO (doc 16). <<<
-- Motivo: o risco operacional ainda não foi resolvido. 32 consumidores TypeScript e o
-- formulário de produto trabalham com custo em 2 casas. Quando existir um custo com 6 casas,
-- editar o produto e salvar outro campo pode arredondá-lo em silêncio. A ativação exige
-- antes a etapa de UI e de gravadores (doc 16 §4). Este arquivo foi preparado, medido e
-- testado em banco local.
--
-- Estratégia expand-and-contract, etapa EXPAND:
--   * amplia SÓ a capacidade: produtos.preco_custo, produtos.preco_custo_medio,
--     importacoes_nfe_itens.custo_unitario. Valores existentes ficam preservados
--     (numeric(10,2) ⊂ numeric(14,6)); o teste confere linha a linha.
--   * itens_venda.custo_unitario_snap NÃO é alterado: é histórico de vendas, a tabela é
--     grande e a necessidade não foi demonstrada (snapshot monetário em 2 casas).
--   * importar_nfe_transacao continua gravando o custo com 2 casas: a ativação de 6 casas
--     é a etapa seguinte, junto com a UI. Preços de venda não mudam.
--   * margens: tira a variável numeric(10,2) que arredondava o custo antes da comparação.
--
-- Locks: ALTER TYPE com mudança de escala REESCREVE a tabela sob ACCESS EXCLUSIVE.
-- lock_timeout curto faz a migration falhar em vez de enfileirar atrás de transações
-- longas. Tempo medido em volume representativo: doc 16 §3.
-- Rollback: backend/supabase/pendentes/20261010140000_f2_custo_escala_6.rollback.sql
-- ============================================================================
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '15min';

-- 1. Dependentes que impedem ALTER TYPE
DROP VIEW IF EXISTS public.produtos_custos;
DROP TRIGGER IF EXISTS trg_produtos_margem_bu ON public.produtos;

-- 2. Expansão de capacidade
ALTER TABLE public.produtos
  ALTER COLUMN preco_custo TYPE numeric(14,6),
  ALTER COLUMN preco_custo_medio TYPE numeric(14,6);
ALTER TABLE public.importacoes_nfe_itens
  ALTER COLUMN custo_unitario TYPE numeric(14,6);

-- 3. Recria a view (definição F1, com a cerca) e os grants (20261009180000)
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

-- 4. Recria o trigger de margem com o mesmo WHEN
CREATE TRIGGER trg_produtos_margem_bu BEFORE UPDATE ON public.produtos FOR EACH ROW
  WHEN (((new.preco_varejo IS DISTINCT FROM old.preco_varejo) OR (new.preco_atacado IS DISTINCT FROM old.preco_atacado) OR (new.preco_custo IS DISTINCT FROM old.preco_custo) OR (new.permitir_abaixo_custo IS DISTINCT FROM old.permitir_abaixo_custo)))
  EXECUTE FUNCTION trg_fn_produtos_margem();

-- 5. Margens sem arredondamento prematuro do custo (antes: v_custo numeric(10,2))
CREATE OR REPLACE FUNCTION public.trg_fn_precos_atacado_margem()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_custo numeric;
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
        round(NEW.preco_unitario, 2), round(v_custo, 6), NEW.produto_id
      );
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.trg_fn_regras_preco_margem()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_varejo numeric(10,2);
  v_custo  numeric;
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
        round(v_preco_efetivo, 2), round(v_custo, 6), NEW.produto_id
      );
  END IF;

  RETURN NEW;
END;
$function$;

COMMIT;
