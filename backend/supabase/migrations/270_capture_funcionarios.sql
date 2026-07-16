-- ============================================================
-- Migration 270 — CAPTURE de reconciliação (P0.1)
--
-- Objetivo: versionar no repo objetos APLICADOS EM PRODUÇÃO (jinlong) FORA
-- do repositório (ledger de produção: 259_funcionarios_separate_from_usuarios,
-- 267_funcionarios_meta_crud). Este arquivo reproduz FIELMENTE o estado atual
-- de produção capturado em 2026-07-16 via introspecção (pg_get_functiondef,
-- information_schema, pg_policies, pg_get_triggerdef).
--
-- NÃO altera comportamento: apenas captura o estado existente. Idempotente
-- (IF NOT EXISTS / CREATE OR REPLACE / DROP POLICY IF EXISTS). Em produção,
-- os objetos já existem → no-op. Em rebuild limpo → recria o schema real.
-- ============================================================

-- ---------- tabela funcionarios ----------
CREATE TABLE IF NOT EXISTS public.funcionarios (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  loja_id uuid NOT NULL,
  nome text NOT NULL,
  cpf text,
  telefone text,
  email text,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT funcionarios_pkey PRIMARY KEY (id),
  CONSTRAINT funcionarios_cpf_key UNIQUE (cpf),
  CONSTRAINT funcionarios_loja_id_fkey FOREIGN KEY (loja_id) REFERENCES public.lojas (id)
);
CREATE INDEX IF NOT EXISTS idx_funcionarios_loja_ativo ON public.funcionarios USING btree (loja_id, ativo);
CREATE INDEX IF NOT EXISTS idx_funcionarios_cpf ON public.funcionarios USING btree (cpf) WHERE (cpf IS NOT NULL);
ALTER TABLE public.funcionarios ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS funcionarios_select_loja ON public.funcionarios;
CREATE POLICY funcionarios_select_loja ON public.funcionarios FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.usuarios u WHERE u.id = auth.uid() AND u.loja_id = funcionarios.loja_id));
DROP POLICY IF EXISTS funcionarios_select_dono ON public.funcionarios;
CREATE POLICY funcionarios_select_dono ON public.funcionarios FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.usuarios u WHERE u.id = auth.uid() AND u.perfil = 'DONO'));
DROP POLICY IF EXISTS funcionarios_write_loja ON public.funcionarios;
CREATE POLICY funcionarios_write_loja ON public.funcionarios FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.usuarios u WHERE u.id = auth.uid()
    AND u.perfil = ANY (ARRAY['GERENTE','DONO','ADMIN']) AND (u.perfil = 'DONO' OR u.loja_id = funcionarios.loja_id)));

-- ---------- tabela funcionarios_meta ----------
CREATE TABLE IF NOT EXISTS public.funcionarios_meta (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  usuario_id uuid NOT NULL,
  loja_id uuid NOT NULL,
  nome_exibicao text NOT NULL,
  email text NOT NULL,
  cargo text NOT NULL,
  comissao_percentual numeric,
  comissao_tipo text,
  comissao_valor numeric,
  data_admissao date NOT NULL DEFAULT CURRENT_DATE,
  criado_por uuid NOT NULL,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_por uuid,
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  ativo boolean NOT NULL DEFAULT true,
  CONSTRAINT funcionarios_meta_pkey PRIMARY KEY (id),
  CONSTRAINT funcionarios_meta_usuario_id_key UNIQUE (usuario_id),
  CONSTRAINT email_loja_unique UNIQUE (email, loja_id),
  CONSTRAINT funcionarios_meta_cargo_check CHECK (cargo = ANY (ARRAY['operador','gerente','supervisor','outro'])),
  CONSTRAINT funcionarios_meta_comissao_percentual_check CHECK (comissao_percentual >= 0 AND comissao_percentual <= 100),
  CONSTRAINT funcionarios_meta_comissao_tipo_check CHECK (comissao_tipo = ANY (ARRAY['percentual','fixo',NULL])),
  CONSTRAINT funcionarios_meta_comissao_valor_check CHECK (comissao_valor >= 0),
  CONSTRAINT funcionarios_meta_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES public.usuarios (id) ON DELETE CASCADE,
  CONSTRAINT funcionarios_meta_loja_id_fkey FOREIGN KEY (loja_id) REFERENCES public.lojas (id),
  CONSTRAINT funcionarios_meta_criado_por_fkey FOREIGN KEY (criado_por) REFERENCES public.usuarios (id),
  CONSTRAINT funcionarios_meta_atualizado_por_fkey FOREIGN KEY (atualizado_por) REFERENCES public.usuarios (id)
);
CREATE INDEX IF NOT EXISTS idx_funcionarios_meta_loja_id ON public.funcionarios_meta USING btree (loja_id);
CREATE INDEX IF NOT EXISTS idx_funcionarios_meta_usuario_id ON public.funcionarios_meta USING btree (usuario_id);
CREATE INDEX IF NOT EXISTS idx_funcionarios_meta_email_loja ON public.funcionarios_meta USING btree (email, loja_id);
CREATE INDEX IF NOT EXISTS idx_funcionarios_meta_ativo ON public.funcionarios_meta USING btree (ativo);
ALTER TABLE public.funcionarios_meta ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS funcionarios_meta_select_dono ON public.funcionarios_meta;
CREATE POLICY funcionarios_meta_select_dono ON public.funcionarios_meta FOR SELECT TO public USING (auth_usuario_eh_dono());
DROP POLICY IF EXISTS funcionarios_meta_select_gerente ON public.funcionarios_meta;
CREATE POLICY funcionarios_meta_select_gerente ON public.funcionarios_meta FOR SELECT TO public
  USING (EXISTS (SELECT 1 FROM public.usuarios u WHERE u.id = auth.uid() AND u.perfil = ANY (ARRAY['GERENTE','ADMIN']) AND u.loja_id = funcionarios_meta.loja_id));
