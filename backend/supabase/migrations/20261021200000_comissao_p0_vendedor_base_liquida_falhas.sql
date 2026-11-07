-- Módulo Comissão — P0: vendedor da venda, base líquida de descontos, registro de falhas, cabeçalho honesto.
-- ADITIVA. Não reescreve a RPC canônica (finalizar_venda_transacional_canonica_v4) nem registrar_venda_com_itens(_v2):
--   * vendas.vendedor_id é opcional (NULL = operador, comportamento de sempre) e é gravado DEPOIS da venda por
--     public.definir_vendedor_venda (web) / public.definir_vendedor_venda_pdv (edge sync-outbox, service_role).
--   * Os gatilhos de comissão existentes continuam os mesmos; só as funções que eles chamam passam a:
--       - pagar ao COALESCE(vendedor_id, operador_id);
--       - ratear o desconto da venda (total dos itens − total_liquido) entre os itens, em centavos;
--       - gravar falhas em comissoes_falhas em vez de abortar/engolir;
--       - mostrar no cabeçalho a taxa efetiva e regra NULL quando a venda tem regras diferentes (regra_mista).
--   * Snapshots antigos (desconto_rateado = 0) recalculam exatamente como antes.
--   * Nada é lançado em caixa, contas a pagar ou folha.
-- Rollback: backend/supabase/rollback/20261021200000_comissao_p0_vendedor_base_liquida_falhas.rollback.sql
BEGIN;

-- 1. Vendedor da venda ---------------------------------------------------------------------------
ALTER TABLE public.vendas ADD COLUMN IF NOT EXISTS vendedor_id uuid NULL REFERENCES public.usuarios(id);
CREATE INDEX IF NOT EXISTS vendas_vendedor_id_idx ON public.vendas (vendedor_id) WHERE vendedor_id IS NOT NULL;
COMMENT ON COLUMN public.vendas.vendedor_id IS
  'Quem atendeu (comissão). NULL = o operador do caixa. Gravado por definir_vendedor_venda(_pdv).';

-- 2. Snapshot por item: desconto rateado e regra da empresa (P1) ---------------------------------
ALTER TABLE public.comissoes_itens ADD COLUMN IF NOT EXISTS desconto_rateado numeric(14,2) NOT NULL DEFAULT 0;
ALTER TABLE public.comissoes_itens ADD COLUMN IF NOT EXISTS canal text NULL;
ALTER TABLE public.comissoes_vendedores ADD COLUMN IF NOT EXISTS regra_mista boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.comissoes_vendedores.regra_mista IS
  'true = itens com regras/taxas diferentes; percentual_aplicado é a taxa efetiva (comissão/base) e regra_id fica NULL.';

