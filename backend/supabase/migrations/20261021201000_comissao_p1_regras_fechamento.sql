-- Módulo Comissão — P1: regras por funcionário/cargo/produto/categoria/canal, fechamento mensal e relatório.
-- ADITIVA. Sem regra cadastrada, a apuração segue a cadeia legada (P0) — produção hoje usa só o % global.
-- Fechamento: aberto → em revisão → aprovado → pago. Aprovado/pago trava o período; comissão ou ajuste que
-- chegar depois cai na próxima competência aberta. "Pago" é só marcação de controle: NADA é lançado em caixa,
-- contas a pagar ou folha.
-- Rollback: backend/supabase/rollback/20261021201000_comissao_p1_regras_fechamento.rollback.sql
BEGIN;

-- 1. Regras ---------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.comissoes_regras (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id      uuid NOT NULL REFERENCES public.empresas(id),
  loja_id         uuid NULL REFERENCES public.lojas(id),
  usuario_id      uuid NULL REFERENCES public.usuarios(id),
  cargo           text NULL CHECK (cargo IS NULL OR (cargo = lower(btrim(cargo)) AND char_length(cargo) BETWEEN 1 AND 80)),
  produto_id      uuid NULL REFERENCES public.produtos(id),
  categoria_id    uuid NULL REFERENCES public.categorias(id),
  canal           text NULL CHECK (canal IN ('VAREJO', 'ATACADO')),
  tipo_calculo    text NOT NULL CHECK (tipo_calculo IN ('percentual', 'fixo')),
  valor           numeric(12,4) NOT NULL CHECK (valor >= 0 AND (tipo_calculo = 'fixo' OR valor <= 100)),
  vigencia_inicio date NOT NULL DEFAULT CURRENT_DATE,
  vigencia_fim    date NULL,
  ativo           boolean NOT NULL DEFAULT true,
  descricao       text NULL CHECK (descricao IS NULL OR char_length(descricao) <= 200),
  created_by      uuid NULL REFERENCES public.usuarios(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT comissoes_regras_quem CHECK (usuario_id IS NULL OR cargo IS NULL),
  CONSTRAINT comissoes_regras_o_que CHECK (produto_id IS NULL OR categoria_id IS NULL),
  CONSTRAINT comissoes_regras_vigencia CHECK (vigencia_fim IS NULL OR vigencia_fim >= vigencia_inicio)
);
CREATE INDEX IF NOT EXISTS comissoes_regras_empresa_idx ON public.comissoes_regras (empresa_id) WHERE ativo;

-- Nível de especificidade (menor vence). Desempate: canal informado, loja informada, vigência mais recente, id.
CREATE OR REPLACE FUNCTION internal.comissao_regra_nivel(p_usuario uuid, p_cargo text, p_produto uuid, p_categoria uuid)
RETURNS int LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT CASE
    WHEN p_usuario IS NOT NULL AND p_produto IS NOT NULL THEN 1
    WHEN p_usuario IS NOT NULL AND p_categoria IS NOT NULL THEN 2
    WHEN p_usuario IS NOT NULL THEN 3
    WHEN p_cargo IS NOT NULL AND p_produto IS NOT NULL THEN 4
    WHEN p_cargo IS NOT NULL AND p_categoria IS NOT NULL THEN 5
    WHEN p_cargo IS NOT NULL THEN 6
    WHEN p_produto IS NOT NULL THEN 7
    WHEN p_categoria IS NOT NULL THEN 8
    ELSE 9 END;
$$;

CREATE TABLE IF NOT EXISTS public.comissoes_regras_log (
  id         bigserial PRIMARY KEY,
  regra_id   uuid NOT NULL,
  empresa_id uuid NOT NULL,
  acao       text NOT NULL CHECK (acao IN ('INSERT', 'UPDATE', 'DELETE')),
  dados      jsonb NOT NULL,
  por        uuid NULL,
  em         timestamptz NOT NULL DEFAULT now()
);

-- Integridade multiempresa: loja/usuário/produto/categoria da MESMA empresa.
CREATE OR REPLACE FUNCTION internal.trg_comissoes_regras_valida()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.loja_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.lojas WHERE id = NEW.loja_id AND empresa_id = NEW.empresa_id) THEN
    RAISE EXCEPTION 'COMISSAO_REGRA_LOJA_OUTRA_EMPRESA'; END IF;
  IF NEW.usuario_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.usuario_vinculos WHERE usuario_id = NEW.usuario_id AND empresa_id = NEW.empresa_id AND ativo) THEN
    RAISE EXCEPTION 'COMISSAO_REGRA_USUARIO_OUTRA_EMPRESA'; END IF;
  IF NEW.produto_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.produtos p JOIN public.lojas l ON l.id = p.loja_id WHERE p.id = NEW.produto_id AND l.empresa_id = NEW.empresa_id) THEN
    RAISE EXCEPTION 'COMISSAO_REGRA_PRODUTO_OUTRA_EMPRESA'; END IF;
  IF NEW.categoria_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.categorias WHERE id = NEW.categoria_id AND empresa_id = NEW.empresa_id) THEN
    RAISE EXCEPTION 'COMISSAO_REGRA_CATEGORIA_OUTRA_EMPRESA'; END IF;
  IF TG_OP = 'UPDATE' AND NEW.empresa_id <> OLD.empresa_id THEN RAISE EXCEPTION 'COMISSAO_REGRA_EMPRESA_IMUTAVEL'; END IF;
  NEW.updated_at := now();
  IF TG_OP = 'INSERT' THEN NEW.created_by := coalesce(NEW.created_by, auth.uid()); END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_comissoes_regras_valida ON public.comissoes_regras;