DROP POLICY IF EXISTS funcionarios_meta_select_operador ON public.funcionarios_meta;
CREATE POLICY funcionarios_meta_select_operador ON public.funcionarios_meta FOR SELECT TO public USING (usuario_id = auth.uid());
DROP POLICY IF EXISTS funcionarios_meta_insert_dono ON public.funcionarios_meta;
CREATE POLICY funcionarios_meta_insert_dono ON public.funcionarios_meta FOR INSERT TO public WITH CHECK (auth_usuario_eh_dono());
DROP POLICY IF EXISTS funcionarios_meta_insert_gerente ON public.funcionarios_meta;
CREATE POLICY funcionarios_meta_insert_gerente ON public.funcionarios_meta FOR INSERT TO public
  WITH CHECK (EXISTS (SELECT 1 FROM public.usuarios u WHERE u.id = auth.uid() AND u.perfil = ANY (ARRAY['GERENTE','ADMIN']) AND u.loja_id = funcionarios_meta.loja_id));
DROP POLICY IF EXISTS funcionarios_meta_update_dono ON public.funcionarios_meta;
CREATE POLICY funcionarios_meta_update_dono ON public.funcionarios_meta FOR UPDATE TO public USING (auth_usuario_eh_dono()) WITH CHECK (auth_usuario_eh_dono());
DROP POLICY IF EXISTS funcionarios_meta_update_gerente ON public.funcionarios_meta;
CREATE POLICY funcionarios_meta_update_gerente ON public.funcionarios_meta FOR UPDATE TO public
  USING (EXISTS (SELECT 1 FROM public.usuarios u WHERE u.id = auth.uid() AND u.perfil = ANY (ARRAY['GERENTE','ADMIN']) AND u.loja_id = funcionarios_meta.loja_id))
  WITH CHECK (EXISTS (SELECT 1 FROM public.usuarios u WHERE u.id = auth.uid() AND u.perfil = ANY (ARRAY['GERENTE','ADMIN']) AND u.loja_id = funcionarios_meta.loja_id));

-- ---------- funções (SECURITY DEFINER, search_path=public) ----------
CREATE OR REPLACE FUNCTION public.fn_audit_update_funcionarios_meta()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$ BEGIN NEW.atualizado_por = auth.uid(); NEW.atualizado_em = now(); RETURN NEW; END; $function$;

DROP TRIGGER IF EXISTS trg_funcionarios_meta_audit_update ON public.funcionarios_meta;
CREATE TRIGGER trg_funcionarios_meta_audit_update BEFORE UPDATE ON public.funcionarios_meta
  FOR EACH ROW EXECUTE FUNCTION fn_audit_update_funcionarios_meta();

CREATE OR REPLACE FUNCTION public.fn_criar_funcionario(p_usuario_id uuid, p_loja_id uuid, p_nome_exibicao text, p_email text, p_cargo text, p_comissao_percentual numeric DEFAULT NULL::numeric, p_comissao_tipo text DEFAULT NULL::text, p_comissao_valor numeric DEFAULT NULL::numeric)
 RETURNS TABLE(ok boolean, message text, funcionario_id uuid)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_gerente_id uuid; v_funcionario_id uuid;
