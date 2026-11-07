-- ============================================================================
-- Import Intelligence — base de módulos opcionais sobre o multiempresa ATUAL do main
-- (fases 1–5 de 20261019*). Substitui, para este módulo, a dependência da M1/F1 do PR #537
-- (20261010120000_m1_*/20261010130000_f1_*), que conflita com o multiempresa já em produção.
--
--  * Aditiva: só cria tabelas/funções novas. Não altera tabelas, policies ou funções existentes.
--  * Módulo desabilitado por padrão (ausência de linha = desabilitado).
--  * Habilitação só por service_role, com autorização e motivo registrados (histórico append-only).
-- Rollback: backend/supabase/rollback/20261021130000_import_intelligence_base_modulos.rollback.sql
-- ============================================================================
BEGIN;

CREATE OR REPLACE FUNCTION public.trg_historico_imutavel()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  RAISE EXCEPTION 'HISTORICO_IMUTAVEL: % é append-only', TG_TABLE_NAME;
END
$$;

CREATE TABLE IF NOT EXISTS public.modulos_catalogo (
  codigo     text        PRIMARY KEY CHECK (codigo ~ '^[A-Z][A-Z_]*$'),
  descricao  text        NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.modulos_catalogo (codigo, descricao)
VALUES ('IMPORT_INTELLIGENCE', 'Import Intelligence — módulo opcional, habilitado por cliente contratante')
ON CONFLICT (codigo) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.empresa_modulos (
  empresa_id      uuid        NOT NULL REFERENCES public.empresas (id),
  modulo_codigo   text        NOT NULL REFERENCES public.modulos_catalogo (codigo),
  habilitado      boolean     NOT NULL DEFAULT false,
  autorizado_por  text,
  vigencia_inicio date,
  vigencia_fim    date,
  alterado_em     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (empresa_id, modulo_codigo),
  CONSTRAINT empresa_modulos_autorizacao_check
    CHECK (NOT habilitado OR (autorizado_por IS NOT NULL AND length(btrim(autorizado_por)) > 0))
);

CREATE TABLE IF NOT EXISTS public.empresa_modulos_historico (
  id             bigserial   PRIMARY KEY,
  empresa_id     uuid        NOT NULL REFERENCES public.empresas (id),
  modulo_codigo  text        NOT NULL REFERENCES public.modulos_catalogo (codigo),
  acao           text        NOT NULL CHECK (acao IN ('HABILITAR', 'DESABILITAR')),
  autorizado_por text,
  motivo         text        NOT NULL,
  origem         text        NOT NULL,
  registrado_em  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS empresa_modulos_historico_empresa_idx
  ON public.empresa_modulos_historico (empresa_id, modulo_codigo, registrado_em);

DROP TRIGGER IF EXISTS empresa_modulos_historico_imutavel ON public.empresa_modulos_historico;
CREATE TRIGGER empresa_modulos_historico_imutavel
  BEFORE UPDATE OR DELETE ON public.empresa_modulos_historico
  FOR EACH ROW EXECUTE FUNCTION public.trg_historico_imutavel();

CREATE OR REPLACE FUNCTION public.trg_empresa_modulos_historico()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.habilitado = NEW.habilitado
     AND OLD.autorizado_por IS NOT DISTINCT FROM NEW.autorizado_por THEN
    RETURN NEW;
  END IF;
  INSERT INTO public.empresa_modulos_historico (empresa_id, modulo_codigo, acao, autorizado_por, motivo, origem)
  VALUES (NEW.empresa_id, NEW.modulo_codigo,
          CASE WHEN NEW.habilitado THEN 'HABILITAR' ELSE 'DESABILITAR' END, NEW.autorizado_por,
          coalesce(nullif(current_setting('jinlong.modulo_motivo', true), ''), 'SEM_MOTIVO_REGISTRADO'),
          coalesce(nullif(current_setting('jinlong.modulo_origem', true), ''), 'ESCRITA_DIRETA'));
  RETURN NEW;
END
$$;
DROP TRIGGER IF EXISTS empresa_modulos_historico_trg ON public.empresa_modulos;
CREATE TRIGGER empresa_modulos_historico_trg AFTER INSERT OR UPDATE ON public.empresa_modulos
  FOR EACH ROW EXECUTE FUNCTION public.trg_empresa_modulos_historico();

-- Ativo = habilitado + vigência + empresa operacional (helper do main).
CREATE OR REPLACE FUNCTION public.fp_modulo_ativo(p_empresa uuid, p_modulo text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.empresa_modulos m
     WHERE m.empresa_id = p_empresa AND m.modulo_codigo = p_modulo AND m.habilitado
       AND (m.vigencia_inicio IS NULL OR m.vigencia_inicio <= current_date)
       AND (m.vigencia_fim IS NULL OR m.vigencia_fim >= current_date)
  ) AND public.fp_empresa_operacional(p_empresa)
$$;

-- Usuário: ativo + vínculo ativo na empresa com papel permitido + módulo ativo.
-- ADMIN legado SEM vínculo não entra (o módulo não herda o escopo global legado).
CREATE OR REPLACE FUNCTION public.fp_pode_modulo(p_empresa uuid, p_modulo text, p_papeis text[] DEFAULT ARRAY['DONO'])
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT public.fp_usuario_ativo()
     AND EXISTS (SELECT 1 FROM public.usuario_vinculos v
                  WHERE v.usuario_id = (SELECT auth.uid()) AND v.empresa_id = p_empresa AND v.ativo
                    AND v.papel = ANY (p_papeis))
     AND public.fp_modulo_ativo(p_empresa, p_modulo)
$$;

-- Escrita sobre loja: autorização (fp_pode_loja do main) + empresa operacional.
CREATE OR REPLACE FUNCTION public.fp_pode_operar_loja(p_loja uuid, p_papeis text[] DEFAULT ARRAY['DONO', 'GERENTE', 'OPERADOR'])
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT (SELECT auth.uid()) IS NOT NULL
     AND public.fp_pode_loja(p_loja, p_papeis)
     AND public.fp_empresa_operacional(public.fp_empresa_da_loja(p_loja))
$$;

-- Lojas das empresas em que o usuário tem vínculo ativo (cerca por vínculo; sem escopo legado).
CREATE OR REPLACE FUNCTION public.fp_lojas_cerca()
RETURNS uuid[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT coalesce(array_agg(l.id), '{}'::uuid[])
    FROM public.lojas l
   WHERE (SELECT auth.uid()) IS NOT NULL AND l.empresa_id IN (SELECT public.fp_empresas_do_usuario())
$$;

-- Empresa do contexto para um módulo, derivada do usuário (nunca do frontend).
CREATE OR REPLACE FUNCTION public.fp_empresa_contexto_modulo(
  p_modulo text, p_papeis text[] DEFAULT ARRAY['DONO'], p_empresa uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_ids uuid[];
BEGIN
  IF auth.uid() IS NULL OR p_modulo IS NULL THEN RETURN NULL; END IF;
  IF p_empresa IS NOT NULL THEN
    RETURN CASE WHEN public.fp_pode_modulo(p_empresa, p_modulo, p_papeis) THEN p_empresa END;
  END IF;
  SELECT array_agg(DISTINCT v.empresa_id) INTO v_ids
    FROM public.usuario_vinculos v
   WHERE v.usuario_id = auth.uid() AND v.ativo AND public.fp_pode_modulo(v.empresa_id, p_modulo, p_papeis);
  IF coalesce(cardinality(v_ids), 0) <> 1 THEN RETURN NULL; END IF;
  RETURN v_ids[1];
END
$$;

CREATE OR REPLACE FUNCTION public.ops_definir_modulo_empresa(
  p_empresa uuid, p_modulo text, p_habilitado boolean, p_autorizado_por text, p_motivo text,
  p_origem text DEFAULT 'ops_definir_modulo_empresa')
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF p_empresa IS NULL OR p_modulo IS NULL OR p_habilitado IS NULL THEN RAISE EXCEPTION 'MODULO_PARAMETRO_AUSENTE'; END IF;
  IF length(btrim(coalesce(p_motivo, ''))) < 10 THEN RAISE EXCEPTION 'MODULO_MOTIVO_OBRIGATORIO'; END IF;
  IF p_habilitado AND length(btrim(coalesce(p_autorizado_por, ''))) = 0 THEN RAISE EXCEPTION 'MODULO_AUTORIZACAO_OBRIGATORIA'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.empresas WHERE id = p_empresa) THEN RAISE EXCEPTION 'MODULO_EMPRESA_INEXISTENTE'; END IF;
  PERFORM set_config('jinlong.modulo_motivo', p_motivo, true);
  PERFORM set_config('jinlong.modulo_origem', coalesce(nullif(btrim(p_origem), ''), 'ops_definir_modulo_empresa'), true);
  INSERT INTO public.empresa_modulos (empresa_id, modulo_codigo, habilitado, autorizado_por, alterado_em)
  VALUES (p_empresa, p_modulo, p_habilitado, CASE WHEN p_habilitado THEN p_autorizado_por END, now())
  ON CONFLICT (empresa_id, modulo_codigo) DO UPDATE
    SET habilitado = EXCLUDED.habilitado, autorizado_por = EXCLUDED.autorizado_por, alterado_em = EXCLUDED.alterado_em;
END
$$;

REVOKE ALL ON FUNCTION public.ops_definir_modulo_empresa(uuid, text, boolean, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ops_definir_modulo_empresa(uuid, text, boolean, text, text, text) TO service_role;
REVOKE ALL ON FUNCTION public.fp_modulo_ativo(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fp_modulo_ativo(uuid, text) TO service_role;
REVOKE ALL ON FUNCTION public.fp_pode_modulo(uuid, text, text[]), public.fp_pode_operar_loja(uuid, text[]),
  public.fp_lojas_cerca(), public.fp_empresa_contexto_modulo(text, text[], uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fp_pode_modulo(uuid, text, text[]), public.fp_pode_operar_loja(uuid, text[]),
  public.fp_lojas_cerca(), public.fp_empresa_contexto_modulo(text, text[], uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.trg_empresa_modulos_historico() FROM PUBLIC, anon, authenticated;

ALTER TABLE public.modulos_catalogo ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.empresa_modulos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.empresa_modulos_historico ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.modulos_catalogo, public.empresa_modulos, public.empresa_modulos_historico FROM PUBLIC, anon, authenticated;

COMMIT;