CREATE TRIGGER trg_comissoes_regras_valida BEFORE INSERT OR UPDATE ON public.comissoes_regras
  FOR EACH ROW EXECUTE FUNCTION internal.trg_comissoes_regras_valida();

CREATE OR REPLACE FUNCTION internal.trg_comissoes_regras_log()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE r public.comissoes_regras;
BEGIN
  r := CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  INSERT INTO public.comissoes_regras_log (regra_id, empresa_id, acao, dados, por) VALUES (r.id, r.empresa_id, TG_OP, to_jsonb(r), auth.uid());
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS trg_comissoes_regras_log ON public.comissoes_regras;
CREATE TRIGGER trg_comissoes_regras_log AFTER INSERT OR UPDATE OR DELETE ON public.comissoes_regras
  FOR EACH ROW EXECUTE FUNCTION internal.trg_comissoes_regras_log();

ALTER TABLE public.comissoes_regras ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comissoes_regras_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.comissoes_regras, public.comissoes_regras_log FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.comissoes_regras TO authenticated;
GRANT SELECT ON public.comissoes_regras_log TO authenticated;
CREATE POLICY comissoes_regras_select ON public.comissoes_regras FOR SELECT TO authenticated
  USING (internal.comissao_eh_gestor(empresa_id));
CREATE POLICY comissoes_regras_insert ON public.comissoes_regras FOR INSERT TO authenticated
  WITH CHECK (internal.comissao_eh_gestor(empresa_id));
CREATE POLICY comissoes_regras_update ON public.comissoes_regras FOR UPDATE TO authenticated
  USING (internal.comissao_eh_gestor(empresa_id)) WITH CHECK (internal.comissao_eh_gestor(empresa_id));
CREATE POLICY comissoes_regras_delete ON public.comissoes_regras FOR DELETE TO authenticated
  USING (internal.comissao_eh_gestor(empresa_id));
CREATE POLICY comissoes_regras_log_select ON public.comissoes_regras_log FOR SELECT TO authenticated
  USING (internal.comissao_eh_gestor(empresa_id));

