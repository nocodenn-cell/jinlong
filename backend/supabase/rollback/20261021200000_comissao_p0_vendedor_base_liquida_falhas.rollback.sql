-- Rollback de 20261021200000_comissao_p0_vendedor_base_liquida_falhas.sql
-- Restaura as funções de comissão originais (definição de produção antes do P0) e remove os objetos novos.
-- ATENÇÃO: apaga vendas.vendedor_id, comissoes_falhas e as colunas novas de snapshot (dados perdidos).
BEGIN;
CREATE OR REPLACE FUNCTION internal.calcular_comissao_venda(p_venda_id uuid, p_efetivo boolean)
 RETURNS TABLE(o_valor numeric, o_base numeric, o_taxa numeric, o_regra uuid)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_status         text;
  v_cancelada      boolean;
  v_tem_snapshot   boolean := false;
  v_total          numeric(14,2) := 0;
  v_base           numeric(14,2) := 0;
  v_taxa_global    numeric(10,4) := 0;
  v_taxa           numeric(10,4);
  v_regra          uuid;
  v_qtd            numeric;
  r                record;
BEGIN
  SELECT v.status INTO v_status FROM public.vendas v WHERE v.id = p_venda_id;
  IF NOT FOUND THEN RETURN; END IF;

  -- Apuracao original so existe na venda concluida.
  IF NOT p_efetivo AND v_status IS DISTINCT FROM 'CONCLUIDA' THEN RETURN; END IF;
  v_cancelada := (v_status = 'CANCELADA');

  -- Comissao e efeito colateral: NUNCA pode abortar a venda.
  BEGIN
    SELECT COALESCE(cg.valor::numeric, 0) INTO v_taxa_global
    FROM public.configuracoes_gerais cg
    WHERE cg.chave = 'comissao_padrao_percentual' AND cg.empresa_id = public.fp_empresa_contexto(public.fp_loja_de('venda', p_venda_id)) LIMIT 1;

    IF p_efetivo THEN
      SELECT EXISTS (
        SELECT 1 FROM public.comissoes_itens ci
        WHERE ci.venda_id = p_venda_id
      ) INTO v_tem_snapshot;
    END IF;

    IF p_efetivo AND v_tem_snapshot THEN
      -- CAMINHO HISTORICO: nenhuma regra, custo ou configuracao atual e lida.
      -- Quantidade remanescente e o unico dado do presente que entra.
      FOR r IN
        SELECT ci.item_venda_id, ci.quantidade, ci.preco_unitario, ci.tipo_calculo,
               ci.percentual_aplicado, ci.valor_unitario_fixo, ci.regra_id
        FROM public.comissoes_itens ci
        WHERE ci.venda_id = p_venda_id
        ORDER BY ci.item_venda_id
      LOOP
        v_qtd := internal.comissao_quantidade_efetiva(r.item_venda_id, r.quantidade, v_cancelada);
        IF COALESCE(v_qtd, 0) <= 0 THEN CONTINUE; END IF;
        v_base  := v_base + ROUND(v_qtd * r.preco_unitario, 2);
        v_total := v_total + internal.comissao_valor_item(
          v_qtd, r.preco_unitario, r.tipo_calculo, r.percentual_aplicado, r.valor_unitario_fixo);
        v_taxa  := r.percentual_aplicado;
        v_regra := r.regra_id;
      END LOOP;
    ELSE
      -- Apuracao original (p_efetivo=false) ou comissao legada sem snapshot.
      FOR r IN SELECT * FROM internal.resolver_comissao_itens_venda(p_venda_id)
      LOOP
        v_qtd := CASE
          WHEN p_efetivo THEN internal.comissao_quantidade_efetiva(
            r.o_item_venda_id, r.o_quantidade, v_cancelada)
          ELSE r.o_quantidade
        END;
        IF COALESCE(v_qtd, 0) <= 0 THEN CONTINUE; END IF;
        v_base  := v_base + ROUND(v_qtd * r.o_preco_unitario, 2);
        v_total := v_total + internal.comissao_valor_item(
          v_qtd, r.o_preco_unitario, r.o_tipo_calculo, r.o_percentual, r.o_valor_unitario_fixo);
        v_taxa  := r.o_percentual;
        v_regra := r.o_regra_id;
      END LOOP;
    END IF;

    o_valor := GREATEST(0, v_total);
    o_base  := v_base;
    o_taxa  := COALESCE(v_taxa, v_taxa_global);
    o_regra := v_regra;
    -- RETURNS TABLE em PL/pgSQL so emite linha com RETURN NEXT.
    RETURN NEXT;

  EXCEPTION WHEN OTHERS THEN
    -- Falha na apuracao de comissao nao derruba a finalizacao da venda
    RETURN;
  END;

  RETURN;
END;
$function$;