BEGIN
  v_gerente_id := auth.uid();
  IF NOT EXISTS (SELECT 1 FROM public.usuarios WHERE id = p_usuario_id) THEN RETURN QUERY SELECT FALSE, 'USUARIO_NAO_ENCONTRADO'::text, NULL::uuid; RETURN; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.usuarios u WHERE u.id = p_usuario_id AND u.loja_id = p_loja_id) THEN RETURN QUERY SELECT FALSE, 'USUARIO_LOJA_MISMATCH'::text, NULL::uuid; RETURN; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.usuarios u WHERE u.id = v_gerente_id AND u.perfil IN ('GERENTE', 'ADMIN') AND u.loja_id = p_loja_id) AND NOT public.auth_usuario_eh_dono() THEN RETURN QUERY SELECT FALSE, 'PERMISSAO_NEGADA'::text, NULL::uuid; RETURN; END IF;
  IF EXISTS (SELECT 1 FROM public.funcionarios_meta fm WHERE fm.email = p_email AND fm.loja_id = p_loja_id) THEN RETURN QUERY SELECT FALSE, 'EMAIL_JA_USADO'::text, NULL::uuid; RETURN; END IF;
  IF p_nome_exibicao IS NULL OR btrim(p_nome_exibicao) = '' THEN RETURN QUERY SELECT FALSE, 'NOME_OBRIGATORIO'::text, NULL::uuid; RETURN; END IF;
  IF p_email IS NULL OR btrim(p_email) = '' THEN RETURN QUERY SELECT FALSE, 'EMAIL_OBRIGATORIO'::text, NULL::uuid; RETURN; END IF;
  IF p_cargo IS NULL OR btrim(p_cargo) = '' THEN RETURN QUERY SELECT FALSE, 'CARGO_OBRIGATORIO'::text, NULL::uuid; RETURN; END IF;
  BEGIN INSERT INTO public.funcionarios_meta (usuario_id, loja_id, nome_exibicao, email, cargo, comissao_percentual, comissao_tipo, comissao_valor, criado_por, criado_em, ativo) VALUES (p_usuario_id, p_loja_id, p_nome_exibicao, p_email, p_cargo, p_comissao_percentual, p_comissao_tipo, p_comissao_valor, v_gerente_id, now(), true) RETURNING id INTO v_funcionario_id;
  EXCEPTION WHEN OTHERS THEN RETURN QUERY SELECT FALSE, 'ERRO_AO_CRIAR_FUNCIONARIO'::text, NULL::uuid; RETURN; END;
  RETURN QUERY SELECT TRUE, 'FUNCIONARIO_CRIADO'::text, v_funcionario_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_atualizar_funcionario(p_funcionario_id uuid, p_nome_exibicao text DEFAULT NULL::text, p_cargo text DEFAULT NULL::text, p_comissao_percentual numeric DEFAULT NULL::numeric, p_comissao_tipo text DEFAULT NULL::text, p_comissao_valor numeric DEFAULT NULL::numeric)
 RETURNS TABLE(ok boolean, message text)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_gerente_id uuid; v_loja_id uuid;
BEGIN v_gerente_id := auth.uid(); SELECT fm.loja_id INTO v_loja_id FROM public.funcionarios_meta fm WHERE fm.id = p_funcionario_id; IF v_loja_id IS NULL THEN RETURN QUERY SELECT FALSE, 'FUNCIONARIO_NAO_ENCONTRADO'::text; RETURN; END IF;
IF NOT EXISTS (SELECT 1 FROM public.usuarios u WHERE u.id = v_gerente_id AND u.perfil IN ('GERENTE', 'ADMIN') AND u.loja_id = v_loja_id) THEN RETURN QUERY SELECT FALSE, 'PERMISSAO_NEGADA'::text; RETURN; END IF;
UPDATE public.funcionarios_meta SET nome_exibicao = COALESCE(p_nome_exibicao, nome_exibicao), cargo = COALESCE(p_cargo, cargo), comissao_percentual = COALESCE(p_comissao_percentual, comissao_percentual), comissao_tipo = COALESCE(p_comissao_tipo, comissao_tipo), comissao_valor = COALESCE(p_comissao_valor, comissao_valor) WHERE id = p_funcionario_id; RETURN QUERY SELECT TRUE, 'FUNCIONARIO_ATUALIZADO'::text; END; $function$;

CREATE OR REPLACE FUNCTION public.fn_desativar_funcionario(p_funcionario_id uuid)
 RETURNS TABLE(ok boolean, message text)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_gerente_id uuid; v_loja_id uuid;
BEGIN v_gerente_id := auth.uid(); SELECT fm.loja_id INTO v_loja_id FROM public.funcionarios_meta fm WHERE fm.id = p_funcionario_id; IF v_loja_id IS NULL THEN RETURN QUERY SELECT FALSE, 'FUNCIONARIO_NAO_ENCONTRADO'::text; RETURN; END IF;
IF NOT EXISTS (SELECT 1 FROM public.usuarios u WHERE u.id = v_gerente_id AND u.perfil IN ('GERENTE', 'ADMIN') AND u.loja_id = v_loja_id) THEN RETURN QUERY SELECT FALSE, 'PERMISSAO_NEGADA'::text; RETURN; END IF;
UPDATE public.funcionarios_meta SET ativo = false WHERE id = p_funcionario_id; RETURN QUERY SELECT TRUE, 'FUNCIONARIO_DESATIVADO'::text; END; $function$;