-- Gancho do P0, agora com regras reais (determinístico).
CREATE OR REPLACE FUNCTION internal.comissao_regra_empresa(p_loja uuid, p_vendedor uuid, p_produto uuid, p_canal text, p_data date)
RETURNS TABLE (o_regra_id uuid, o_tipo_calculo text, o_valor numeric, o_nivel int)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  WITH ctx AS (
    SELECT l.empresa_id, internal.comissao_cargo_usuario(p_vendedor) AS cargo,
           (SELECT p.categoria_id FROM public.produtos p WHERE p.id = p_produto) AS categoria
      FROM public.lojas l WHERE l.id = p_loja)
  SELECT r.id, r.tipo_calculo, r.valor, internal.comissao_regra_nivel(r.usuario_id, r.cargo, r.produto_id, r.categoria_id)
    FROM public.comissoes_regras r, ctx
   WHERE r.empresa_id = ctx.empresa_id AND r.ativo
     AND (r.loja_id IS NULL OR r.loja_id = p_loja)
     AND r.vigencia_inicio <= p_data AND (r.vigencia_fim IS NULL OR r.vigencia_fim >= p_data)
     AND (r.usuario_id IS NULL OR r.usuario_id = p_vendedor)
     AND (r.cargo IS NULL OR r.cargo = ctx.cargo)
     AND (r.produto_id IS NULL OR r.produto_id = p_produto)
     AND (r.categoria_id IS NULL OR r.categoria_id = ctx.categoria)
     AND (r.canal IS NULL OR r.canal = p_canal)
   ORDER BY internal.comissao_regra_nivel(r.usuario_id, r.cargo, r.produto_id, r.categoria_id),
            (r.canal IS NOT NULL) DESC, (r.loja_id IS NOT NULL) DESC, r.vigencia_inicio DESC, r.id
   LIMIT 1;
$$;

-- Prévia "qual regra vale" (tela de regras). Sem regra da empresa, mostra a origem legada.
CREATE OR REPLACE FUNCTION public.comissao_simular_regra(p_loja_id uuid, p_vendedor_id uuid, p_produto_id uuid,
  p_canal text DEFAULT 'VAREJO', p_data date DEFAULT CURRENT_DATE)
