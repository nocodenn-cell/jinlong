-- Módulo Comissão — P2: metas com faixas (no fechamento), liberação por parcela recebida (opcional),
-- divisão entre 2 vendedores, autoatendimento do vendedor e exportação contábil/folha (somente arquivo).
-- ADITIVA. Padrão = comportamento do P1 (liberação na venda, sem metas, sem divisão).
-- NADA é lançado em caixa, contas a pagar ou folha: a exportação é só um arquivo gerado no navegador.
-- Rollback: backend/supabase/rollback/20261021202000_comissao_p2_metas_parcelas_divisao.rollback.sql
BEGIN;

-- 1. Configuração: liberação ------------------------------------------------------------------------
ALTER TABLE public.comissoes_config ADD COLUMN IF NOT EXISTS liberacao text NOT NULL DEFAULT 'VENDA'
  CHECK (liberacao IN ('VENDA', 'RECEBIMENTO'));
COMMENT ON COLUMN public.comissoes_config.liberacao IS
  'VENDA: comissão inteira na competência da venda. RECEBIMENTO: cartão de crédito parcelado libera 1/n a cada 30 dias (parcela k em data+30k).';

CREATE OR REPLACE FUNCTION public.comissao_salvar_config(p_loja_id uuid, p_base text DEFAULT NULL, p_liberacao text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_emp uuid := public.fp_empresa_da_loja(p_loja_id); r public.comissoes_config;
BEGIN
  IF v_emp IS NULL OR NOT internal.comissao_eh_gestor(v_emp) THEN RAISE EXCEPTION 'SEM_PERMISSAO'; END IF;
  IF p_base IS NOT NULL AND p_base NOT IN ('LIQUIDA','BRUTA') THEN RAISE EXCEPTION 'COMISSAO_CONFIG_INVALIDA'; END IF;
  IF p_liberacao IS NOT NULL AND p_liberacao NOT IN ('VENDA','RECEBIMENTO') THEN RAISE EXCEPTION 'COMISSAO_CONFIG_INVALIDA'; END IF;
  INSERT INTO public.comissoes_config (empresa_id, base, liberacao, updated_by)
  VALUES (v_emp, coalesce(p_base, 'LIQUIDA'), coalesce(p_liberacao, 'VENDA'), auth.uid())
  ON CONFLICT (empresa_id) DO UPDATE SET base = coalesce(p_base, comissoes_config.base),
    liberacao = coalesce(p_liberacao, comissoes_config.liberacao), updated_by = auth.uid(), updated_at = now()
  RETURNING * INTO r;
  RETURN jsonb_build_object('base', r.base, 'liberacao', r.liberacao);
END $$;
REVOKE ALL ON FUNCTION public.comissao_salvar_config(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.comissao_salvar_config(uuid, text, text) TO authenticated;

-- Cronograma de liberação de uma comissão (determinístico, centavos exatos).
CREATE OR REPLACE FUNCTION internal.comissao_liberacoes(p_comissao_id uuid)
RETURNS TABLE (o_mes date, o_base numeric, o_valor numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE cv record; v_data timestamptz; datas date[] := '{}'; pesos numeric[] := '{}'; p record; k int; b numeric[]; v numeric[]; i int;
BEGIN
  SELECT * INTO cv FROM public.comissoes_vendedores WHERE id = p_comissao_id;
  SELECT data INTO v_data FROM public.vendas WHERE id = cv.venda_id;
  FOR p IN SELECT * FROM public.vendas_pagamentos WHERE venda_id = cv.venda_id AND valor > 0 ORDER BY created_at, id LOOP
    IF p.forma_pagamento = 'CARTAO_CREDITO' AND p.parcelas > 1 THEN
      FOR k IN 1..p.parcelas LOOP
        datas := datas || ((v_data AT TIME ZONE 'America/Sao_Paulo')::date + 30 * k);
        pesos := pesos || (p.valor * 1000 / p.parcelas);
      END LOOP;
    ELSE
      datas := datas || (v_data AT TIME ZONE 'America/Sao_Paulo')::date;
      pesos := pesos || (p.valor * 1000);
    END IF;
  END LOOP;
  IF coalesce(array_length(pesos, 1), 0) = 0 THEN
    o_mes := date_trunc('month', v_data AT TIME ZONE 'America/Sao_Paulo')::date; o_base := cv.base_calculo; o_valor := cv.valor_comissao;
    RETURN NEXT; RETURN;
  END IF;
  b := internal.comissao_ratear_centavos(pesos, cv.base_calculo);
  v := internal.comissao_ratear_centavos(pesos, cv.valor_comissao);
  FOR i IN 1..array_length(pesos, 1) LOOP
    o_mes := date_trunc('month', datas[i])::date; o_base := b[i]; o_valor := v[i];
    RETURN NEXT;
  END LOOP;
END $$;

-- 2. Divisão entre 2 vendedores -------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.comissoes_divisoes (
  venda_id               uuid PRIMARY KEY REFERENCES public.vendas(id),
  loja_id                uuid NOT NULL REFERENCES public.lojas(id),
  operador_secundario_id uuid NOT NULL REFERENCES public.usuarios(id),
  percentual             numeric(5,2) NOT NULL CHECK (percentual > 0 AND percentual < 100),
  criado_por             uuid NULL REFERENCES public.usuarios(id),
  created_at             timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.comissoes_divisoes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.comissoes_divisoes FROM anon, authenticated;
GRANT SELECT ON public.comissoes_divisoes TO authenticated;
CREATE POLICY comissoes_divisoes_select ON public.comissoes_divisoes FOR SELECT TO authenticated
  USING (public.fp_pode_loja(loja_id, ARRAY['DONO','GERENTE']) OR operador_secundario_id = auth.uid()
         OR EXISTS (SELECT 1 FROM public.comissoes_vendedores cv WHERE cv.venda_id = comissoes_divisoes.venda_id AND cv.operador_id = auth.uid()));

CREATE OR REPLACE FUNCTION public.definir_divisao_comissao(p_venda_id uuid, p_segundo_id uuid, p_percentual numeric DEFAULT 50)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v record; v_bloq text;
BEGIN
  SELECT cv.loja_id, cv.operador_id, cv.competencia, cv.created_at INTO v FROM public.comissoes_vendedores cv WHERE cv.venda_id = p_venda_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'COMISSAO_NAO_ENCONTRADA'; END IF;
  IF NOT public.fp_pode_loja(v.loja_id, ARRAY['DONO','GERENTE']) THEN RAISE EXCEPTION 'SEM_PERMISSAO'; END IF;
  IF internal.comissao_periodo_travado(v.loja_id, coalesce(v.competencia, date_trunc('month', v.created_at AT TIME ZONE 'America/Sao_Paulo')::date)) THEN
    RAISE EXCEPTION 'COMISSAO_PERIODO_TRAVADO'; END IF;
  IF p_segundo_id IS NULL THEN
    DELETE FROM public.comissoes_divisoes WHERE venda_id = p_venda_id;
    RETURN jsonb_build_object('ok', true, 'dividida', false);
  END IF;
  IF p_segundo_id = v.operador_id THEN RAISE EXCEPTION 'DIVISAO_MESMO_VENDEDOR'; END IF;
  IF p_percentual IS NULL OR p_percentual <= 0 OR p_percentual >= 100 THEN RAISE EXCEPTION 'DIVISAO_PERCENTUAL_INVALIDO'; END IF;
  IF NOT public.fp_usuario_pode_loja(p_segundo_id, v.loja_id) THEN RAISE EXCEPTION 'VENDEDOR_FORA_DA_LOJA'; END IF;
  INSERT INTO public.comissoes_divisoes (venda_id, loja_id, operador_secundario_id, percentual, criado_por)
  VALUES (p_venda_id, v.loja_id, p_segundo_id, round(p_percentual, 2), auth.uid())
  ON CONFLICT (venda_id) DO UPDATE SET operador_secundario_id = excluded.operador_secundario_id, percentual = excluded.percentual,
    criado_por = excluded.criado_por, created_at = now();
  RETURN jsonb_build_object('ok', true, 'dividida', true);
END $$;
REVOKE ALL ON FUNCTION public.definir_divisao_comissao(uuid, uuid, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.definir_divisao_comissao(uuid, uuid, numeric) TO authenticated;

-- 3. Metas com faixas -----------------------------------------------------------------------------
-- faixas: [{"a_partir_de": 10000, "bonus_pct": 1}, {"a_partir_de": 20000, "bonus_pct": 2}] — bônus = % da base do mês
-- (faixa mais alta atingida, não cumulativo).
CREATE TABLE IF NOT EXISTS public.comissoes_metas (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id         uuid NOT NULL REFERENCES public.empresas(id),
  loja_id            uuid NULL REFERENCES public.lojas(id),
  usuario_id         uuid NULL REFERENCES public.usuarios(id),
  cargo              text NULL CHECK (cargo IS NULL OR cargo = lower(btrim(cargo))),
  competencia_inicio date NOT NULL CHECK (competencia_inicio = date_trunc('month', competencia_inicio)::date),
  competencia_fim    date NULL CHECK (competencia_fim IS NULL OR competencia_fim >= competencia_inicio),
  faixas             jsonb NOT NULL,
  ativo              boolean NOT NULL DEFAULT true,
  descricao          text NULL CHECK (descricao IS NULL OR char_length(descricao) <= 200),
  created_by         uuid NULL REFERENCES public.usuarios(id),
  created_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT comissoes_metas_quem CHECK (usuario_id IS NULL OR cargo IS NULL)
);

CREATE OR REPLACE FUNCTION internal.trg_comissoes_metas_valida()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE f jsonb; ant numeric := -1;
BEGIN
  IF jsonb_typeof(NEW.faixas) <> 'array' OR jsonb_array_length(NEW.faixas) NOT BETWEEN 1 AND 10 THEN RAISE EXCEPTION 'META_FAIXAS_INVALIDAS'; END IF;
  FOR f IN SELECT * FROM jsonb_array_elements(NEW.faixas) LOOP
    IF jsonb_typeof(f->'a_partir_de') <> 'number' OR jsonb_typeof(f->'bonus_pct') <> 'number'
       OR (f->>'a_partir_de')::numeric <= ant OR (f->>'bonus_pct')::numeric < 0 OR (f->>'bonus_pct')::numeric > 100 THEN
      RAISE EXCEPTION 'META_FAIXAS_INVALIDAS'; END IF;
    ant := (f->>'a_partir_de')::numeric;
  END LOOP;
  IF NEW.loja_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.lojas WHERE id = NEW.loja_id AND empresa_id = NEW.empresa_id) THEN
    RAISE EXCEPTION 'COMISSAO_REGRA_LOJA_OUTRA_EMPRESA'; END IF;
  IF NEW.usuario_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.usuario_vinculos WHERE usuario_id = NEW.usuario_id AND empresa_id = NEW.empresa_id AND ativo) THEN
    RAISE EXCEPTION 'COMISSAO_REGRA_USUARIO_OUTRA_EMPRESA'; END IF;
  IF TG_OP = 'UPDATE' AND NEW.empresa_id <> OLD.empresa_id THEN RAISE EXCEPTION 'COMISSAO_REGRA_EMPRESA_IMUTAVEL'; END IF;
  IF TG_OP = 'INSERT' THEN NEW.created_by := coalesce(NEW.created_by, auth.uid()); END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_comissoes_metas_valida ON public.comissoes_metas;
CREATE TRIGGER trg_comissoes_metas_valida BEFORE INSERT OR UPDATE ON public.comissoes_metas
  FOR EACH ROW EXECUTE FUNCTION internal.trg_comissoes_metas_valida();

ALTER TABLE public.comissoes_metas ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.comissoes_metas FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.comissoes_metas TO authenticated;
CREATE POLICY comissoes_metas_select ON public.comissoes_metas FOR SELECT TO authenticated
  USING (internal.comissao_eh_gestor(empresa_id) OR usuario_id = auth.uid());
CREATE POLICY comissoes_metas_insert ON public.comissoes_metas FOR INSERT TO authenticated WITH CHECK (internal.comissao_eh_gestor(empresa_id));
CREATE POLICY comissoes_metas_update ON public.comissoes_metas FOR UPDATE TO authenticated
  USING (internal.comissao_eh_gestor(empresa_id)) WITH CHECK (internal.comissao_eh_gestor(empresa_id));
CREATE POLICY comissoes_metas_delete ON public.comissoes_metas FOR DELETE TO authenticated USING (internal.comissao_eh_gestor(empresa_id));

CREATE OR REPLACE FUNCTION internal.comissao_bonus_meta(p_loja uuid, p_operador uuid, p_comp date, p_base numeric)
RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  WITH m AS (
    SELECT mt.faixas FROM public.comissoes_metas mt JOIN public.lojas l ON l.id = p_loja AND l.empresa_id = mt.empresa_id
     WHERE mt.ativo AND (mt.loja_id IS NULL OR mt.loja_id = p_loja)
       AND mt.competencia_inicio <= p_comp AND (mt.competencia_fim IS NULL OR mt.competencia_fim >= p_comp)
       AND (mt.usuario_id IS NULL OR mt.usuario_id = p_operador)
       AND (mt.cargo IS NULL OR mt.cargo = internal.comissao_cargo_usuario(p_operador))
     ORDER BY (mt.usuario_id IS NOT NULL) DESC, (mt.cargo IS NOT NULL) DESC, (mt.loja_id IS NOT NULL) DESC, mt.competencia_inicio DESC, mt.id
     LIMIT 1)
  SELECT coalesce((SELECT round(greatest(p_base, 0) * (f->>'bonus_pct')::numeric / 100, 2)
    FROM m, jsonb_array_elements(m.faixas) f WHERE greatest(p_base, 0) >= (f->>'a_partir_de')::numeric
    ORDER BY (f->>'a_partir_de')::numeric DESC LIMIT 1), 0);
$$;

-- 4. Linhas do período com liberação, divisão e metas (substitui a versão do P1) -------------------
CREATE OR REPLACE FUNCTION internal.comissao_periodo_linhas(p_loja uuid, p_comp date)
RETURNS TABLE (operador_id uuid, vendas int, base numeric, comissao numeric, ajustes numeric, bonus_meta numeric, total numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  WITH modo AS (
    SELECT coalesce((SELECT cc.liberacao FROM public.comissoes_config cc JOIN public.lojas l ON l.empresa_id = cc.empresa_id WHERE l.id = p_loja), 'VENDA') AS m),
  cv AS (
    SELECT c.id, c.venda_id, c.operador_id, c.base_calculo, c.valor_comissao,
           coalesce(c.competencia, date_trunc('month', c.created_at AT TIME ZONE 'America/Sao_Paulo')::date) AS comp
      FROM public.comissoes_vendedores c WHERE c.loja_id = p_loja),
  lib AS (
    SELECT cv.venda_id, cv.operador_id, cv.base_calculo AS base, cv.valor_comissao AS valor, cv.comp
      FROM cv, modo WHERE modo.m = 'VENDA' AND cv.comp = p_comp
    UNION ALL
    SELECT cv.venda_id, cv.operador_id, l.o_base, l.o_valor, greatest(l.o_mes, cv.comp)
      FROM cv CROSS JOIN modo CROSS JOIN LATERAL internal.comissao_liberacoes(cv.id) l
     WHERE modo.m = 'RECEBIMENTO' AND cv.comp <= p_comp AND cv.comp > (p_comp - interval '26 months')),
  aj AS (
    SELECT a.venda_id, a.operador_id, a.valor
      FROM public.comissoes_ajustes a
     WHERE a.loja_id = p_loja AND coalesce(a.competencia, date_trunc('month', a.created_at AT TIME ZONE 'America/Sao_Paulo')::date) = p_comp),
  linhas AS (
    SELECT l.operador_id AS op, l.venda_id, l.base - coalesce(round(l.base * d.percentual / 100, 2), 0) AS base,
           l.valor - coalesce(round(l.valor * d.percentual / 100, 2), 0) AS valor, 0::numeric AS ajuste
      FROM lib l LEFT JOIN public.comissoes_divisoes d ON d.venda_id = l.venda_id WHERE l.comp = p_comp
    UNION ALL
    SELECT d.operador_secundario_id, l.venda_id, round(l.base * d.percentual / 100, 2), round(l.valor * d.percentual / 100, 2), 0
      FROM lib l JOIN public.comissoes_divisoes d ON d.venda_id = l.venda_id WHERE l.comp = p_comp
    UNION ALL
    SELECT a.operador_id, NULL, 0, 0, a.valor - coalesce(round(a.valor * d.percentual / 100, 2), 0)
      FROM aj a LEFT JOIN public.comissoes_divisoes d ON d.venda_id = a.venda_id
    UNION ALL
    SELECT d.operador_secundario_id, NULL, 0, 0, round(a.valor * d.percentual / 100, 2)
      FROM aj a JOIN public.comissoes_divisoes d ON d.venda_id = a.venda_id),
  agg AS (
    SELECT op, count(DISTINCT venda_id)::int AS vendas, sum(base) AS base, sum(valor) AS comissao, sum(ajuste) AS ajustes
      FROM linhas GROUP BY op)
  SELECT g.op, g.vendas, g.base, g.comissao, -g.ajustes, b.bonus,
         g.comissao - g.ajustes + b.bonus
    FROM agg g CROSS JOIN LATERAL (SELECT internal.comissao_bonus_meta(p_loja, g.op, p_comp, g.base) AS bonus) b;
$$;

-- 5. Autoatendimento do vendedor: vê só as próprias comissões ------------------------------------
DROP POLICY IF EXISTS comissoes_select_proprio ON public.comissoes_vendedores;
CREATE POLICY comissoes_select_proprio ON public.comissoes_vendedores FOR SELECT TO authenticated
  USING (operador_id = (SELECT auth.uid()));
DROP POLICY IF EXISTS comissoes_itens_select_proprio ON public.comissoes_itens;
CREATE POLICY comissoes_itens_select_proprio ON public.comissoes_itens FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.comissoes_vendedores cv WHERE cv.id = comissoes_itens.comissao_id AND cv.operador_id = (SELECT auth.uid())));
DROP POLICY IF EXISTS comissoes_ajustes_select_proprio ON public.comissoes_ajustes;
CREATE POLICY comissoes_ajustes_select_proprio ON public.comissoes_ajustes FOR SELECT TO authenticated
  USING (operador_id = (SELECT auth.uid()));

-- Resumo do vendedor logado em todas as lojas permitidas (meses recentes).
CREATE OR REPLACE FUNCTION public.minhas_comissoes(p_meses int DEFAULT 6)
RETURNS TABLE (loja_id uuid, loja_nome text, competencia date, status_periodo text, vendas int, base numeric,
  comissao numeric, ajustes numeric, bonus_meta numeric, total numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_uid uuid := auth.uid(); l record; c date; k int; per record;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'SEM_PERMISSAO'; END IF;
  FOR l IN SELECT lj.id, lj.nome FROM public.lojas lj WHERE public.fp_usuario_pode_loja(v_uid, lj.id) ORDER BY lj.nome LOOP
    FOR k IN 0..least(greatest(coalesce(p_meses, 6), 1), 24) - 1 LOOP
      c := (date_trunc('month', now() AT TIME ZONE 'America/Sao_Paulo') - make_interval(months => k))::date;
      SELECT * INTO per FROM public.comissoes_periodos cp WHERE cp.loja_id = l.id AND cp.competencia = c;
      loja_id := l.id; loja_nome := l.nome; competencia := c; status_periodo := coalesce(per.status, 'ABERTO');
      IF per.status IN ('APROVADO','PAGO') THEN
        SELECT s.vendas, s.base, s.comissao, s.ajustes, s.bonus_meta, s.total INTO vendas, base, comissao, ajustes, bonus_meta, total
          FROM public.comissoes_periodo_vendedores s WHERE s.periodo_id = per.id AND s.operador_id = v_uid;
      ELSE
        SELECT x.vendas, x.base, x.comissao, x.ajustes, x.bonus_meta, x.total INTO vendas, base, comissao, ajustes, bonus_meta, total
          FROM internal.comissao_periodo_linhas(l.id, c) x WHERE x.operador_id = v_uid;
      END IF;
      IF FOUND AND vendas IS NOT NULL THEN RETURN NEXT; END IF;
      vendas := NULL;
    END LOOP;
  END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.minhas_comissoes(int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.minhas_comissoes(int) TO authenticated;

-- 6. Exportação contábil/folha: somente período aprovado/pago, somente leitura (o arquivo é gerado no app).
CREATE OR REPLACE FUNCTION public.comissao_export_contabil(p_loja_id uuid, p_competencia date)
RETURNS TABLE (competencia date, loja_codigo text, loja_nome text, operador_id uuid, operador_nome text, status_periodo text,
  base numeric, comissao numeric, ajustes numeric, bonus_meta numeric, total numeric, aprovado_em timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE p record;
BEGIN
  IF NOT public.fp_pode_loja(p_loja_id, ARRAY['DONO','GERENTE']) THEN RAISE EXCEPTION 'SEM_PERMISSAO'; END IF;
  SELECT * INTO p FROM public.comissoes_periodos cp WHERE cp.loja_id = p_loja_id AND cp.competencia = date_trunc('month', p_competencia)::date;
  IF NOT FOUND OR p.status NOT IN ('APROVADO','PAGO') THEN RAISE EXCEPTION 'COMISSAO_PERIODO_NAO_APROVADO'; END IF;
  RETURN QUERY
  SELECT p.competencia, lj.codigo, lj.nome, s.operador_id, u.nome, p.status, s.base, s.comissao, s.ajustes, s.bonus_meta, s.total, p.aprovado_em
    FROM public.comissoes_periodo_vendedores s
    JOIN public.usuarios u ON u.id = s.operador_id
    JOIN public.lojas lj ON lj.id = p.loja_id
   WHERE s.periodo_id = p.id ORDER BY u.nome, s.operador_id;
END $$;
REVOKE ALL ON FUNCTION public.comissao_export_contabil(uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.comissao_export_contabil(uuid, date) TO authenticated;

REVOKE ALL ON FUNCTION internal.comissao_liberacoes(uuid), internal.comissao_bonus_meta(uuid, uuid, date, numeric)
  FROM PUBLIC, anon, authenticated;
COMMIT;