CREATE OR REPLACE FUNCTION public.processar_comissao_venda(p_venda_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_status text;
BEGIN
  SELECT v.status INTO v_status FROM public.vendas v WHERE v.id = p_venda_id;
  IF NOT FOUND OR v_status IS DISTINCT FROM 'CONCLUIDA' THEN RETURN; END IF;
  PERFORM internal.apurar_comissao_original(p_venda_id);
END;
$function$;

CREATE OR REPLACE FUNCTION internal.apurar_comissao_original(p_venda_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_operador_id uuid;
  v_caixa_id uuid;
  v_loja_id uuid;
  v_comissao_id uuid;
  v_taxa_global numeric(10,4) := 0;
BEGIN
  SELECT v.operador_id, v.caixa_id INTO v_operador_id, v_caixa_id
  FROM public.vendas v WHERE v.id = p_venda_id;
  IF NOT FOUND OR v_operador_id IS NULL THEN RETURN NULL; END IF;

  -- vendas NAO tem loja_id: resolve pela loja do caixa da venda
  SELECT c.loja_id INTO v_loja_id FROM public.caixas c WHERE c.id = v_caixa_id;
  IF v_loja_id IS NULL THEN RETURN NULL; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM internal.resolver_comissao_itens_venda(p_venda_id) r
    WHERE COALESCE(r.o_quantidade, 0) > 0
  ) THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.comissoes_vendedores (
    venda_id, operador_id, loja_id, valor_comissao, base_calculo, status
  ) VALUES (
    p_venda_id, v_operador_id, v_loja_id, 0, 0, 'pendente'
  )
  ON CONFLICT (venda_id, operador_id) DO UPDATE SET venda_id = EXCLUDED.venda_id
  RETURNING id INTO v_comissao_id;

  -- Congelamento por item -- mesma garantia de DB-05C: item ja congelado
  -- permanece como esta, item novo entra com os fatos do momento em que
  -- existiu.
  INSERT INTO public.comissoes_itens (
    comissao_id, venda_id, item_venda_id, produto_id, quantidade, preco_unitario,
    base_elegivel, origem_regra, regra_id, tipo_calculo, percentual_aplicado,
    valor_unitario_fixo, valor_comissao
  )
  SELECT
    v_comissao_id, p_venda_id, r.o_item_venda_id, r.o_produto_id,
    r.o_quantidade, r.o_preco_unitario,
    ROUND(r.o_quantidade * r.o_preco_unitario, 2),
    r.o_origem_regra, r.o_regra_id, r.o_tipo_calculo, r.o_percentual,
    r.o_valor_unitario_fixo,
    internal.comissao_valor_item(r.o_quantidade, r.o_preco_unitario,
      r.o_tipo_calculo, r.o_percentual, r.o_valor_unitario_fixo)
  FROM internal.resolver_comissao_itens_venda(p_venda_id) r
  WHERE COALESCE(r.o_quantidade, 0) > 0
  ON CONFLICT (comissao_id, item_venda_id) DO NOTHING;

  SELECT COALESCE(cg.valor::numeric, 0) INTO v_taxa_global
  FROM public.configuracoes_gerais cg
  WHERE cg.chave = 'comissao_padrao_percentual' AND cg.empresa_id = public.fp_empresa_contexto(public.fp_loja_de('venda', p_venda_id)) LIMIT 1;

  -- Cabecalho como consequencia do snapshot -- idempotente por construcao:
  -- rederivar da MESMA soma nunca reescreve o fato historico.
  UPDATE public.comissoes_vendedores cv
  SET valor_comissao = COALESCE((
        SELECT GREATEST(0, SUM(ci.valor_comissao))
        FROM public.comissoes_itens ci WHERE ci.comissao_id = v_comissao_id), 0),
      base_calculo = COALESCE((
        SELECT SUM(ci.base_elegivel)
        FROM public.comissoes_itens ci WHERE ci.comissao_id = v_comissao_id), 0),
      percentual_aplicado = COALESCE((
        SELECT ci.percentual_aplicado FROM public.comissoes_itens ci
        WHERE ci.comissao_id = v_comissao_id
        ORDER BY ci.item_venda_id DESC LIMIT 1), v_taxa_global),
      regra_id = (
        SELECT ci.regra_id FROM public.comissoes_itens ci
        WHERE ci.comissao_id = v_comissao_id
        ORDER BY ci.item_venda_id DESC LIMIT 1)
  WHERE cv.id = v_comissao_id;

  RETURN v_comissao_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.processar_ajuste_comissao_venda(p_venda_id uuid, p_tipo text, p_origem_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_com public.comissoes_vendedores%ROWTYPE;
  v_efetivo record;
  v_alvo numeric(14,2);
  v_ja numeric(14,2);
  v_delta numeric(14,2);
  v_key text;
BEGIN
  IF p_tipo NOT IN ('CANCELAMENTO', 'DEVOLUCAO', 'TROCA') THEN
    RAISE EXCEPTION 'COMISSAO_AJUSTE_TIPO_INVALIDO';
  END IF;

  -- Sem comissao apurada nao ha o que compensar.
  SELECT * INTO v_com FROM public.comissoes_vendedores cv
  WHERE cv.venda_id = p_venda_id
  FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;

  v_key := p_tipo || ':' || COALESCE(p_origem_id, p_venda_id)::text;

  -- Retry do mesmo fato logico: nada a fazer.
  IF EXISTS (SELECT 1 FROM public.comissoes_ajustes a WHERE a.idempotency_key = v_key) THEN
    RETURN;
  END IF;

  SELECT * INTO v_efetivo FROM internal.calcular_comissao_venda(p_venda_id, true);

  v_alvo := GREATEST(0, v_com.valor_comissao - COALESCE(v_efetivo.o_valor, 0));
  SELECT COALESCE(SUM(a.valor), 0) INTO v_ja
  FROM public.comissoes_ajustes a WHERE a.comissao_id = v_com.id;
  v_delta := public.round_abnt(v_alvo - v_ja, 2);

  IF v_delta <= 0 THEN RETURN; END IF;

  INSERT INTO public.comissoes_ajustes (
    comissao_id, venda_id, operador_id, loja_id, tipo, valor, origem_id, idempotency_key
  ) VALUES (
    v_com.id, p_venda_id, v_com.operador_id, v_com.loja_id, p_tipo, v_delta, p_origem_id, v_key
  )
  ON CONFLICT (idempotency_key) DO NOTHING;
END;
$function$;

DROP FUNCTION IF EXISTS public.reprocessar_comissao_venda(uuid);
DROP FUNCTION IF EXISTS public.listar_vendedores_loja(uuid);
DROP FUNCTION IF EXISTS public.definir_vendedor_venda_pdv(uuid, uuid);
DROP FUNCTION IF EXISTS public.definir_vendedor_venda(uuid, uuid);
DROP FUNCTION IF EXISTS internal.definir_vendedor_venda_core(uuid, uuid);
DROP FUNCTION IF EXISTS internal.comissao_bloqueio_reatribuicao(uuid);
DROP FUNCTION IF EXISTS internal.resolver_comissao_itens_venda_v2(uuid);
DROP FUNCTION IF EXISTS internal.resolver_comissao_itens_venda_vendedor(uuid, uuid);
DROP FUNCTION IF EXISTS internal.comissao_canal_item(text);
DROP FUNCTION IF EXISTS internal.comissao_regra_empresa(uuid, uuid, uuid, text, date);
DROP FUNCTION IF EXISTS internal.comissao_cargo_usuario(uuid);
DROP FUNCTION IF EXISTS internal.comissao_valor_item_liquido(numeric, numeric, numeric, text, numeric, numeric);
DROP FUNCTION IF EXISTS internal.comissao_desconto_rateado_venda(uuid);
DROP FUNCTION IF EXISTS internal.comissao_base_liquida(uuid);
DROP FUNCTION IF EXISTS internal.comissao_ratear_centavos(numeric[], numeric);
DROP FUNCTION IF EXISTS internal.comissao_resolver_falhas(uuid, text, uuid);
DROP FUNCTION IF EXISTS internal.comissao_registrar_falha(uuid, text, text, text);
DROP TABLE IF EXISTS public.comissoes_falhas;
DROP TABLE IF EXISTS public.comissoes_config;
DROP FUNCTION IF EXISTS internal.comissao_eh_gestor(uuid);
ALTER TABLE public.comissoes_itens DROP CONSTRAINT IF EXISTS comissoes_itens_origem_check;
ALTER TABLE public.comissoes_itens ADD CONSTRAINT comissoes_itens_origem_check CHECK (origem_regra = ANY (ARRAY[
  'REGRA_PRODUTO','REGRA_CATEGORIA','REGRA_MARGEM','REGRA_PADRAO','PRODUTO_PERCENTUAL','PRODUTO_FIXO','GLOBAL'])) NOT VALID;
ALTER TABLE public.comissoes_itens DROP COLUMN IF EXISTS regra_empresa_id;
ALTER TABLE public.comissoes_itens DROP COLUMN IF EXISTS canal;
ALTER TABLE public.comissoes_itens DROP COLUMN IF EXISTS desconto_rateado;
ALTER TABLE public.comissoes_vendedores DROP COLUMN IF EXISTS regra_mista;
DROP INDEX IF EXISTS public.vendas_vendedor_id_idx;
ALTER TABLE public.vendas DROP COLUMN IF EXISTS vendedor_id;
COMMIT;