RETURNS TABLE (regra_id uuid, nivel int, tipo_calculo text, valor numeric, origem text, cargo text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE e record; p record; v_global numeric;
BEGIN
  IF NOT public.fp_pode_loja(p_loja_id, ARRAY['DONO','GERENTE']) THEN RAISE EXCEPTION 'SEM_PERMISSAO'; END IF;
  cargo := internal.comissao_cargo_usuario(p_vendedor_id);
  SELECT * INTO e FROM internal.comissao_regra_empresa(p_loja_id, p_vendedor_id, p_produto_id, upper(coalesce(p_canal,'VAREJO')), p_data);
  IF FOUND THEN
    regra_id := e.o_regra_id; nivel := e.o_nivel; tipo_calculo := e.o_tipo_calculo; valor := e.o_valor; origem := 'REGRA_EMPRESA';
    RETURN NEXT; RETURN;
  END IF;
  SELECT comissao_tipo, comissao_valor INTO p FROM public.produtos WHERE id = p_produto_id;
  SELECT coalesce(cg.valor::numeric, 0) INTO v_global FROM public.configuracoes_gerais cg
   WHERE cg.chave = 'comissao_padrao_percentual' AND cg.empresa_id = public.fp_empresa_da_loja(p_loja_id) LIMIT 1;
  regra_id := NULL; nivel := NULL;
  IF p.comissao_tipo = 'fixo' AND p.comissao_valor IS NOT NULL THEN tipo_calculo := 'fixo'; valor := p.comissao_valor; origem := 'PRODUTO_FIXO';
  ELSIF p.comissao_tipo = 'percentual' AND p.comissao_valor IS NOT NULL THEN tipo_calculo := 'percentual'; valor := p.comissao_valor; origem := 'PRODUTO_PERCENTUAL';
  ELSE tipo_calculo := 'percentual'; valor := coalesce(v_global, 0); origem := 'GLOBAL'; END IF;
  RETURN NEXT;
END $$;
REVOKE ALL ON FUNCTION public.comissao_simular_regra(uuid, uuid, uuid, text, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.comissao_simular_regra(uuid, uuid, uuid, text, date) TO authenticated;

-- 2. Fechamento -----------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.comissoes_periodos (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id   uuid NOT NULL REFERENCES public.empresas(id),
  loja_id      uuid NOT NULL REFERENCES public.lojas(id),
  competencia  date NOT NULL CHECK (competencia = date_trunc('month', competencia)::date),
  status       text NOT NULL DEFAULT 'ABERTO' CHECK (status IN ('ABERTO', 'EM_REVISAO', 'APROVADO', 'PAGO')),
  total        numeric(14,2) NOT NULL DEFAULT 0,
  revisado_por uuid NULL REFERENCES public.usuarios(id), revisado_em timestamptz NULL,
  aprovado_por uuid NULL REFERENCES public.usuarios(id), aprovado_em timestamptz NULL,
  pago_por     uuid NULL REFERENCES public.usuarios(id), pago_em timestamptz NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (loja_id, competencia)
);
CREATE TABLE IF NOT EXISTS public.comissoes_periodo_vendedores (
  periodo_id   uuid NOT NULL REFERENCES public.comissoes_periodos(id) ON DELETE CASCADE,
  operador_id  uuid NOT NULL REFERENCES public.usuarios(id),
  vendas       integer NOT NULL DEFAULT 0,
  base         numeric(14,2) NOT NULL DEFAULT 0,
  comissao     numeric(14,2) NOT NULL DEFAULT 0,
  ajustes      numeric(14,2) NOT NULL DEFAULT 0,
  bonus_meta   numeric(14,2) NOT NULL DEFAULT 0,
  total        numeric(14,2) NOT NULL DEFAULT 0,
  PRIMARY KEY (periodo_id, operador_id)
);
ALTER TABLE public.comissoes_periodos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comissoes_periodo_vendedores ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.comissoes_periodos, public.comissoes_periodo_vendedores FROM anon, authenticated;
GRANT SELECT ON public.comissoes_periodos, public.comissoes_periodo_vendedores TO authenticated;
CREATE POLICY comissoes_periodos_select ON public.comissoes_periodos FOR SELECT TO authenticated
  USING (public.fp_pode_loja(loja_id, ARRAY['DONO','GERENTE']));
CREATE POLICY comissoes_periodo_vendedores_select ON public.comissoes_periodo_vendedores FOR SELECT TO authenticated
  USING (operador_id = auth.uid() OR EXISTS (SELECT 1 FROM public.comissoes_periodos p WHERE p.id = periodo_id
          AND public.fp_pode_loja(p.loja_id, ARRAY['DONO','GERENTE'])));

-- Competência: mês do fato, ou o primeiro mês seguinte ainda não travado (aprovado/pago) da loja.
CREATE OR REPLACE FUNCTION internal.comissao_competencia_aberta(p_loja uuid, p_data timestamptz)
RETURNS date LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE c date := date_trunc('month', (coalesce(p_data, now()) AT TIME ZONE 'America/Sao_Paulo'))::date;
BEGIN
  WHILE EXISTS (SELECT 1 FROM public.comissoes_periodos WHERE loja_id = p_loja AND competencia = c AND status IN ('APROVADO','PAGO')) LOOP
    c := (c + interval '1 month')::date;
  END LOOP;
  RETURN c;
END $$;
CREATE OR REPLACE FUNCTION internal.comissao_periodo_travado(p_loja uuid, p_comp date)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (SELECT 1 FROM public.comissoes_periodos WHERE loja_id = p_loja AND competencia = p_comp AND status IN ('APROVADO','PAGO'));
$$;

ALTER TABLE public.comissoes_vendedores ADD COLUMN IF NOT EXISTS competencia date NULL;
ALTER TABLE public.comissoes_ajustes ADD COLUMN IF NOT EXISTS competencia date NULL;
COMMENT ON COLUMN public.comissoes_vendedores.competencia IS 'Mês de apuração (NULL em linhas anteriores ao módulo = mês de created_at).';
COMMENT ON COLUMN public.comissoes_ajustes.competencia IS 'Mês em que o ajuste entra; período aprovado empurra para o próximo aberto.';

CREATE OR REPLACE FUNCTION internal.trg_comissao_competencia()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_data timestamptz;
BEGIN
  IF TG_TABLE_NAME = 'comissoes_vendedores' THEN
    SELECT v.data INTO v_data FROM public.vendas v WHERE v.id = NEW.venda_id;
  ELSE
    v_data := now();
  END IF;
  NEW.competencia := internal.comissao_competencia_aberta(NEW.loja_id, v_data);
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_comissoes_vendedores_competencia ON public.comissoes_vendedores;
CREATE TRIGGER trg_comissoes_vendedores_competencia BEFORE INSERT ON public.comissoes_vendedores
  FOR EACH ROW EXECUTE FUNCTION internal.trg_comissao_competencia();
DROP TRIGGER IF EXISTS trg_comissoes_ajustes_competencia ON public.comissoes_ajustes;
CREATE TRIGGER trg_comissoes_ajustes_competencia BEFORE INSERT ON public.comissoes_ajustes
  FOR EACH ROW EXECUTE FUNCTION internal.trg_comissao_competencia();

-- Trava: comissão de período aprovado/pago não muda de valor, base, vendedor, nem some.
-- (status/pago_em/pagamento_id continuam livres para a liquidação existente.)
CREATE OR REPLACE FUNCTION internal.trg_comissao_trava_periodo()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_loja uuid; v_comp date;
BEGIN
  IF TG_TABLE_NAME = 'comissoes_vendedores' THEN
    v_loja := OLD.loja_id; v_comp := coalesce(OLD.competencia, date_trunc('month', OLD.created_at AT TIME ZONE 'America/Sao_Paulo')::date);
    IF TG_OP = 'UPDATE' AND NEW.valor_comissao IS NOT DISTINCT FROM OLD.valor_comissao AND NEW.base_calculo IS NOT DISTINCT FROM OLD.base_calculo
       AND NEW.operador_id IS NOT DISTINCT FROM OLD.operador_id AND NEW.competencia IS NOT DISTINCT FROM OLD.competencia THEN
      RETURN NEW;
    END IF;
  ELSE
    SELECT cv.loja_id, coalesce(cv.competencia, date_trunc('month', cv.created_at AT TIME ZONE 'America/Sao_Paulo')::date)
      INTO v_loja, v_comp FROM public.comissoes_vendedores cv WHERE cv.id = OLD.comissao_id;
  END IF;
  IF internal.comissao_periodo_travado(v_loja, v_comp) THEN RAISE EXCEPTION 'COMISSAO_PERIODO_TRAVADO'; END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END $$;
DROP TRIGGER IF EXISTS trg_comissoes_vendedores_trava ON public.comissoes_vendedores;
CREATE TRIGGER trg_comissoes_vendedores_trava BEFORE UPDATE OR DELETE ON public.comissoes_vendedores
  FOR EACH ROW EXECUTE FUNCTION internal.trg_comissao_trava_periodo();
DROP TRIGGER IF EXISTS trg_comissoes_itens_trava ON public.comissoes_itens;
CREATE TRIGGER trg_comissoes_itens_trava BEFORE UPDATE OR DELETE ON public.comissoes_itens
  FOR EACH ROW EXECUTE FUNCTION internal.trg_comissao_trava_periodo();

-- Linhas por vendedor de uma competência (P2 substitui para metas/divisão/recebimento).
CREATE OR REPLACE FUNCTION internal.comissao_periodo_linhas(p_loja uuid, p_comp date)
RETURNS TABLE (operador_id uuid, vendas int, base numeric, comissao numeric, ajustes numeric, bonus_meta numeric, total numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  WITH c AS (
    SELECT cv.operador_id, count(*)::int AS vendas, sum(cv.base_calculo) AS base, sum(cv.valor_comissao) AS comissao
      FROM public.comissoes_vendedores cv
     WHERE cv.loja_id = p_loja
       AND coalesce(cv.competencia, date_trunc('month', cv.created_at AT TIME ZONE 'America/Sao_Paulo')::date) = p_comp
     GROUP BY cv.operador_id),
  a AS (
    SELECT aj.operador_id, sum(aj.valor) AS ajustes FROM public.comissoes_ajustes aj
     WHERE aj.loja_id = p_loja
       AND coalesce(aj.competencia, date_trunc('month', aj.created_at AT TIME ZONE 'America/Sao_Paulo')::date) = p_comp
     GROUP BY aj.operador_id)
  SELECT coalesce(c.operador_id, a.operador_id), coalesce(c.vendas, 0), coalesce(c.base, 0), coalesce(c.comissao, 0),
         -coalesce(a.ajustes, 0), 0::numeric, coalesce(c.comissao, 0) - coalesce(a.ajustes, 0)
    FROM c FULL JOIN a ON a.operador_id = c.operador_id;
$$;

CREATE OR REPLACE FUNCTION internal.comissao_periodo_snapshot(p_periodo uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE p record;
BEGIN
  SELECT * INTO p FROM public.comissoes_periodos WHERE id = p_periodo;
  DELETE FROM public.comissoes_periodo_vendedores WHERE periodo_id = p_periodo;
  INSERT INTO public.comissoes_periodo_vendedores (periodo_id, operador_id, vendas, base, comissao, ajustes, bonus_meta, total)
  SELECT p_periodo, l.operador_id, l.vendas, l.base, l.comissao, l.ajustes, l.bonus_meta, l.total
    FROM internal.comissao_periodo_linhas(p.loja_id, p.competencia) l WHERE l.operador_id IS NOT NULL;
  UPDATE public.comissoes_periodos SET total = coalesce((SELECT sum(total) FROM public.comissoes_periodo_vendedores WHERE periodo_id = p_periodo), 0)
   WHERE id = p_periodo;
END $$;

CREATE OR REPLACE FUNCTION public.comissao_periodo_transicionar(p_loja_id uuid, p_competencia date, p_para text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_comp date := date_trunc('month', p_competencia)::date; p record; v_uid uuid := auth.uid();
BEGIN
  IF NOT public.fp_pode_loja(p_loja_id, ARRAY['DONO','GERENTE']) THEN RAISE EXCEPTION 'SEM_PERMISSAO'; END IF;
  INSERT INTO public.comissoes_periodos (empresa_id, loja_id, competencia)
  VALUES (public.fp_empresa_da_loja(p_loja_id), p_loja_id, v_comp) ON CONFLICT (loja_id, competencia) DO NOTHING;
  SELECT * INTO p FROM public.comissoes_periodos WHERE loja_id = p_loja_id AND competencia = v_comp FOR UPDATE;
  IF (p.status, p_para) IN (('ABERTO','EM_REVISAO')) THEN
    PERFORM internal.comissao_periodo_snapshot(p.id);
    UPDATE public.comissoes_periodos SET status = 'EM_REVISAO', revisado_por = v_uid, revisado_em = now() WHERE id = p.id;
  ELSIF (p.status, p_para) IN (('EM_REVISAO','ABERTO')) THEN
    UPDATE public.comissoes_periodos SET status = 'ABERTO' WHERE id = p.id;
  ELSIF (p.status, p_para) IN (('EM_REVISAO','APROVADO')) THEN
    PERFORM internal.comissao_periodo_snapshot(p.id);   -- foto final no instante da aprovação
    UPDATE public.comissoes_periodos SET status = 'APROVADO', aprovado_por = v_uid, aprovado_em = now() WHERE id = p.id;
  ELSIF (p.status, p_para) IN (('APROVADO','PAGO')) THEN
    UPDATE public.comissoes_periodos SET status = 'PAGO', pago_por = v_uid, pago_em = now() WHERE id = p.id;  -- só marcação
  ELSE
    RAISE EXCEPTION 'COMISSAO_TRANSICAO_INVALIDA:%->%', p.status, p_para;
  END IF;
  SELECT * INTO p FROM public.comissoes_periodos WHERE id = p.id;
  RETURN jsonb_build_object('id', p.id, 'status', p.status, 'total', p.total);
END $$;
REVOKE ALL ON FUNCTION public.comissao_periodo_transicionar(uuid, date, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.comissao_periodo_transicionar(uuid, date, text) TO authenticated;

-- 3. Relatório por vendedor (foto do fechamento quando aprovado/pago; senão ao vivo) ---------------
CREATE OR REPLACE FUNCTION public.comissao_relatorio_vendedores(p_loja_id uuid, p_competencia date)
RETURNS TABLE (operador_id uuid, operador_nome text, vendas int, base numeric, comissao numeric, ajustes numeric,
  bonus_meta numeric, total numeric, status_periodo text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_comp date := date_trunc('month', p_competencia)::date; v_gestor boolean; p record;
BEGIN
  v_gestor := public.fp_pode_loja(p_loja_id, ARRAY['DONO','GERENTE']);
  IF NOT v_gestor AND NOT public.fp_pode_loja(p_loja_id) THEN RAISE EXCEPTION 'SEM_PERMISSAO'; END IF;
  SELECT * INTO p FROM public.comissoes_periodos cp WHERE cp.loja_id = p_loja_id AND cp.competencia = v_comp;
  IF FOUND AND p.status IN ('APROVADO','PAGO') THEN
    RETURN QUERY SELECT s.operador_id, u.nome, s.vendas, s.base, s.comissao, s.ajustes, s.bonus_meta, s.total, p.status
      FROM public.comissoes_periodo_vendedores s JOIN public.usuarios u ON u.id = s.operador_id
     WHERE s.periodo_id = p.id AND (v_gestor OR s.operador_id = auth.uid()) ORDER BY u.nome;
  ELSE
    RETURN QUERY SELECT l.operador_id, u.nome, l.vendas, l.base, l.comissao, l.ajustes, l.bonus_meta, l.total, coalesce(p.status, 'ABERTO')
      FROM internal.comissao_periodo_linhas(p_loja_id, v_comp) l JOIN public.usuarios u ON u.id = l.operador_id
     WHERE v_gestor OR l.operador_id = auth.uid() ORDER BY u.nome;
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.comissao_relatorio_vendedores(uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.comissao_relatorio_vendedores(uuid, date) TO authenticated;

-- Drill-down por venda/item do vendedor (gestor: qualquer vendedor da loja; vendedor: só ele).
CREATE OR REPLACE FUNCTION public.comissao_relatorio_itens(p_loja_id uuid, p_competencia date, p_operador_id uuid)
RETURNS TABLE (venda_id uuid, data timestamptz, produto text, quantidade numeric, base numeric, origem_regra text,
  tipo_calculo text, percentual numeric, valor_fixo numeric, comissao numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_comp date := date_trunc('month', p_competencia)::date;
BEGIN
  IF NOT (public.fp_pode_loja(p_loja_id, ARRAY['DONO','GERENTE']) OR (p_operador_id = auth.uid() AND public.fp_pode_loja(p_loja_id))) THEN
    RAISE EXCEPTION 'SEM_PERMISSAO'; END IF;
  RETURN QUERY
  SELECT cv.venda_id, v.data, pr.nome, ci.quantidade, ci.base_elegivel, ci.origem_regra, ci.tipo_calculo,
         ci.percentual_aplicado, ci.valor_unitario_fixo, ci.valor_comissao
    FROM public.comissoes_vendedores cv
    JOIN public.vendas v ON v.id = cv.venda_id
    JOIN public.comissoes_itens ci ON ci.comissao_id = cv.id
    JOIN public.produtos pr ON pr.id = ci.produto_id
   WHERE cv.loja_id = p_loja_id AND cv.operador_id = p_operador_id
     AND coalesce(cv.competencia, date_trunc('month', cv.created_at AT TIME ZONE 'America/Sao_Paulo')::date) = v_comp
   ORDER BY v.data, cv.venda_id, pr.nome;
END $$;
REVOKE ALL ON FUNCTION public.comissao_relatorio_itens(uuid, date, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.comissao_relatorio_itens(uuid, date, uuid) TO authenticated;

-- Reatribuição de vendedor também respeita a trava (mensagem clara antes de tentar apagar).
CREATE OR REPLACE FUNCTION internal.comissao_bloqueio_reatribuicao(p_venda_id uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT CASE
    WHEN EXISTS (SELECT 1 FROM public.comissoes_vendedores cv WHERE cv.venda_id = p_venda_id
                  AND (cv.status <> 'pendente' OR cv.pagamento_id IS NOT NULL)) THEN 'COMISSAO_JA_PAGA'
    WHEN EXISTS (SELECT 1 FROM public.comissoes_ajustes a WHERE a.venda_id = p_venda_id) THEN 'COMISSAO_COM_AJUSTE'
    WHEN EXISTS (SELECT 1 FROM public.comissoes_vendedores cv WHERE cv.venda_id = p_venda_id
                  AND internal.comissao_periodo_travado(cv.loja_id, coalesce(cv.competencia,
                        date_trunc('month', cv.created_at AT TIME ZONE 'America/Sao_Paulo')::date))) THEN 'COMISSAO_PERIODO_TRAVADO'
  END;
$$;

REVOKE ALL ON FUNCTION internal.comissao_periodo_snapshot(uuid), internal.comissao_periodo_linhas(uuid, date),
  internal.comissao_competencia_aberta(uuid, timestamptz) FROM PUBLIC, anon, authenticated;
COMMIT;