-- 3. Falhas ----------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.comissoes_falhas (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venda_id         uuid NOT NULL REFERENCES public.vendas(id) ON DELETE RESTRICT,
  loja_id          uuid NULL REFERENCES public.lojas(id),
  etapa            text NOT NULL CHECK (etapa IN ('APURACAO', 'AJUSTE', 'REATRIBUICAO')),
  motivo           text NOT NULL,
  sqlstate         text NULL,
  tentativas       integer NOT NULL DEFAULT 1,
  ultima_tentativa_em timestamptz NOT NULL DEFAULT now(),
  resolvida_em     timestamptz NULL,
  resolvida_por    uuid NULL REFERENCES public.usuarios(id),
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS comissoes_falhas_aberta_uniq
  ON public.comissoes_falhas (venda_id, etapa) WHERE resolvida_em IS NULL;
CREATE INDEX IF NOT EXISTS comissoes_falhas_loja_idx ON public.comissoes_falhas (loja_id, created_at DESC);
ALTER TABLE public.comissoes_falhas ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.comissoes_falhas FROM anon, authenticated;
GRANT SELECT ON public.comissoes_falhas TO authenticated;
DROP POLICY IF EXISTS comissoes_falhas_select_gerencial ON public.comissoes_falhas;
CREATE POLICY comissoes_falhas_select_gerencial ON public.comissoes_falhas FOR SELECT TO authenticated
  USING (loja_id IS NOT NULL AND public.fp_pode_loja(loja_id, ARRAY['DONO','GERENTE']));

CREATE OR REPLACE FUNCTION internal.comissao_registrar_falha(p_venda_id uuid, p_etapa text, p_sqlstate text, p_motivo text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_loja uuid;
BEGIN
  SELECT c.loja_id INTO v_loja FROM public.vendas v LEFT JOIN public.caixas c ON c.id = v.caixa_id WHERE v.id = p_venda_id;
  INSERT INTO public.comissoes_falhas (venda_id, loja_id, etapa, motivo, sqlstate)
  VALUES (p_venda_id, v_loja, p_etapa, left(coalesce(p_motivo, '?'), 500), p_sqlstate)
  ON CONFLICT (venda_id, etapa) WHERE resolvida_em IS NULL
  DO UPDATE SET tentativas = public.comissoes_falhas.tentativas + 1, motivo = EXCLUDED.motivo,
                sqlstate = EXCLUDED.sqlstate, ultima_tentativa_em = now();
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'comissao_registrar_falha: % %', SQLSTATE, SQLERRM;  -- registrar a falha nunca derruba a venda
END $$;

CREATE OR REPLACE FUNCTION internal.comissao_resolver_falhas(p_venda_id uuid, p_etapa text, p_por uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$
  UPDATE public.comissoes_falhas SET resolvida_em = now(), resolvida_por = p_por
   WHERE venda_id = p_venda_id AND etapa = p_etapa AND resolvida_em IS NULL;
$$;

-- 4. Rateio em centavos (maiores restos; empate = menor índice) ------------------------------------
CREATE OR REPLACE FUNCTION internal.comissao_ratear_centavos(p_pesos numeric[], p_total numeric)
RETURNS numeric[] LANGUAGE plpgsql IMMUTABLE SET search_path = '' AS $$
DECLARE
  n int := coalesce(array_length(p_pesos, 1), 0);
  t bigint := round(coalesce(p_total, 0) * 100);
  w bigint[]; soma bigint := 0; parte bigint[]; resto numeric[]; dist bigint := 0; i int; k int;
  out numeric[] := '{}';
BEGIN
  IF n = 0 THEN RETURN out; END IF;
  w := array_fill(0::bigint, ARRAY[n]); parte := array_fill(0::bigint, ARRAY[n]); resto := array_fill(0::numeric, ARRAY[n]);
  FOR i IN 1..n LOOP w[i] := greatest(round(coalesce(p_pesos[i], 0) * 100), 0); soma := soma + w[i]; END LOOP;
  IF soma = 0 OR t <= 0 THEN RETURN array_fill(0::numeric, ARRAY[n]); END IF;
  t := least(t, soma);  -- desconto nunca maior que a base
  FOR i IN 1..n LOOP
    parte[i] := (t * w[i]) / soma;               -- divisão inteira = floor (valores >= 0)
    resto[i] := ((t * w[i]) % soma)::numeric;
    dist := dist + parte[i];
  END LOOP;
  FOR k IN SELECT ord FROM unnest(resto) WITH ORDINALITY AS u(r, ord) ORDER BY r DESC, ord LIMIT (t - dist) LOOP
    parte[k] := parte[k] + 1;
  END LOOP;
  FOR i IN 1..n LOOP out := out || (parte[i]::numeric / 100); END LOOP;
  RETURN out;
END $$;

-- Configuração do módulo por empresa (tabela própria; não mexe na whitelist de configuracoes_gerais).
CREATE TABLE IF NOT EXISTS public.comissoes_config (
  empresa_id  uuid PRIMARY KEY REFERENCES public.empresas(id),
  base        text NOT NULL DEFAULT 'LIQUIDA' CHECK (base IN ('LIQUIDA', 'BRUTA')),
  updated_by  uuid NULL REFERENCES public.usuarios(id),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.comissoes_config ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.comissoes_config FROM anon, authenticated;
GRANT SELECT ON public.comissoes_config TO authenticated;
DROP POLICY IF EXISTS comissoes_config_select ON public.comissoes_config;
CREATE POLICY comissoes_config_select ON public.comissoes_config FOR SELECT TO authenticated
  USING (empresa_id IN (SELECT public.fp_empresas_do_usuario()));

-- DONO/GERENTE ativo da empresa.
CREATE OR REPLACE FUNCTION internal.comissao_eh_gestor(p_empresa uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (SELECT 1 FROM public.usuario_vinculos v JOIN public.usuarios u ON u.id = v.usuario_id AND u.ativo
                  WHERE v.usuario_id = auth.uid() AND v.empresa_id = p_empresa AND v.ativo AND v.papel IN ('DONO','GERENTE'));
$$;
GRANT EXECUTE ON FUNCTION internal.comissao_eh_gestor(uuid) TO authenticated;

-- Base: 'LIQUIDA' (padrão, inclusive sem configuração) ou 'BRUTA'.
CREATE OR REPLACE FUNCTION internal.comissao_base_liquida(p_venda_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT coalesce((SELECT cc.base <> 'BRUTA' FROM public.comissoes_config cc
    WHERE cc.empresa_id = public.fp_empresa_contexto(public.fp_loja_de('venda', p_venda_id))), true);
$$;

-- Desconto da venda não refletido nos itens (desconto de gerente/total) rateado entre os itens.
CREATE OR REPLACE FUNCTION internal.comissao_desconto_rateado_venda(p_venda_id uuid)
RETURNS TABLE (o_item_venda_id uuid, o_desconto numeric) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE ids uuid[]; pesos numeric[]; liq numeric; d numeric; partes numeric[]; i int;
BEGIN
  SELECT array_agg(iv.id ORDER BY iv.id), array_agg(round(iv.quantidade * iv.preco_unitario, 2) ORDER BY iv.id)
    INTO ids, pesos FROM public.itens_venda iv WHERE iv.venda_id = p_venda_id;
  IF ids IS NULL THEN RETURN; END IF;
  SELECT v.total_liquido INTO liq FROM public.vendas v WHERE v.id = p_venda_id;
  d := CASE WHEN internal.comissao_base_liquida(p_venda_id) AND liq IS NOT NULL
            THEN greatest((SELECT sum(x) FROM unnest(pesos) x) - liq, 0) ELSE 0 END;
  partes := internal.comissao_ratear_centavos(pesos, d);
  FOR i IN 1..array_length(ids, 1) LOOP
    o_item_venda_id := ids[i]; o_desconto := partes[i]; RETURN NEXT;
  END LOOP;
END $$;

-- Valor do item sobre base líquida. Fixo por unidade ignora desconto (como antes).
CREATE OR REPLACE FUNCTION internal.comissao_valor_item_liquido(p_quantidade numeric, p_preco_unitario numeric,
  p_desconto numeric, p_tipo_calculo text, p_percentual numeric, p_valor_unitario_fixo numeric)
RETURNS numeric LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT (CASE
    WHEN coalesce(p_quantidade, 0) <= 0 THEN 0
    WHEN p_tipo_calculo = 'fixo' THEN round(coalesce(p_valor_unitario_fixo, 0) * p_quantidade, 2)
    ELSE round(greatest(round(p_quantidade * p_preco_unitario, 2) - coalesce(p_desconto, 0), 0) * coalesce(p_percentual, 0) / 100.0, 2)
  END)::numeric(14,2);
$$;

-- 5. Cargo do funcionário (chave de regra). Lê public.funcionario_dados.cargo (PR de dados do funcionário)
--    quando a tabela existir; senão funcionarios_meta.cargo; senão NULL. Sem dependência dura entre os PRs.
CREATE OR REPLACE FUNCTION internal.comissao_cargo_usuario(p_usuario uuid)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v text;
BEGIN
  IF p_usuario IS NULL THEN RETURN NULL; END IF;
  IF to_regclass('public.funcionario_dados') IS NOT NULL THEN
    EXECUTE 'SELECT nullif(btrim(cargo), '''') FROM public.funcionario_dados WHERE usuario_id = $1' INTO v USING p_usuario;
  END IF;
  IF v IS NULL AND to_regclass('public.funcionarios_meta') IS NOT NULL THEN
    EXECUTE 'SELECT nullif(btrim(cargo), '''') FROM public.funcionarios_meta WHERE usuario_id = $1 AND ativo ORDER BY criado_em DESC LIMIT 1'
      INTO v USING p_usuario;
  END IF;
  RETURN lower(v);
END $$;

-- 6. Gancho de regras da empresa (P1 substitui). Em P0 nunca casa => cadeia legada intacta.
CREATE OR REPLACE FUNCTION internal.comissao_regra_empresa(p_loja uuid, p_vendedor uuid, p_produto uuid, p_canal text, p_data date)
RETURNS TABLE (o_regra_id uuid, o_tipo_calculo text, o_valor numeric, o_nivel int)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT NULL::uuid, NULL::text, NULL::numeric, NULL::int WHERE false;
$$;

CREATE OR REPLACE FUNCTION internal.comissao_canal_item(p_tipo_preco text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT CASE WHEN upper(coalesce(p_tipo_preco, '')) LIKE 'ATACADO%' THEN 'ATACADO' ELSE 'VAREJO' END;
$$;

-- 7. Resolver v2: vendedor efetivo, canal, desconto rateado e regra da empresa (P1) antes da cadeia legada.
ALTER TABLE public.comissoes_itens DROP CONSTRAINT IF EXISTS comissoes_itens_origem_check;
ALTER TABLE public.comissoes_itens ADD CONSTRAINT comissoes_itens_origem_check CHECK (origem_regra = ANY (ARRAY[
  'REGRA_PRODUTO','REGRA_CATEGORIA','REGRA_MARGEM','REGRA_PADRAO','PRODUTO_PERCENTUAL','PRODUTO_FIXO','GLOBAL','REGRA_EMPRESA']));
ALTER TABLE public.comissoes_itens ADD COLUMN IF NOT EXISTS regra_empresa_id uuid NULL;

CREATE OR REPLACE FUNCTION internal.resolver_comissao_itens_venda_v2(p_venda_id uuid)
RETURNS TABLE(o_item_venda_id uuid, o_produto_id uuid, o_quantidade numeric, o_preco_unitario numeric,
  o_origem_regra text, o_regra_id uuid, o_tipo_calculo text, o_percentual numeric, o_valor_unitario_fixo numeric,
  o_desconto numeric, o_canal text, o_regra_empresa_id uuid)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_loja uuid; v_vendedor uuid; v_data date; r record; e record; d record;
BEGIN
  SELECT c.loja_id, coalesce(v.vendedor_id, v.operador_id), (v.data AT TIME ZONE 'America/Sao_Paulo')::date
    INTO v_loja, v_vendedor, v_data
    FROM public.vendas v LEFT JOIN public.caixas c ON c.id = v.caixa_id WHERE v.id = p_venda_id;
  IF v_loja IS NULL OR v_vendedor IS NULL THEN RETURN; END IF;
  v_data := coalesce(v_data, CURRENT_DATE);
  -- Cadeia legada (funcionário → produto → global), com o vendedor efetivo, reaproveitada sem reescrever.
  FOR r IN
    SELECT l.*, iv.tipo_preco, coalesce(dr.o_desconto, 0) AS desconto
      FROM internal.resolver_comissao_itens_venda_vendedor(p_venda_id, v_vendedor) l
      JOIN public.itens_venda iv ON iv.id = l.o_item_venda_id
      LEFT JOIN internal.comissao_desconto_rateado_venda(p_venda_id) dr ON dr.o_item_venda_id = l.o_item_venda_id
     ORDER BY l.o_item_venda_id
  LOOP
    o_item_venda_id := r.o_item_venda_id; o_produto_id := r.o_produto_id; o_quantidade := r.o_quantidade;
    o_preco_unitario := r.o_preco_unitario; o_desconto := r.desconto; o_canal := internal.comissao_canal_item(r.tipo_preco);
    o_regra_empresa_id := NULL;
    SELECT * INTO e FROM internal.comissao_regra_empresa(v_loja, v_vendedor, r.o_produto_id, o_canal, v_data) LIMIT 1;
    IF FOUND AND e.o_regra_id IS NOT NULL THEN
      o_origem_regra := 'REGRA_EMPRESA'; o_regra_id := NULL; o_regra_empresa_id := e.o_regra_id;
      IF e.o_tipo_calculo = 'fixo' THEN
        o_tipo_calculo := 'fixo'; o_valor_unitario_fixo := e.o_valor; o_percentual := NULL;
      ELSE
        o_tipo_calculo := 'percentual'; o_percentual := e.o_valor; o_valor_unitario_fixo := NULL;
      END IF;
    ELSE
      o_origem_regra := r.o_origem_regra; o_regra_id := r.o_regra_id; o_tipo_calculo := r.o_tipo_calculo;
      o_percentual := r.o_percentual; o_valor_unitario_fixo := r.o_valor_unitario_fixo;
    END IF;
    RETURN NEXT;
  END LOOP;
END $$;

-- Cópia fiel de internal.resolver_comissao_itens_venda com o vendedor como parâmetro (a original fica intacta).
CREATE OR REPLACE FUNCTION internal.resolver_comissao_itens_venda_vendedor(p_venda_id uuid, p_vendedor uuid)
RETURNS TABLE(o_item_venda_id uuid, o_produto_id uuid, o_quantidade numeric, o_preco_unitario numeric, o_origem_regra text,
  o_regra_id uuid, o_tipo_calculo text, o_percentual numeric, o_valor_unitario_fixo numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_caixa_id uuid; v_loja_id uuid; v_funcionario_id uuid; v_taxa_global numeric(10,4) := 0; v_taxa numeric(10,4);
  v_regra uuid; v_origem text; v_margem numeric(10,4); r record; g record;
BEGIN
  SELECT v.caixa_id INTO v_caixa_id FROM public.vendas v WHERE v.id = p_venda_id;
  IF NOT FOUND THEN RETURN; END IF;
  SELECT c.loja_id INTO v_loja_id FROM public.caixas c WHERE c.id = v_caixa_id;
  IF v_loja_id IS NULL OR p_vendedor IS NULL THEN RETURN; END IF;
  SELECT u.funcionario_id INTO v_funcionario_id FROM public.usuarios u WHERE u.id = p_vendedor;
  SELECT COALESCE(cg.valor::numeric, 0) INTO v_taxa_global FROM public.configuracoes_gerais cg
   WHERE cg.chave = 'comissao_padrao_percentual' AND cg.empresa_id = public.fp_empresa_contexto(public.fp_loja_de('venda', p_venda_id)) LIMIT 1;
  FOR r IN
    SELECT iv.id, iv.produto_id, iv.quantidade, iv.preco_unitario, p.comissao_tipo, p.comissao_valor, p.preco_custo, p.categoria_id
      FROM public.itens_venda iv JOIN public.produtos p ON p.id = iv.produto_id
     WHERE iv.venda_id = p_venda_id ORDER BY iv.id
  LOOP
    v_taxa := NULL; v_regra := NULL; v_origem := NULL;
    IF r.preco_custo IS NOT NULL AND r.preco_unitario > 0 THEN
      v_margem := ((r.preco_unitario - r.preco_custo) / r.preco_unitario) * 100.0;
    ELSE v_margem := 0; END IF;
    IF v_funcionario_id IS NOT NULL THEN
      SELECT cr.id, cr.percentual INTO g FROM public.comissoes_regras_funcionario cr
       WHERE cr.funcionario_id = v_funcionario_id AND cr.loja_id = v_loja_id AND cr.tipo_regra = 'por_produto'
         AND cr.produto_id = r.produto_id AND cr.ativo AND cr.vigencia_inicio <= CURRENT_DATE
         AND (cr.vigencia_fim IS NULL OR cr.vigencia_fim >= CURRENT_DATE) LIMIT 1;
      IF FOUND THEN v_taxa := g.percentual; v_regra := g.id; v_origem := 'REGRA_PRODUTO'; END IF;
    END IF;
    IF v_taxa IS NULL AND v_funcionario_id IS NOT NULL THEN
      SELECT cr.id, cr.percentual INTO g FROM public.comissoes_regras_funcionario cr
       WHERE cr.funcionario_id = v_funcionario_id AND cr.loja_id = v_loja_id AND cr.tipo_regra = 'por_categoria'
         AND cr.categoria_id = r.categoria_id AND cr.ativo AND cr.vigencia_inicio <= CURRENT_DATE
         AND (cr.vigencia_fim IS NULL OR cr.vigencia_fim >= CURRENT_DATE) LIMIT 1;
      IF FOUND THEN v_taxa := g.percentual; v_regra := g.id; v_origem := 'REGRA_CATEGORIA'; END IF;
    END IF;
    IF v_taxa IS NULL AND v_funcionario_id IS NOT NULL THEN
      SELECT cr.id, cr.percentual INTO g FROM public.comissoes_regras_funcionario cr
       WHERE cr.funcionario_id = v_funcionario_id AND cr.loja_id = v_loja_id AND cr.tipo_regra = 'por_margem'
         AND cr.margem_minima <= v_margem AND cr.margem_maxima >= v_margem AND cr.ativo
         AND cr.vigencia_inicio <= CURRENT_DATE AND (cr.vigencia_fim IS NULL OR cr.vigencia_fim >= CURRENT_DATE) LIMIT 1;
      IF FOUND THEN v_taxa := g.percentual; v_regra := g.id; v_origem := 'REGRA_MARGEM'; END IF;
    END IF;
    IF v_taxa IS NULL AND v_funcionario_id IS NOT NULL THEN
      SELECT cr.id, cr.percentual INTO g FROM public.comissoes_regras_funcionario cr
       WHERE cr.funcionario_id = v_funcionario_id AND cr.loja_id = v_loja_id AND cr.tipo_regra = 'padrao' AND cr.ativo
         AND cr.vigencia_inicio <= CURRENT_DATE AND (cr.vigencia_fim IS NULL OR cr.vigencia_fim >= CURRENT_DATE) LIMIT 1;
      IF FOUND THEN v_taxa := g.percentual; v_regra := g.id; v_origem := 'REGRA_PADRAO'; END IF;
    END IF;
    IF v_taxa IS NULL AND r.comissao_tipo = 'percentual' AND r.comissao_valor IS NOT NULL THEN
      v_taxa := r.comissao_valor; v_regra := NULL; v_origem := 'PRODUTO_PERCENTUAL';
    END IF;
    IF v_taxa IS NULL THEN v_taxa := v_taxa_global; v_regra := NULL; v_origem := 'GLOBAL'; END IF;
    o_item_venda_id := r.id; o_produto_id := r.produto_id; o_quantidade := r.quantidade;
    o_preco_unitario := r.preco_unitario; o_regra_id := v_regra;
    IF r.comissao_tipo = 'fixo' AND r.comissao_valor IS NOT NULL THEN
      o_tipo_calculo := 'fixo'; o_valor_unitario_fixo := r.comissao_valor; o_percentual := NULL; o_origem_regra := 'PRODUTO_FIXO';
    ELSE
      o_tipo_calculo := 'percentual'; o_valor_unitario_fixo := NULL; o_percentual := v_taxa; o_origem_regra := v_origem;
    END IF;
    RETURN NEXT;
  END LOOP;
END $$;

-- 8. Apuração (mesmo contrato; vendedor efetivo; base líquida; cabeçalho honesto) -----------------
CREATE OR REPLACE FUNCTION internal.apurar_comissao_original(p_venda_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_vendedor uuid; v_caixa_id uuid; v_loja_id uuid; v_comissao_id uuid; v_taxa_global numeric(10,4) := 0;
  v_n_regras int; v_valor numeric; v_base numeric;
BEGIN
  SELECT coalesce(v.vendedor_id, v.operador_id), v.caixa_id INTO v_vendedor, v_caixa_id FROM public.vendas v WHERE v.id = p_venda_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF v_vendedor IS NULL THEN
    PERFORM internal.comissao_registrar_falha(p_venda_id, 'APURACAO', NULL, 'SEM_VENDEDOR'); RETURN NULL;
  END IF;
  SELECT c.loja_id INTO v_loja_id FROM public.caixas c WHERE c.id = v_caixa_id;
  IF v_loja_id IS NULL THEN
    PERFORM internal.comissao_registrar_falha(p_venda_id, 'APURACAO', NULL, 'SEM_LOJA'); RETURN NULL;
  END IF;
  -- Venda gravada antes dos itens: nada a apurar ainda (não é falha).
  IF NOT EXISTS (SELECT 1 FROM internal.resolver_comissao_itens_venda_v2(p_venda_id) r WHERE coalesce(r.o_quantidade, 0) > 0) THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.comissoes_vendedores (venda_id, operador_id, loja_id, valor_comissao, base_calculo, status)
  VALUES (p_venda_id, v_vendedor, v_loja_id, 0, 0, 'pendente')
  ON CONFLICT (venda_id, operador_id) DO UPDATE SET venda_id = EXCLUDED.venda_id
  RETURNING id INTO v_comissao_id;

  INSERT INTO public.comissoes_itens (
    comissao_id, venda_id, item_venda_id, produto_id, quantidade, preco_unitario, base_elegivel, origem_regra, regra_id,
    tipo_calculo, percentual_aplicado, valor_unitario_fixo, valor_comissao, desconto_rateado, canal, regra_empresa_id)
  SELECT v_comissao_id, p_venda_id, r.o_item_venda_id, r.o_produto_id, r.o_quantidade, r.o_preco_unitario,
    greatest(round(r.o_quantidade * r.o_preco_unitario, 2) - r.o_desconto, 0),
    r.o_origem_regra, r.o_regra_id, r.o_tipo_calculo, r.o_percentual, r.o_valor_unitario_fixo,
    internal.comissao_valor_item_liquido(r.o_quantidade, r.o_preco_unitario, r.o_desconto, r.o_tipo_calculo, r.o_percentual, r.o_valor_unitario_fixo),
    r.o_desconto, r.o_canal, r.o_regra_empresa_id
  FROM internal.resolver_comissao_itens_venda_v2(p_venda_id) r
  WHERE coalesce(r.o_quantidade, 0) > 0
  ON CONFLICT (comissao_id, item_venda_id) DO NOTHING;

  -- Os itens chegam um a um na mesma transação da venda: o rateio só fica completo no último. Itens congelados
  -- NESTA transação (apurado_em = now(), que é fixo na transação) são re-derivados; os de transações anteriores ficam.
  UPDATE public.comissoes_itens ci
     SET desconto_rateado = r.o_desconto,
         base_elegivel = greatest(round(r.o_quantidade * r.o_preco_unitario, 2) - r.o_desconto, 0),
         valor_comissao = internal.comissao_valor_item_liquido(ci.quantidade, ci.preco_unitario, r.o_desconto,
                            ci.tipo_calculo, ci.percentual_aplicado, ci.valor_unitario_fixo)
    FROM internal.resolver_comissao_itens_venda_v2(p_venda_id) r
   WHERE ci.comissao_id = v_comissao_id AND ci.item_venda_id = r.o_item_venda_id
     AND ci.apurado_em = now() AND ci.desconto_rateado IS DISTINCT FROM r.o_desconto;

  SELECT coalesce(cg.valor::numeric, 0) INTO v_taxa_global FROM public.configuracoes_gerais cg
   WHERE cg.chave = 'comissao_padrao_percentual' AND cg.empresa_id = public.fp_empresa_contexto(public.fp_loja_de('venda', p_venda_id)) LIMIT 1;

  SELECT count(DISTINCT (ci.tipo_calculo, ci.percentual_aplicado, ci.valor_unitario_fixo, ci.regra_id, ci.regra_empresa_id)),
         greatest(0, coalesce(sum(ci.valor_comissao), 0)), coalesce(sum(ci.base_elegivel), 0)
    INTO v_n_regras, v_valor, v_base
    FROM public.comissoes_itens ci WHERE ci.comissao_id = v_comissao_id;

  UPDATE public.comissoes_vendedores cv
     SET valor_comissao = v_valor, base_calculo = v_base,
         regra_mista = (v_n_regras > 1),
         percentual_aplicado = CASE
           WHEN v_n_regras = 1 THEN coalesce((SELECT ci.percentual_aplicado FROM public.comissoes_itens ci
                                               WHERE ci.comissao_id = v_comissao_id LIMIT 1),
                                             CASE WHEN v_base > 0 THEN round(v_valor / v_base * 100, 4) ELSE v_taxa_global END)
           WHEN v_base > 0 THEN round(v_valor / v_base * 100, 4)
           ELSE v_taxa_global END,
         regra_id = CASE WHEN v_n_regras = 1 THEN (SELECT ci.regra_id FROM public.comissoes_itens ci WHERE ci.comissao_id = v_comissao_id LIMIT 1) END
   WHERE cv.id = v_comissao_id;

  PERFORM internal.comissao_resolver_falhas(p_venda_id, 'APURACAO', NULL);
  RETURN v_comissao_id;
END $$;

-- Erro na apuração não aborta a venda e não some: vira linha em comissoes_falhas.
CREATE OR REPLACE FUNCTION public.processar_comissao_venda(p_venda_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_status text;
BEGIN
  SELECT v.status INTO v_status FROM public.vendas v WHERE v.id = p_venda_id;
  IF NOT FOUND OR v_status IS DISTINCT FROM 'CONCLUIDA' THEN RETURN; END IF;
  BEGIN
    PERFORM internal.apurar_comissao_original(p_venda_id);
  EXCEPTION WHEN OTHERS THEN
    PERFORM internal.comissao_registrar_falha(p_venda_id, 'APURACAO', SQLSTATE, SQLERRM);
  END;
END $$;

-- Recalculo efetivo: base líquida proporcional à quantidade remanescente; sem engolir erro.
CREATE OR REPLACE FUNCTION internal.calcular_comissao_venda(p_venda_id uuid, p_efetivo boolean)
RETURNS TABLE(o_valor numeric, o_base numeric, o_taxa numeric, o_regra uuid)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_status text; v_cancelada boolean; v_tem_snapshot boolean := false; v_total numeric(14,2) := 0; v_base numeric(14,2) := 0;
  v_taxa_global numeric(10,4) := 0; v_taxa numeric(10,4); v_regra uuid; v_qtd numeric; v_desc numeric; r record;
BEGIN
  SELECT v.status INTO v_status FROM public.vendas v WHERE v.id = p_venda_id;
  IF NOT FOUND THEN RETURN; END IF;
  IF NOT p_efetivo AND v_status IS DISTINCT FROM 'CONCLUIDA' THEN RETURN; END IF;
  v_cancelada := (v_status = 'CANCELADA');
  SELECT coalesce(cg.valor::numeric, 0) INTO v_taxa_global FROM public.configuracoes_gerais cg
   WHERE cg.chave = 'comissao_padrao_percentual' AND cg.empresa_id = public.fp_empresa_contexto(public.fp_loja_de('venda', p_venda_id)) LIMIT 1;
  IF p_efetivo THEN
    SELECT EXISTS (SELECT 1 FROM public.comissoes_itens ci WHERE ci.venda_id = p_venda_id) INTO v_tem_snapshot;
  END IF;
  IF p_efetivo AND v_tem_snapshot THEN
    FOR r IN
      SELECT ci.item_venda_id, ci.quantidade, ci.preco_unitario, ci.tipo_calculo, ci.percentual_aplicado,
             ci.valor_unitario_fixo, ci.regra_id, ci.desconto_rateado
        FROM public.comissoes_itens ci WHERE ci.venda_id = p_venda_id ORDER BY ci.item_venda_id
    LOOP
      v_qtd := internal.comissao_quantidade_efetiva(r.item_venda_id, r.quantidade, v_cancelada);
      IF coalesce(v_qtd, 0) <= 0 THEN CONTINUE; END IF;
      v_desc := CASE WHEN v_qtd >= r.quantidade THEN r.desconto_rateado ELSE round(r.desconto_rateado * v_qtd / r.quantidade, 2) END;
      v_base  := v_base + greatest(round(v_qtd * r.preco_unitario, 2) - v_desc, 0);
      v_total := v_total + internal.comissao_valor_item_liquido(v_qtd, r.preco_unitario, v_desc, r.tipo_calculo, r.percentual_aplicado, r.valor_unitario_fixo);
      v_taxa := r.percentual_aplicado; v_regra := r.regra_id;
    END LOOP;
  ELSE
    FOR r IN SELECT * FROM internal.resolver_comissao_itens_venda_v2(p_venda_id) LOOP
      v_qtd := CASE WHEN p_efetivo THEN internal.comissao_quantidade_efetiva(r.o_item_venda_id, r.o_quantidade, v_cancelada)
                    ELSE r.o_quantidade END;
      IF coalesce(v_qtd, 0) <= 0 THEN CONTINUE; END IF;
      v_desc := CASE WHEN v_qtd >= r.o_quantidade THEN r.o_desconto ELSE round(r.o_desconto * v_qtd / r.o_quantidade, 2) END;
      v_base  := v_base + greatest(round(v_qtd * r.o_preco_unitario, 2) - v_desc, 0);
      v_total := v_total + internal.comissao_valor_item_liquido(v_qtd, r.o_preco_unitario, v_desc, r.o_tipo_calculo, r.o_percentual, r.o_valor_unitario_fixo);
      v_taxa := r.o_percentual; v_regra := r.o_regra_id;
    END LOOP;
  END IF;
  o_valor := greatest(0, v_total); o_base := v_base; o_taxa := coalesce(v_taxa, v_taxa_global); o_regra := v_regra;
  RETURN NEXT;
END $$;

-- Ajuste: se o recálculo falhar, registra a falha e NÃO estorna (antes: falha => efetivo 0 => estorno total).
CREATE OR REPLACE FUNCTION public.processar_ajuste_comissao_venda(p_venda_id uuid, p_tipo text, p_origem_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_com public.comissoes_vendedores%ROWTYPE; v_efetivo record; v_alvo numeric(14,2); v_ja numeric(14,2);
  v_delta numeric(14,2); v_key text; v_ok boolean := false;
BEGIN
  IF p_tipo NOT IN ('CANCELAMENTO', 'DEVOLUCAO', 'TROCA') THEN RAISE EXCEPTION 'COMISSAO_AJUSTE_TIPO_INVALIDO'; END IF;
  SELECT * INTO v_com FROM public.comissoes_vendedores cv WHERE cv.venda_id = p_venda_id ORDER BY cv.created_at, cv.id FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;
  v_key := p_tipo || ':' || coalesce(p_origem_id, p_venda_id)::text;
  IF EXISTS (SELECT 1 FROM public.comissoes_ajustes a WHERE a.idempotency_key = v_key) THEN RETURN; END IF;
  BEGIN
    SELECT * INTO v_efetivo FROM internal.calcular_comissao_venda(p_venda_id, true);
    v_ok := FOUND;
  EXCEPTION WHEN OTHERS THEN
    PERFORM internal.comissao_registrar_falha(p_venda_id, 'AJUSTE', SQLSTATE, SQLERRM);
    RETURN;
  END;
  IF NOT v_ok THEN PERFORM internal.comissao_registrar_falha(p_venda_id, 'AJUSTE', NULL, 'RECALCULO_SEM_RESULTADO'); RETURN; END IF;
  v_alvo := greatest(0, v_com.valor_comissao - coalesce(v_efetivo.o_valor, 0));
  SELECT coalesce(sum(a.valor), 0) INTO v_ja FROM public.comissoes_ajustes a WHERE a.comissao_id = v_com.id;
  v_delta := public.round_abnt(v_alvo - v_ja, 2);
  IF v_delta <= 0 THEN RETURN; END IF;
  INSERT INTO public.comissoes_ajustes (comissao_id, venda_id, operador_id, loja_id, tipo, valor, origem_id, idempotency_key)
  VALUES (v_com.id, p_venda_id, v_com.operador_id, v_com.loja_id, p_tipo, v_delta, p_origem_id, v_key)
  ON CONFLICT (idempotency_key) DO NOTHING;
  PERFORM internal.comissao_resolver_falhas(p_venda_id, 'AJUSTE', NULL);
END $$;

-- 9. Vendedor: definição pós-venda ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION internal.comissao_bloqueio_reatribuicao(p_venda_id uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT CASE
    WHEN EXISTS (SELECT 1 FROM public.comissoes_vendedores cv WHERE cv.venda_id = p_venda_id
                  AND (cv.status <> 'pendente' OR cv.pagamento_id IS NOT NULL)) THEN 'COMISSAO_JA_PAGA'
    WHEN EXISTS (SELECT 1 FROM public.comissoes_ajustes a WHERE a.venda_id = p_venda_id) THEN 'COMISSAO_COM_AJUSTE'
  END;
$$;

CREATE OR REPLACE FUNCTION internal.definir_vendedor_venda_core(p_venda_id uuid, p_vendedor_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v record; v_loja uuid; v_novo uuid; v_bloq text;
BEGIN
  SELECT * INTO v FROM public.vendas WHERE id = p_venda_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'VENDA_NAO_ENCONTRADA'; END IF;
  IF v.status <> 'CONCLUIDA' THEN RAISE EXCEPTION 'VENDA_NAO_CONCLUIDA'; END IF;
  SELECT loja_id INTO v_loja FROM public.caixas WHERE id = v.caixa_id;
  v_novo := nullif(p_vendedor_id, v.operador_id);  -- vendedor = operador grava NULL (padrão)
  IF v_novo IS NOT DISTINCT FROM v.vendedor_id THEN RETURN jsonb_build_object('ok', true, 'alterado', false); END IF;
  IF v_novo IS NOT NULL AND NOT public.fp_usuario_pode_loja(v_novo, v_loja) THEN RAISE EXCEPTION 'VENDEDOR_FORA_DA_LOJA'; END IF;
  v_bloq := internal.comissao_bloqueio_reatribuicao(p_venda_id);
  IF v_bloq IS NOT NULL THEN RAISE EXCEPTION '%', v_bloq; END IF;
  UPDATE public.vendas SET vendedor_id = v_novo WHERE id = p_venda_id;
  DELETE FROM public.comissoes_itens WHERE venda_id = p_venda_id;
  DELETE FROM public.comissoes_vendedores WHERE venda_id = p_venda_id;
  PERFORM public.processar_comissao_venda(p_venda_id);
  RETURN jsonb_build_object('ok', true, 'alterado', true, 'vendedor_id', coalesce(v_novo, v.operador_id));
END $$;
REVOKE ALL ON FUNCTION internal.definir_vendedor_venda_core(uuid, uuid) FROM PUBLIC, anon, authenticated;

-- Web: operador da própria venda (até 24h) ou DONO/GERENTE da loja.
CREATE OR REPLACE FUNCTION public.definir_vendedor_venda(p_venda_id uuid, p_vendedor_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v record; v_loja uuid; v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'NAO_AUTENTICADO'; END IF;
  SELECT ve.operador_id, ve.data, c.loja_id INTO v FROM public.vendas ve JOIN public.caixas c ON c.id = ve.caixa_id WHERE ve.id = p_venda_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'VENDA_NAO_ENCONTRADA'; END IF;
  IF NOT (public.fp_pode_loja(v.loja_id, ARRAY['DONO','GERENTE'])
          OR (v.operador_id = v_uid AND v.data > now() - interval '24 hours' AND public.fp_pode_loja(v.loja_id))) THEN
    RAISE EXCEPTION 'SEM_PERMISSAO';
  END IF;
  RETURN internal.definir_vendedor_venda_core(p_venda_id, p_vendedor_id);
END $$;
REVOKE ALL ON FUNCTION public.definir_vendedor_venda(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.definir_vendedor_venda(uuid, uuid) TO authenticated;

-- Desktop (sync-outbox, service_role). Falha aqui nunca deve impedir o sync da venda (a edge trata o erro).
CREATE OR REPLACE FUNCTION public.definir_vendedor_venda_pdv(p_venda_id uuid, p_vendedor_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  RETURN internal.definir_vendedor_venda_core(p_venda_id, p_vendedor_id);
EXCEPTION WHEN OTHERS THEN
  PERFORM internal.comissao_registrar_falha(p_venda_id, 'REATRIBUICAO', SQLSTATE, SQLERRM);
  RETURN jsonb_build_object('ok', false, 'erro', SQLERRM);
END $$;
REVOKE ALL ON FUNCTION public.definir_vendedor_venda_pdv(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.definir_vendedor_venda_pdv(uuid, uuid) TO service_role;

-- Lista de vendedores da loja (picker). Só id + nome; nada de CPF/telefone.
CREATE OR REPLACE FUNCTION public.listar_vendedores_loja(p_loja_id uuid)
RETURNS TABLE (id uuid, nome text) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT DISTINCT u.id, u.nome FROM public.usuario_vinculos vi
    JOIN public.usuarios u ON u.id = vi.usuario_id AND u.ativo
    JOIN public.lojas l ON l.id = p_loja_id AND l.empresa_id = vi.empresa_id
   WHERE vi.ativo AND (vi.papel = 'DONO' OR vi.loja_id = p_loja_id)
     AND (auth.role() = 'service_role' OR public.fp_pode_loja(p_loja_id))
   ORDER BY u.nome;
$$;
REVOKE ALL ON FUNCTION public.listar_vendedores_loja(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.listar_vendedores_loja(uuid) TO authenticated, service_role;

-- Reprocessar (DONO/GERENTE): reapura a venda; se continuar falhando, a falha fica aberta com tentativas+1.
CREATE OR REPLACE FUNCTION public.reprocessar_comissao_venda(p_venda_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_loja uuid; v_id uuid;
BEGIN
  SELECT c.loja_id INTO v_loja FROM public.vendas v JOIN public.caixas c ON c.id = v.caixa_id WHERE v.id = p_venda_id;
  IF v_loja IS NULL OR NOT public.fp_pode_loja(v_loja, ARRAY['DONO','GERENTE']) THEN RAISE EXCEPTION 'SEM_PERMISSAO'; END IF;
  PERFORM public.processar_comissao_venda(p_venda_id);
  SELECT id INTO v_id FROM public.comissoes_vendedores WHERE venda_id = p_venda_id LIMIT 1;
  IF v_id IS NOT NULL THEN
    PERFORM internal.comissao_resolver_falhas(p_venda_id, 'APURACAO', auth.uid());
    PERFORM internal.comissao_resolver_falhas(p_venda_id, 'REATRIBUICAO', auth.uid());
  END IF;
  RETURN jsonb_build_object('ok', v_id IS NOT NULL, 'comissao_id', v_id,
    'falha', (SELECT motivo FROM public.comissoes_falhas WHERE venda_id = p_venda_id AND resolvida_em IS NULL ORDER BY created_at DESC LIMIT 1));
END $$;
REVOKE ALL ON FUNCTION public.reprocessar_comissao_venda(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reprocessar_comissao_venda(uuid) TO authenticated;

REVOKE ALL ON FUNCTION internal.comissao_registrar_falha(uuid, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION internal.comissao_resolver_falhas(uuid, text, uuid) FROM PUBLIC, anon, authenticated;
-- Funções internas SECURITY DEFINER: só pelo próprio banco (gatilhos/RPCs públicas acima).
REVOKE ALL ON FUNCTION internal.comissao_base_liquida(uuid), internal.comissao_desconto_rateado_venda(uuid),
  internal.comissao_cargo_usuario(uuid), internal.comissao_regra_empresa(uuid, uuid, uuid, text, date),
  internal.resolver_comissao_itens_venda_v2(uuid), internal.resolver_comissao_itens_venda_vendedor(uuid, uuid),
  internal.comissao_bloqueio_reatribuicao(uuid) FROM PUBLIC, anon, authenticated;
COMMIT;
