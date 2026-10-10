-- ============================================================================
-- F1 — Isolamento entre empresas (autorização executiva, decisões D1–D3).
--
-- Fecha os P0 encontrados na M1:
--   1. Sincronização usuarios → usuario_vinculos com proveniência (LEGADO | DIRETO).
--   2. lojas: empresa obrigatória na criação; titularidade imutável; criação só
--      pela plataforma (D1); policy cross-tenant `lojas_write_gerente` removida;
--      `lojas_select_authenticated` (qualquer usuário lia todas as lojas) removida.
--   3. Cerca de empresa: policies RESTRICTIVE nas tabelas com loja_id (e em vendas,
--      via caixas) + trigger de escrita que vale também dentro de RPCs SECURITY DEFINER.
--      Só REDUZ acesso: para o cliente atual (uma empresa) o resultado é idêntico.
--   4. Administradores de plataforma (D2): cadastro explícito, auditado, somente por
--      procedimento administrativo (service_role, sem identidade de usuário).
--   5. Habilitação comercial do módulo (D3): responsável, data, motivo, vigência, histórico;
--      caminho de plataforma (capacidade COMERCIAL) e caminho operacional (service_role).
--   6. Trava de segunda empresa: o produto não cria uma segunda empresa enquanto as
--      tabelas globais e filhas não tiverem cerca (ver doc 14, riscos residuais).
--
-- Não altera saldos, estoque, preços, regras fiscais nem papéis legados.
-- Não promove ninguém: plataforma_admins continua vazia.
-- Rollback: backend/supabase/rollback/20261010130000_f1_isolamento_multiempresa.rollback.sql
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 0. Histórico append-only genérico e controle multiempresa
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_historico_imutavel()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  RAISE EXCEPTION 'HISTORICO_IMUTAVEL: % é append-only', TG_TABLE_NAME;
END
$$;

CREATE TABLE IF NOT EXISTS public.multiempresa_controle (
  chave        text        PRIMARY KEY,
  valor        boolean     NOT NULL,
  motivo       text        NOT NULL,
  alterado_em  timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.multiempresa_controle (chave, valor, motivo)
VALUES ('segunda_empresa_liberada', false,
        'F1: tabelas globais (configurações, categorias, marcas) e tabelas-filhas sem loja_id ainda são compartilhadas. Liberar só após a cerca completa (doc 14).')
ON CONFLICT (chave) DO NOTHING;

ALTER TABLE public.multiempresa_controle ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.multiempresa_controle FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.multiempresa_controle TO service_role;

-- Auditoria de ações de plataforma (criação de empresa/loja). Append-only.
CREATE TABLE IF NOT EXISTS public.plataforma_auditoria (
  id             bigserial   PRIMARY KEY,
  acao           text        NOT NULL,
  alvo_tipo      text        NOT NULL,
  alvo_id        uuid,
  executado_por  uuid,
  detalhe        jsonb       NOT NULL DEFAULT '{}'::jsonb,
  registrado_em  timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS plataforma_auditoria_imutavel ON public.plataforma_auditoria;
CREATE TRIGGER plataforma_auditoria_imutavel
  BEFORE UPDATE OR DELETE ON public.plataforma_auditoria
  FOR EACH ROW EXECUTE FUNCTION public.trg_historico_imutavel();

ALTER TABLE public.plataforma_auditoria ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.plataforma_auditoria FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.plataforma_auditoria TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.plataforma_auditoria_id_seq TO service_role;

-- ----------------------------------------------------------------------------
-- 1. Administradores de plataforma (D2)
-- Escrita SOMENTE por ops_definir_plataforma_admin (service_role, sem auth.uid()).
-- Nenhum caminho de autoatendimento: authenticated não tem grant na tabela nem na função,
-- e o trigger bloqueia qualquer escrita fora do procedimento, inclusive de service_role.
-- ----------------------------------------------------------------------------
ALTER TABLE public.plataforma_admins
  ADD COLUMN IF NOT EXISTS capacidades   text[]      NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS atualizado_em timestamptz NOT NULL DEFAULT now();

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'plataforma_admins_capacidades_check') THEN
    ALTER TABLE public.plataforma_admins ADD CONSTRAINT plataforma_admins_capacidades_check
      CHECK (capacidades <@ ARRAY['PROVISIONAMENTO', 'COMERCIAL']::text[]);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.plataforma_admins_historico (
  id             bigserial   PRIMARY KEY,
  usuario_id     uuid        NOT NULL,
  acao           text        NOT NULL CHECK (acao IN ('CONCEDER', 'ALTERAR', 'REVOGAR')),
  ativo          boolean     NOT NULL,
  capacidades    text[]      NOT NULL,
  motivo         text        NOT NULL,
  executado_por  text        NOT NULL,
  registrado_em  timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS plataforma_admins_historico_imutavel ON public.plataforma_admins_historico;
CREATE TRIGGER plataforma_admins_historico_imutavel
  BEFORE UPDATE OR DELETE ON public.plataforma_admins_historico
  FOR EACH ROW EXECUTE FUNCTION public.trg_historico_imutavel();

ALTER TABLE public.plataforma_admins_historico ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.plataforma_admins_historico FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.plataforma_admins_historico TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.plataforma_admins_historico_id_seq TO service_role;

CREATE OR REPLACE FUNCTION public.trg_plataforma_admins_somente_procedimento()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NOT NULL
     OR coalesce(current_setting('jinlong.plataforma_origem', true), '') <> 'ops_definir_plataforma_admin' THEN
    RAISE EXCEPTION 'PLATAFORMA_ADMIN_SOMENTE_PROCEDIMENTO' USING ERRCODE = '42501';
  END IF;
  RETURN coalesce(NEW, OLD);
END
$$;

DROP TRIGGER IF EXISTS plataforma_admins_somente_procedimento ON public.plataforma_admins;
CREATE TRIGGER plataforma_admins_somente_procedimento
  BEFORE INSERT OR UPDATE OR DELETE ON public.plataforma_admins
  FOR EACH ROW EXECUTE FUNCTION public.trg_plataforma_admins_somente_procedimento();

CREATE OR REPLACE FUNCTION public.ops_definir_plataforma_admin(
  p_usuario       uuid,
  p_ativo         boolean,
  p_capacidades   text[],
  p_motivo        text,
  p_executado_por text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_existia boolean;
BEGIN
  -- Procedimento administrativo: nunca com identidade de usuário (impede autopromoção).
  IF auth.uid() IS NOT NULL THEN
    RAISE EXCEPTION 'PLATAFORMA_ADMIN_SOMENTE_PROCEDIMENTO' USING ERRCODE = '42501';
  END IF;
  IF p_usuario IS NULL OR p_ativo IS NULL THEN
    RAISE EXCEPTION 'PLATAFORMA_PARAMETRO_AUSENTE';
  END IF;
  IF length(btrim(coalesce(p_motivo, ''))) < 10 THEN
    RAISE EXCEPTION 'PLATAFORMA_MOTIVO_OBRIGATORIO';
  END IF;
  IF length(btrim(coalesce(p_executado_por, ''))) = 0 THEN
    RAISE EXCEPTION 'PLATAFORMA_EXECUTOR_OBRIGATORIO';
  END IF;
  IF p_ativo AND (p_capacidades IS NULL OR cardinality(p_capacidades) = 0) THEN
    RAISE EXCEPTION 'PLATAFORMA_CAPACIDADE_OBRIGATORIA';
  END IF;
  IF p_ativo AND NOT EXISTS (SELECT 1 FROM public.usuarios u WHERE u.id = p_usuario AND u.ativo) THEN
    RAISE EXCEPTION 'PLATAFORMA_USUARIO_INEXISTENTE_OU_INATIVO';
  END IF;

  v_existia := EXISTS (SELECT 1 FROM public.plataforma_admins WHERE usuario_id = p_usuario);

  PERFORM set_config('jinlong.plataforma_origem', 'ops_definir_plataforma_admin', true);
  INSERT INTO public.plataforma_admins (usuario_id, ativo, capacidades, motivo, created_by, atualizado_em)
  VALUES (p_usuario, p_ativo, CASE WHEN p_ativo THEN p_capacidades ELSE '{}'::text[] END, p_motivo, NULL, now())
  ON CONFLICT (usuario_id) DO UPDATE
    SET ativo = EXCLUDED.ativo, capacidades = EXCLUDED.capacidades,
        motivo = EXCLUDED.motivo, atualizado_em = EXCLUDED.atualizado_em;
  PERFORM set_config('jinlong.plataforma_origem', '', true);

  INSERT INTO public.plataforma_admins_historico (usuario_id, acao, ativo, capacidades, motivo, executado_por)
  VALUES (p_usuario,
          CASE WHEN NOT p_ativo THEN 'REVOGAR' WHEN v_existia THEN 'ALTERAR' ELSE 'CONCEDER' END,
          p_ativo, CASE WHEN p_ativo THEN p_capacidades ELSE '{}'::text[] END, p_motivo, p_executado_por);
END
$$;

REVOKE ALL ON FUNCTION public.ops_definir_plataforma_admin(uuid, boolean, text[], text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ops_definir_plataforma_admin(uuid, boolean, text[], text, text) TO service_role;

-- Capacidade de plataforma do PRÓPRIO usuário da sessão (não é oráculo de terceiros).
CREATE OR REPLACE FUNCTION public.fp_plataforma_pode(p_capacidade text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT auth.uid() IS NOT NULL AND public.fp_eh_plataforma() AND EXISTS (
    SELECT 1 FROM public.plataforma_admins p
     WHERE p.usuario_id = auth.uid() AND p.ativo AND p_capacidade = ANY (p.capacidades)
  )
$$;

REVOKE ALL ON FUNCTION public.fp_plataforma_pode(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fp_plataforma_pode(text) TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 2. Vínculos: proveniência e sincronização com o cadastro legado (P0-1, P0-2)
-- LEGADO: espelho de usuarios.perfil/loja_id/ativo — o trigger cria, ativa e desativa.
-- DIRETO: vínculo independente — o trigger NUNCA altera nem apaga.
-- Nada é apagado: mudança de papel/loja desativa o vínculo anterior.
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema = 'public' AND table_name = 'usuario_vinculos' AND column_name = 'origem') THEN
    ALTER TABLE public.usuario_vinculos
      ADD COLUMN origem text NOT NULL DEFAULT 'DIRETO' CHECK (origem IN ('LEGADO', 'DIRETO'));
    -- Até aqui o único escritor de vínculos foi o backfill da M1: todos são LEGADO.
    UPDATE public.usuario_vinculos SET origem = 'LEGADO';
  END IF;
END $$;

COMMENT ON COLUMN public.usuario_vinculos.origem IS
  'F1. LEGADO = derivado de usuarios (sincronizado por trigger). DIRETO = cadastrado diretamente; o sincronismo legado não o altera.';

CREATE OR REPLACE FUNCTION public.m1_sincronizar_vinculo_usuario(p_usuario uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  u          record;
  v_empresa  uuid;
  v_loja_ok  boolean;
  v_loja_vinc uuid;
  v_existente record;
BEGIN
  SELECT id, perfil, loja_id, coalesce(ativo, true) AS ativo INTO u
    FROM public.usuarios WHERE id = p_usuario;

  IF u.id IS NULL THEN
    -- usuário removido: vínculos saem por ON DELETE CASCADE
    RETURN 'USUARIO_INEXISTENTE';
  END IF;

  IF u.perfil = 'ADMIN' THEN
    UPDATE public.usuario_vinculos SET ativo = false
     WHERE usuario_id = u.id AND origem = 'LEGADO' AND ativo;
    INSERT INTO public.m1_backfill_excecoes (usuario_id, loja_id, motivo, detalhe)
    VALUES (u.id, u.loja_id, 'ADMIN_SEM_VINCULO', 'ADMIN legado não recebe vínculo (D2)')
    ON CONFLICT (usuario_id, loja_id, motivo) DO NOTHING;
    RETURN 'ADMIN_SEM_VINCULO';
  END IF;

  IF u.perfil NOT IN ('DONO', 'GERENTE', 'OPERADOR') THEN
    UPDATE public.usuario_vinculos SET ativo = false
     WHERE usuario_id = u.id AND origem = 'LEGADO' AND ativo;
    RETURN 'PERFIL_SEM_VINCULO';
  END IF;

  SELECT true, l.empresa_id INTO v_loja_ok, v_empresa FROM public.lojas l WHERE l.id = u.loja_id;

  IF v_loja_ok IS NULL OR v_empresa IS NULL THEN
    UPDATE public.usuario_vinculos SET ativo = false
     WHERE usuario_id = u.id AND origem = 'LEGADO' AND ativo;
    INSERT INTO public.m1_backfill_excecoes (usuario_id, loja_id, motivo, detalhe)
    VALUES (u.id, u.loja_id,
            CASE WHEN v_loja_ok IS NULL THEN 'LOJA_INEXISTENTE' ELSE 'LOJA_SEM_EMPRESA_POS_CORTE' END,
            u.perfil)
    ON CONFLICT (usuario_id, loja_id, motivo) DO NOTHING;
    RETURN CASE WHEN v_loja_ok IS NULL THEN 'LOJA_INEXISTENTE' ELSE 'LOJA_SEM_EMPRESA' END;
  END IF;

  v_loja_vinc := CASE WHEN u.perfil = 'DONO' THEN NULL ELSE u.loja_id END;

  -- Desativa vínculos LEGADO que não correspondem mais ao cadastro legado.
  UPDATE public.usuario_vinculos v SET ativo = false
   WHERE v.usuario_id = u.id AND v.origem = 'LEGADO' AND v.ativo
     AND NOT (v.empresa_id = v_empresa AND v.papel = u.perfil AND v.loja_id IS NOT DISTINCT FROM v_loja_vinc);

  SELECT id, origem INTO v_existente
    FROM public.usuario_vinculos v
   WHERE v.usuario_id = u.id AND v.empresa_id = v_empresa AND v.papel = u.perfil
     AND v.loja_id IS NOT DISTINCT FROM v_loja_vinc;

  IF v_existente.id IS NOT NULL THEN
    IF v_existente.origem = 'LEGADO' THEN
      UPDATE public.usuario_vinculos SET ativo = u.ativo WHERE id = v_existente.id AND ativo IS DISTINCT FROM u.ativo;
    END IF;
    RETURN 'OK';
  END IF;

  BEGIN
    INSERT INTO public.usuario_vinculos (usuario_id, empresa_id, loja_id, papel, ativo, created_by, origem)
    VALUES (u.id, v_empresa, v_loja_vinc, u.perfil, u.ativo, NULL, 'LEGADO');
  EXCEPTION WHEN unique_violation THEN
    -- OPERADOR já tem vínculo DIRETO ativo em outra loja da mesma empresa: não sobrescrever.
    INSERT INTO public.m1_backfill_excecoes (usuario_id, loja_id, motivo, detalhe)
    VALUES (u.id, u.loja_id, 'CONFLITO_VINCULO_DIRETO', u.perfil)
    ON CONFLICT (usuario_id, loja_id, motivo) DO NOTHING;
    RETURN 'CONFLITO_VINCULO_DIRETO';
  END;
  RETURN 'CRIADO';
END
$$;

REVOKE ALL ON FUNCTION public.m1_sincronizar_vinculo_usuario(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.m1_sincronizar_vinculo_usuario(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.trg_usuarios_sincroniza_vinculo()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM public.m1_sincronizar_vinculo_usuario(NEW.id);
  RETURN NULL;
END
$$;

REVOKE ALL ON FUNCTION public.trg_usuarios_sincroniza_vinculo() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS usuarios_sincroniza_vinculo ON public.usuarios;
CREATE TRIGGER usuarios_sincroniza_vinculo
  AFTER INSERT OR UPDATE OF perfil, loja_id, ativo ON public.usuarios
  FOR EACH ROW EXECUTE FUNCTION public.trg_usuarios_sincroniza_vinculo();

-- Loja que recebe empresa (operação explícita) sincroniza os usuários dela.
CREATE OR REPLACE FUNCTION public.trg_lojas_empresa_sincroniza_vinculos()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT id FROM public.usuarios WHERE loja_id = NEW.id LOOP
    PERFORM public.m1_sincronizar_vinculo_usuario(r.id);
  END LOOP;
  RETURN NULL;
END
$$;

REVOKE ALL ON FUNCTION public.trg_lojas_empresa_sincroniza_vinculos() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS lojas_empresa_sincroniza_vinculos ON public.lojas;
CREATE TRIGGER lojas_empresa_sincroniza_vinculos
  AFTER UPDATE OF empresa_id ON public.lojas
  FOR EACH ROW WHEN (OLD.empresa_id IS DISTINCT FROM NEW.empresa_id)
  EXECUTE FUNCTION public.trg_lojas_empresa_sincroniza_vinculos();

-- Backfill passa a usar a mesma derivação (uma fonte de verdade).
CREATE OR REPLACE FUNCTION public.m1_backfill_empresa_legada()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_empresa      uuid;
  v_corte        timestamptz;
  v_empresa_nova int := 0;
  v_lojas        int := 0;
  v_vinculos     int := 0;
  v_excecoes_antes int;
  r              record;
BEGIN
  SELECT valor INTO v_corte FROM public.m1_backfill_controle WHERE chave = 'corte_lojas';
  IF v_corte IS NULL THEN
    v_corte := now();
    INSERT INTO public.m1_backfill_controle (chave, valor) VALUES ('corte_lojas', v_corte);
  END IF;

  SELECT id INTO v_empresa FROM public.empresas WHERE origem = 'LEGADA_M1';
  IF v_empresa IS NULL THEN
    INSERT INTO public.empresas (nome, origem, status)
    VALUES ('Empresa legada (migrada na M1)', 'LEGADA_M1', 'ATIVA')
    RETURNING id INTO v_empresa;
    v_empresa_nova := 1;
  END IF;

  UPDATE public.lojas l SET empresa_id = v_empresa
   WHERE l.empresa_id IS NULL AND l.created_at <= v_corte;
  GET DIAGNOSTICS v_lojas = ROW_COUNT;

  SELECT count(*) INTO v_excecoes_antes FROM public.m1_backfill_excecoes;
  FOR r IN SELECT id FROM public.usuarios WHERE perfil IN ('DONO', 'GERENTE', 'OPERADOR', 'ADMIN') LOOP
    IF public.m1_sincronizar_vinculo_usuario(r.id) = 'CRIADO' THEN
      v_vinculos := v_vinculos + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'empresa_legada_id', v_empresa,
    'empresa_criada', v_empresa_nova,
    'lojas_associadas', v_lojas,
    'vinculos_criados', v_vinculos,
    'excecoes_novas', (SELECT count(*) FROM public.m1_backfill_excecoes) - v_excecoes_antes,
    'corte_lojas', v_corte,
    'divergencias', (SELECT count(*) FROM public.fp_divergencias_vinculos_legados())
  );
END
$$;

REVOKE ALL ON FUNCTION public.m1_backfill_empresa_legada() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.m1_backfill_empresa_legada() TO service_role;

-- Divergência: vínculos DIRETO não precisam de origem legada.
CREATE OR REPLACE FUNCTION public.fp_divergencias_vinculos_legados()
RETURNS TABLE (usuario_id uuid, motivo text, detalhe text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT u.id, 'VINCULO_AUSENTE'::text, u.perfil || ' loja ' || u.loja_id::text
    FROM public.usuarios u
    LEFT JOIN public.lojas l ON l.id = u.loja_id
   WHERE u.perfil IN ('GERENTE', 'OPERADOR')
     AND NOT EXISTS (
       SELECT 1 FROM public.usuario_vinculos v
        WHERE v.usuario_id = u.id AND v.loja_id = u.loja_id AND v.papel = u.perfil
          AND v.empresa_id = l.empresa_id AND v.ativo = coalesce(u.ativo, true))
  UNION ALL
  SELECT u.id, 'VINCULO_DONO_AUSENTE', 'loja ' || u.loja_id::text
    FROM public.usuarios u
    LEFT JOIN public.lojas l ON l.id = u.loja_id
   WHERE u.perfil = 'DONO'
     AND NOT EXISTS (
       SELECT 1 FROM public.usuario_vinculos v
        WHERE v.usuario_id = u.id AND v.papel = 'DONO' AND v.loja_id IS NULL
          AND v.empresa_id = l.empresa_id AND v.ativo = coalesce(u.ativo, true))
  UNION ALL
  SELECT v.usuario_id, 'ADMIN_COM_VINCULO', v.papel
    FROM public.usuario_vinculos v
    JOIN public.usuarios u ON u.id = v.usuario_id
   WHERE u.perfil = 'ADMIN' AND v.ativo
  UNION ALL
  SELECT v.usuario_id, 'VINCULO_SEM_ORIGEM_LEGADA', v.papel
    FROM public.usuario_vinculos v
    LEFT JOIN public.usuarios u ON u.id = v.usuario_id
   WHERE v.ativo AND v.origem = 'LEGADO' AND (u.id IS NULL
         OR NOT (
           (u.perfil = 'DONO' AND v.papel = 'DONO')
           OR (u.perfil IN ('GERENTE', 'OPERADOR') AND v.papel = u.perfil AND v.loja_id = u.loja_id)))
$$;

REVOKE ALL ON FUNCTION public.fp_divergencias_vinculos_legados() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fp_divergencias_vinculos_legados() TO service_role;

-- ----------------------------------------------------------------------------
-- 3. Cerca de empresa (helpers)
-- Empresas da cerca = empresas com vínculo ATIVO do usuário; ADMIN legado ativo
-- fica restrito à empresa legada (antes: todas as lojas, de qualquer empresa).
-- Plataforma NÃO entra na cerca: administrar a plataforma não dá acesso a dados do ERP.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fp_empresas_cerca()
RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT v.empresa_id FROM public.usuario_vinculos v
   WHERE auth.uid() IS NOT NULL AND v.usuario_id = auth.uid() AND v.ativo
  UNION
  SELECT e.id FROM public.empresas e
   WHERE auth.uid() IS NOT NULL AND e.origem = 'LEGADA_M1' AND public.fp_legado_admin_global()
$$;

CREATE OR REPLACE FUNCTION public.fp_lojas_cerca()
RETURNS uuid[]
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT coalesce(array_agg(l.id), '{}'::uuid[])
    FROM public.lojas l
   WHERE auth.uid() IS NOT NULL AND l.empresa_id IN (SELECT public.fp_empresas_cerca())
$$;

CREATE OR REPLACE FUNCTION public.fp_loja_na_cerca(p_loja uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT auth.uid() IS NOT NULL AND p_loja IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.lojas l
     WHERE l.id = p_loja AND l.empresa_id IN (SELECT public.fp_empresas_cerca())
  )
$$;

-- Caixas da cerca (vendas não tem loja_id; o tenant vem do caixa).
CREATE OR REPLACE FUNCTION public.fp_caixas_cerca()
RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT c.id FROM public.caixas c
   WHERE auth.uid() IS NOT NULL AND c.loja_id = ANY (public.fp_lojas_cerca())
$$;

REVOKE ALL ON FUNCTION public.fp_empresas_cerca(), public.fp_lojas_cerca(),
  public.fp_loja_na_cerca(uuid), public.fp_caixas_cerca() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fp_empresas_cerca(), public.fp_lojas_cerca(),
  public.fp_loja_na_cerca(uuid), public.fp_caixas_cerca() TO authenticated, service_role;

-- ADMIN legado: ramo de compatibilidade restrito à empresa legada.
CREATE OR REPLACE FUNCTION public.fp_pode_loja(p_loja uuid, p_papeis text[] DEFAULT NULL)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT auth.uid() IS NOT NULL AND p_loja IS NOT NULL AND (
    p_loja IN (SELECT public.fp_lojas_permitidas(p_papeis))
    OR (public.fp_legado_admin_global() AND EXISTS (
          SELECT 1 FROM public.lojas l JOIN public.empresas e ON e.id = l.empresa_id
           WHERE l.id = p_loja AND e.origem = 'LEGADA_M1'))
  )
$$;

-- Helper legado usado por 9 policies e 6 RPCs: mantém a regra antiga E exige a cerca.
CREATE OR REPLACE FUNCTION public.auth_usuario_gerencial_loja(p_loja_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.usuarios u
    WHERE u.id = (SELECT auth.uid())
      AND u.perfil IN ('GERENTE', 'DONO', 'ADMIN')
      AND (u.perfil = 'ADMIN' OR u.loja_id = p_loja_id)
  ) AND public.fp_loja_na_cerca(p_loja_id);
$function$;

-- ----------------------------------------------------------------------------
-- 4. Cerca de empresa (RLS RESTRICTIVE + trigger de escrita)
-- RESTRICTIVE é combinada com AND às policies PERMISSIVE existentes: nunca concede.
-- O trigger cobre escrita feita por RPC SECURITY DEFINER (que ignora RLS) sempre que
-- houver identidade de usuário. Sem identidade (service_role, cron, migrations): não se aplica.
-- loja_id NULL: linhas compartilhadas por desenho (ex.: precos_atacado globais) — permitidas.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_cerca_empresa_escrita()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_coluna text := coalesce(TG_ARGV[0], 'loja_id');
  v_modo   text := coalesce(TG_ARGV[1], 'loja');
  -- Comparação em texto: uma tabela legada guarda loja_id como text (tokens_desconto_gerente).
  v_refs   text[] := '{}'::text[];
  v_ref    text;
  v_loja   text;
  v_cerca  text[];
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN coalesce(NEW, OLD);
  END IF;

  -- Valores novos (INSERT/UPDATE) e originais (UPDATE/DELETE): ambos precisam estar na cerca.
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    v_refs := v_refs || (to_jsonb(NEW) ->> v_coluna);
  END IF;
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    v_refs := v_refs || (to_jsonb(OLD) ->> v_coluna);
  END IF;

  FOREACH v_ref IN ARRAY v_refs LOOP
    CONTINUE WHEN v_ref IS NULL;
    IF v_cerca IS NULL THEN
      v_cerca := public.fp_lojas_cerca()::text[];
    END IF;
    IF v_modo = 'caixa' THEN
      SELECT c.loja_id::text INTO v_loja FROM public.caixas c WHERE c.id::text = v_ref;
    ELSE
      v_loja := v_ref;
    END IF;
    IF v_loja IS NULL OR NOT (v_loja = ANY (v_cerca)) THEN
      RAISE EXCEPTION 'CERCA_EMPRESA_VIOLADA: % fora da empresa do usuário', TG_TABLE_NAME
        USING ERRCODE = '42501';
    END IF;
  END LOOP;
  RETURN coalesce(NEW, OLD);
END
$$;

REVOKE ALL ON FUNCTION public.trg_cerca_empresa_escrita() FROM PUBLIC, anon, authenticated;

DO $$
DECLARE
  t text;
  v_tipo text;
  v_expr text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'cadastro_produto_telemetry_events', 'caixas', 'clientes', 'comissoes_ajustes',
    'comissoes_pagamentos', 'comissoes_regras_funcionario', 'comissoes_vendedores',
    'conciliacoes_financeiras', 'contas_financeiras', 'contas_pagar', 'contas_pagar_pagamentos',
    'contas_receber', 'entrada_documentos', 'estoque', 'extratos_financeiros',
    'financeiro_comandos', 'financeiro_contas_forma', 'financeiro_recebiveis_venda',
    'fiscal_provider_config', 'formas_pagamento', 'fornecedores', 'funcionarios',
    'funcionarios_meta', 'implantacao_checklist_itens', 'implantacao_checklists',
    'importacoes_nfe', 'liquidacoes_receber', 'movimentos_estoque_log', 'movimentos_financeiros',
    'ordens_compra', 'ordens_compra_recebimentos', 'pdv_config', 'precos_atacado',
    'produto_create_requests', 'produtos', 'remessas', 'system_alerts',
    'tokens_autorizacao_operacao', 'tokens_desconto_gerente', 'venda_eventos',
    'vendas_em_espera', 'vinculos_fornecedor_produto'
  ]
  LOOP
    IF to_regclass('public.' || t) IS NULL THEN
      RAISE EXCEPTION 'F1: tabela esperada ausente: %', t;
    END IF;
    SELECT data_type INTO v_tipo FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = t AND column_name = 'loja_id';
    v_expr := format('(loja_id IS NULL OR loja_id = ANY ((SELECT public.fp_lojas_cerca())::%s[]))',
                     CASE WHEN v_tipo = 'uuid' THEN 'uuid' ELSE 'text' END);
    EXECUTE format('DROP POLICY IF EXISTS cerca_empresa ON public.%I', t);
    EXECUTE format(
      'CREATE POLICY cerca_empresa ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING %s WITH CHECK %s',
      t, v_expr, v_expr);
    EXECUTE format('DROP TRIGGER IF EXISTS cerca_empresa_escrita ON public.%I', t);
    EXECUTE format(
      'CREATE TRIGGER cerca_empresa_escrita BEFORE INSERT OR UPDATE OR DELETE ON public.%I '
      'FOR EACH ROW EXECUTE FUNCTION public.trg_cerca_empresa_escrita(''loja_id'', ''loja'')', t);
  END LOOP;
END $$;

-- usuarios: o próprio registro é sempre visível (login, idioma); demais, só na cerca.
DROP POLICY IF EXISTS cerca_empresa ON public.usuarios;
CREATE POLICY cerca_empresa ON public.usuarios AS RESTRICTIVE FOR ALL TO authenticated
  USING (id = (SELECT auth.uid()) OR loja_id IS NULL OR loja_id = ANY ((SELECT public.fp_lojas_cerca())::uuid[]))
  WITH CHECK (id = (SELECT auth.uid()) OR loja_id IS NULL OR loja_id = ANY ((SELECT public.fp_lojas_cerca())::uuid[]));

DROP TRIGGER IF EXISTS cerca_empresa_escrita ON public.usuarios;
CREATE TRIGGER cerca_empresa_escrita BEFORE INSERT OR UPDATE OR DELETE ON public.usuarios
  FOR EACH ROW EXECUTE FUNCTION public.trg_cerca_empresa_escrita('loja_id', 'loja');

-- vendas: tenant pelo caixa.
DROP POLICY IF EXISTS cerca_empresa ON public.vendas;
CREATE POLICY cerca_empresa ON public.vendas AS RESTRICTIVE FOR ALL TO authenticated
  USING (caixa_id IS NULL OR caixa_id IN (SELECT public.fp_caixas_cerca()))
  WITH CHECK (caixa_id IS NULL OR caixa_id IN (SELECT public.fp_caixas_cerca()));

DROP TRIGGER IF EXISTS cerca_empresa_escrita ON public.vendas;
CREATE TRIGGER cerca_empresa_escrita BEFORE INSERT OR UPDATE OR DELETE ON public.vendas
  FOR EACH ROW EXECUTE FUNCTION public.trg_cerca_empresa_escrita('caixa_id', 'caixa');

-- ----------------------------------------------------------------------------
-- 5. lojas (P0-3): empresa obrigatória, titularidade imutável, policies por empresa
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_lojas_empresa_obrigatoria()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_ctx text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.empresa_id IS NULL THEN
      -- Sessão SQL administrativa (migration, teste, procedimento) pode informar a empresa
      -- EXPLICITAMENTE pela GUC jinlong.empresa_contexto_sql. Papéis de API nunca.
      v_ctx := nullif(current_setting('jinlong.empresa_contexto_sql', true), '');
      IF v_ctx IS NOT NULL
         AND session_user NOT IN ('authenticator', 'anon', 'authenticated', 'service_role') THEN
        NEW.empresa_id := v_ctx::uuid;
      ELSE
        RAISE EXCEPTION 'LOJA_SEM_EMPRESA: toda loja nova exige empresa explícita' USING ERRCODE = '23502';
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  -- UPDATE de empresa_id
  IF NEW.empresa_id IS DISTINCT FROM OLD.empresa_id THEN
    IF OLD.empresa_id IS NOT NULL THEN
      RAISE EXCEPTION 'LOJA_EMPRESA_IMUTAVEL: transferência de titularidade não é permitida' USING ERRCODE = '42501';
    END IF;
    IF NEW.empresa_id IS NULL THEN
      RETURN NEW;
    END IF;
    -- Atribuição a loja órfã: só procedimento sem identidade ou plataforma (PROVISIONAMENTO).
    IF auth.uid() IS NOT NULL AND NOT public.fp_plataforma_pode('PROVISIONAMENTO') THEN
      RAISE EXCEPTION 'LOJA_EMPRESA_IMUTAVEL: atribuição de empresa restrita à plataforma' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END
$$;

REVOKE ALL ON FUNCTION public.trg_lojas_empresa_obrigatoria() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS lojas_empresa_obrigatoria ON public.lojas;
CREATE TRIGGER lojas_empresa_obrigatoria
  BEFORE INSERT OR UPDATE OF empresa_id ON public.lojas
  FOR EACH ROW EXECUTE FUNCTION public.trg_lojas_empresa_obrigatoria();

DROP POLICY IF EXISTS lojas_select_authenticated ON public.lojas;
DROP POLICY IF EXISTS lojas_write_gerente ON public.lojas;

-- Leitura: lojas da própria empresa (inclui as irmãs, usadas em transferências) ou plataforma.
DROP POLICY IF EXISTS lojas_select_escopo ON public.lojas;
CREATE POLICY lojas_select_escopo ON public.lojas
  FOR SELECT TO authenticated
  USING (id = ANY ((SELECT public.fp_lojas_cerca())::uuid[]) OR (SELECT public.fp_eh_plataforma()));

-- Edição: DONO da empresa (todas as lojas dela) ou GERENTE da própria loja.
-- USING protege a linha original; WITH CHECK, os valores novos. empresa_id é imutável (trigger).
DROP POLICY IF EXISTS lojas_update_gestao ON public.lojas;
CREATE POLICY lojas_update_gestao ON public.lojas
  FOR UPDATE TO authenticated
  USING (public.fp_pode_loja(id, ARRAY['DONO', 'GERENTE']))
  WITH CHECK (public.fp_pode_loja(id, ARRAY['DONO', 'GERENTE']));

-- Criação e exclusão: nenhuma policy para authenticated (D1). Defesa em profundidade:
REVOKE INSERT, DELETE, TRUNCATE ON public.lojas FROM anon, authenticated;

-- empresas: plataforma lê todas (provisionamento); demais, só as próprias (M1).
DROP POLICY IF EXISTS empresas_leitura_plataforma ON public.empresas;
CREATE POLICY empresas_leitura_plataforma ON public.empresas
  FOR SELECT TO authenticated USING ((SELECT public.fp_eh_plataforma()));

-- ----------------------------------------------------------------------------
-- 6. Provisionamento pela plataforma (D1)
-- Tenant explícito, nunca inferido do executor. Contexto ausente ou ambíguo ⇒ negação.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.plataforma_criar_empresa(
  p_nome         text,
  p_razao_social text DEFAULT NULL,
  p_cnpj         text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_id uuid;
  v_cnpj text := nullif(regexp_replace(coalesce(p_cnpj, ''), '\D', '', 'g'), '');
BEGIN
  IF auth.uid() IS NULL OR NOT public.fp_plataforma_pode('PROVISIONAMENTO') THEN
    RAISE EXCEPTION 'PLATAFORMA_NAO_AUTORIZADA' USING ERRCODE = '42501';
  END IF;
  IF length(btrim(coalesce(p_nome, ''))) < 2 THEN
    RAISE EXCEPTION 'EMPRESA_NOME_OBRIGATORIO';
  END IF;
  IF EXISTS (SELECT 1 FROM public.empresas)
     AND NOT coalesce((SELECT valor FROM public.multiempresa_controle WHERE chave = 'segunda_empresa_liberada'), false) THEN
    RAISE EXCEPTION 'MULTIEMPRESA_ERP_NAO_LIBERADO: segunda empresa bloqueada até a cerca completa (doc 14)'
      USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.empresas (nome, razao_social, cnpj, origem, status)
  VALUES (btrim(p_nome), nullif(btrim(coalesce(p_razao_social, '')), ''), v_cnpj, 'CADASTRO', 'ATIVA')
  RETURNING id INTO v_id;

  INSERT INTO public.plataforma_auditoria (acao, alvo_tipo, alvo_id, executado_por, detalhe)
  VALUES ('CRIAR_EMPRESA', 'empresa', v_id, auth.uid(), jsonb_build_object('nome', btrim(p_nome)));
  RETURN v_id;
END
$$;

CREATE OR REPLACE FUNCTION public.plataforma_provisionar_loja(
  p_empresa uuid,
  p_nome    text,
  p_codigo  text
)
RETURNS TABLE (loja_id uuid, nova boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_codigo text := upper(btrim(coalesce(p_codigo, '')));
  v_existente record;
  v_id uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT public.fp_plataforma_pode('PROVISIONAMENTO') THEN
    RAISE EXCEPTION 'PLATAFORMA_NAO_AUTORIZADA' USING ERRCODE = '42501';
  END IF;
  IF p_empresa IS NULL THEN
    RAISE EXCEPTION 'PROVISIONAMENTO_EMPRESA_OBRIGATORIA';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.empresas e WHERE e.id = p_empresa AND e.status = 'ATIVA') THEN
    RAISE EXCEPTION 'PROVISIONAMENTO_EMPRESA_INVALIDA';
  END IF;
  IF length(btrim(coalesce(p_nome, ''))) < 2 OR v_codigo !~ '^[A-Z0-9_-]{1,32}$' THEN
    RAISE EXCEPTION 'PROVISIONAMENTO_DADOS_INVALIDOS';
  END IF;

  SELECT l.id, l.empresa_id INTO v_existente FROM public.lojas l WHERE upper(l.codigo) = v_codigo LIMIT 1;
  IF v_existente.id IS NOT NULL THEN
    IF v_existente.empresa_id IS DISTINCT FROM p_empresa THEN
      -- Ambíguo: o código pertence a outra empresa (ou a loja órfã). Nega.
      RAISE EXCEPTION 'PROVISIONAMENTO_CODIGO_DE_OUTRA_EMPRESA' USING ERRCODE = '42501';
    END IF;
    RETURN QUERY SELECT v_existente.id, false;
    RETURN;
  END IF;

  INSERT INTO public.lojas (nome, codigo, ativo, empresa_id)
  VALUES (btrim(p_nome), v_codigo, true, p_empresa)
  RETURNING id INTO v_id;

  INSERT INTO public.plataforma_auditoria (acao, alvo_tipo, alvo_id, executado_por, detalhe)
  VALUES ('PROVISIONAR_LOJA', 'loja', v_id, auth.uid(),
          jsonb_build_object('empresa_id', p_empresa, 'codigo', v_codigo));
  RETURN QUERY SELECT v_id, true;
END
$$;

REVOKE ALL ON FUNCTION public.plataforma_criar_empresa(text, text, text),
  public.plataforma_provisionar_loja(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.plataforma_criar_empresa(text, text, text),
  public.plataforma_provisionar_loja(uuid, text, text) TO authenticated;

-- ----------------------------------------------------------------------------
-- 7. Habilitação comercial do módulo (D3)
-- ----------------------------------------------------------------------------
ALTER TABLE public.empresa_modulos
  ADD COLUMN IF NOT EXISTS vigencia_inicio date,
  ADD COLUMN IF NOT EXISTS vigencia_fim    date,
  ADD COLUMN IF NOT EXISTS responsavel_id  uuid,
  ADD COLUMN IF NOT EXISTS responsavel     text,
  ADD COLUMN IF NOT EXISTS motivo          text;

ALTER TABLE public.empresa_modulos_historico
  ADD COLUMN IF NOT EXISTS vigencia_inicio date,
  ADD COLUMN IF NOT EXISTS vigencia_fim    date,
  ADD COLUMN IF NOT EXISTS responsavel_id  uuid,
  ADD COLUMN IF NOT EXISTS responsavel     text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'empresa_modulos_vigencia_check') THEN
    ALTER TABLE public.empresa_modulos ADD CONSTRAINT empresa_modulos_vigencia_check
      CHECK (vigencia_fim IS NULL OR vigencia_inicio IS NULL OR vigencia_fim >= vigencia_inicio);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.trg_empresa_modulos_historico()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND OLD.habilitado = NEW.habilitado
     AND OLD.autorizado_por IS NOT DISTINCT FROM NEW.autorizado_por
     AND OLD.vigencia_inicio IS NOT DISTINCT FROM NEW.vigencia_inicio
     AND OLD.vigencia_fim IS NOT DISTINCT FROM NEW.vigencia_fim THEN
    RETURN NEW;
  END IF;
  INSERT INTO public.empresa_modulos_historico
    (empresa_id, modulo_codigo, acao, autorizado_por, motivo, origem,
     vigencia_inicio, vigencia_fim, responsavel_id, responsavel)
  VALUES (
    NEW.empresa_id, NEW.modulo_codigo,
    CASE WHEN NEW.habilitado THEN 'HABILITAR' ELSE 'DESABILITAR' END,
    NEW.autorizado_por,
    coalesce(nullif(NEW.motivo, ''), nullif(current_setting('jinlong.modulo_motivo', true), ''), 'SEM_MOTIVO_REGISTRADO'),
    coalesce(nullif(current_setting('jinlong.modulo_origem', true), ''), 'ESCRITA_DIRETA'),
    NEW.vigencia_inicio, NEW.vigencia_fim, NEW.responsavel_id, NEW.responsavel
  );
  RETURN NEW;
END
$$;

-- Ativo = habilitado + dentro da vigência do módulo + empresa operacional.
CREATE OR REPLACE FUNCTION public.fp_modulo_ativo(p_empresa uuid, p_modulo text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.empresa_modulos m
     WHERE m.empresa_id = p_empresa AND m.modulo_codigo = p_modulo AND m.habilitado
       AND (m.vigencia_inicio IS NULL OR m.vigencia_inicio <= current_date)
       AND (m.vigencia_fim IS NULL OR m.vigencia_fim >= current_date)
  ) AND public.fp_empresa_operacional(p_empresa)
$$;

REVOKE ALL ON FUNCTION public.fp_modulo_ativo(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fp_modulo_ativo(uuid, text) TO service_role;

-- Núcleo único da escrita (sem grant a ninguém além do owner).
CREATE OR REPLACE FUNCTION public.modulo_definir_empresa_nucleo(
  p_empresa         uuid,
  p_modulo          text,
  p_habilitado      boolean,
  p_autorizado_por  text,
  p_motivo          text,
  p_vigencia_inicio date,
  p_vigencia_fim    date,
  p_responsavel_id  uuid,
  p_responsavel     text,
  p_origem          text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_empresa IS NULL OR p_modulo IS NULL OR p_habilitado IS NULL THEN
    RAISE EXCEPTION 'MODULO_PARAMETRO_AUSENTE';
  END IF;
  IF length(btrim(coalesce(p_motivo, ''))) < 10 THEN
    RAISE EXCEPTION 'MODULO_MOTIVO_OBRIGATORIO';
  END IF;
  IF p_habilitado AND length(btrim(coalesce(p_autorizado_por, ''))) = 0 THEN
    RAISE EXCEPTION 'MODULO_AUTORIZACAO_OBRIGATORIA';
  END IF;
  IF length(btrim(coalesce(p_responsavel, ''))) = 0 AND p_responsavel_id IS NULL THEN
    RAISE EXCEPTION 'MODULO_RESPONSAVEL_OBRIGATORIO';
  END IF;
  IF p_vigencia_fim IS NOT NULL AND p_vigencia_inicio IS NOT NULL AND p_vigencia_fim < p_vigencia_inicio THEN
    RAISE EXCEPTION 'MODULO_VIGENCIA_INVALIDA';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.empresas WHERE id = p_empresa) THEN
    RAISE EXCEPTION 'MODULO_EMPRESA_INEXISTENTE';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.modulos_catalogo WHERE codigo = p_modulo) THEN
    RAISE EXCEPTION 'MODULO_INEXISTENTE';
  END IF;

  PERFORM set_config('jinlong.modulo_origem', p_origem, true);

  INSERT INTO public.empresa_modulos
    (empresa_id, modulo_codigo, habilitado, autorizado_por, alterado_em,
     vigencia_inicio, vigencia_fim, responsavel_id, responsavel, motivo)
  VALUES (p_empresa, p_modulo, p_habilitado, CASE WHEN p_habilitado THEN p_autorizado_por END, now(),
          p_vigencia_inicio, p_vigencia_fim, p_responsavel_id, p_responsavel, p_motivo)
  ON CONFLICT (empresa_id, modulo_codigo) DO UPDATE
    SET habilitado = EXCLUDED.habilitado,
        autorizado_por = EXCLUDED.autorizado_por,
        alterado_em = EXCLUDED.alterado_em,
        vigencia_inicio = EXCLUDED.vigencia_inicio,
        vigencia_fim = EXCLUDED.vigencia_fim,
        responsavel_id = EXCLUDED.responsavel_id,
        responsavel = EXCLUDED.responsavel,
        motivo = EXCLUDED.motivo;

  PERFORM set_config('jinlong.modulo_origem', '', true);
END
$$;

REVOKE ALL ON FUNCTION public.modulo_definir_empresa_nucleo(uuid, text, boolean, text, text, date, date, uuid, text, text)
  FROM PUBLIC, anon, authenticated, service_role;

-- Caminho operacional (procedimento administrativo): service_role, sem identidade de usuário.
DROP FUNCTION IF EXISTS public.ops_definir_modulo_empresa(uuid, text, boolean, text, text);
CREATE OR REPLACE FUNCTION public.ops_definir_modulo_empresa(
  p_empresa         uuid,
  p_modulo          text,
  p_habilitado      boolean,
  p_autorizado_por  text,
  p_motivo          text,
  p_responsavel     text,
  p_vigencia_inicio date DEFAULT NULL,
  p_vigencia_fim    date DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NOT NULL THEN
    RAISE EXCEPTION 'MODULO_OPS_SOMENTE_PROCEDIMENTO' USING ERRCODE = '42501';
  END IF;
  PERFORM public.modulo_definir_empresa_nucleo(p_empresa, p_modulo, p_habilitado, p_autorizado_por, p_motivo,
    p_vigencia_inicio, p_vigencia_fim, NULL, p_responsavel, 'ops_definir_modulo_empresa');
END
$$;

REVOKE ALL ON FUNCTION public.ops_definir_modulo_empresa(uuid, text, boolean, text, text, text, date, date)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ops_definir_modulo_empresa(uuid, text, boolean, text, text, text, date, date)
  TO service_role;

-- Caminho de plataforma: administrador comercial autorizado (capacidade COMERCIAL).
CREATE OR REPLACE FUNCTION public.plataforma_definir_modulo_empresa(
  p_empresa         uuid,
  p_modulo          text,
  p_habilitado      boolean,
  p_autorizado_por  text,
  p_motivo          text,
  p_vigencia_inicio date DEFAULT NULL,
  p_vigencia_fim    date DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.fp_plataforma_pode('COMERCIAL') THEN
    RAISE EXCEPTION 'PLATAFORMA_NAO_AUTORIZADA' USING ERRCODE = '42501';
  END IF;
  PERFORM public.modulo_definir_empresa_nucleo(p_empresa, p_modulo, p_habilitado, p_autorizado_por, p_motivo,
    p_vigencia_inicio, p_vigencia_fim, auth.uid(), NULL, 'plataforma_definir_modulo_empresa');
END
$$;

REVOKE ALL ON FUNCTION public.plataforma_definir_modulo_empresa(uuid, text, boolean, text, text, date, date)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.plataforma_definir_modulo_empresa(uuid, text, boolean, text, text, date, date)
  TO authenticated;

-- Contexto de tenant para um módulo, derivado do usuário autenticado (nunca só do frontend).
-- p_empresa informado ⇒ validado. Omitido ⇒ só resolve se houver exatamente UMA empresa elegível.
CREATE OR REPLACE FUNCTION public.fp_empresa_contexto_modulo(
  p_modulo  text,
  p_papeis  text[] DEFAULT ARRAY['DONO'],
  p_empresa uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_ids uuid[];
BEGIN
  IF auth.uid() IS NULL OR p_modulo IS NULL THEN
    RETURN NULL;
  END IF;
  IF p_empresa IS NOT NULL THEN
    RETURN CASE WHEN public.fp_pode_modulo(p_empresa, p_modulo, p_papeis) THEN p_empresa END;
  END IF;
  SELECT array_agg(DISTINCT v.empresa_id) INTO v_ids
    FROM public.usuario_vinculos v
   WHERE v.usuario_id = auth.uid() AND v.ativo
     AND public.fp_pode_modulo(v.empresa_id, p_modulo, p_papeis);
  IF coalesce(cardinality(v_ids), 0) <> 1 THEN
    RETURN NULL;   -- nenhuma ou ambígua: nega
  END IF;
  RETURN v_ids[1];
END
$$;

REVOKE ALL ON FUNCTION public.fp_empresa_contexto_modulo(text, text[], uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fp_empresa_contexto_modulo(text, text[], uuid) TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 8. RPCs de leitura com escopo global legado (DONO/ADMIN "Padrão A")
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.obter_estoque_disponivel_transferencia(p_loja_id uuid, p_produto_id uuid)
 RETURNS TABLE(quantidade_disponivel numeric, unidade_medida text, limite_observacao numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'TRANSFERENCIA_AUTH';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM public.usuarios u
     WHERE u.id = v_uid
       AND u.perfil IN ('GERENTE', 'DONO', 'ADMIN')
  ) THEN
    RAISE EXCEPTION 'TRANSFERENCIA_PERFIL';
  END IF;

  -- F1: loja consultada e produto precisam estar na empresa do usuário.
  IF NOT public.fp_loja_na_cerca(p_loja_id)
     OR NOT EXISTS (SELECT 1 FROM public.produtos p WHERE p.id = p_produto_id
                     AND public.fp_loja_na_cerca(p.loja_id)) THEN
    RAISE EXCEPTION 'TRANSFERENCIA_FORA_DA_EMPRESA' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    COALESCE(e.quantidade_atual, 0)::numeric AS quantidade_disponivel,
    COALESCE(p.unidade_medida, 'UN')::text AS unidade_medida,
    COALESCE(p.limite_transferencia_sem_observacao, pc.limite_transferencia_obs, 50)::numeric AS limite_observacao
  FROM public.produtos p
  LEFT JOIN public.estoque e
    ON e.produto_id = p.id
   AND e.loja_id = p_loja_id
  CROSS JOIN public.pdv_config pc
  WHERE p.id = p_produto_id
  LIMIT 1;
END;
$function$;

CREATE OR REPLACE FUNCTION public.relatorio_consistencia_vendas_gerente(p_caixa_id uuid DEFAULT NULL::uuid, p_from timestamp with time zone DEFAULT (now() - '7 days'::interval), p_to timestamp with time zone DEFAULT now())
 RETURNS TABLE(total_vendas bigint, vendas_consistentes bigint, vendas_com_anomalia bigint, taxa_consistencia_pct numeric, sem_itens bigint, sem_evento_ledger bigint, evento_duplicado bigint, sem_pagamento bigint, pagamentos_divergentes bigint, periodo_inicio timestamp with time zone, periodo_fim timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_perfil text;
  v_loja_usuario uuid;
  v_loja_escopo uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'RELATORIO_CONSISTENCIA_AUTH';
  END IF;

  SELECT u.perfil, u.loja_id INTO v_perfil, v_loja_usuario
  FROM public.usuarios u WHERE u.id = v_uid;

  IF v_perfil IS NULL OR v_perfil NOT IN ('GERENTE', 'DONO', 'ADMIN') THEN
    RAISE EXCEPTION 'RELATORIO_CONSISTENCIA_PERFIL';
  END IF;

  -- GERENTE só vê a própria loja. DONO/ADMIN (Padrão A, consolidado em
  -- 20260829120000/fase6) têm escopo global — sem filtro de loja.
  IF v_perfil = 'GERENTE' THEN
    v_loja_escopo := v_loja_usuario;
  END IF;

  -- Se um caixa específico foi pedido, GERENTE só pode consultar um caixa
  -- da própria loja — cross-loja nega antes de expor qualquer linha.
  IF p_caixa_id IS NOT NULL AND v_perfil = 'GERENTE' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.caixas c WHERE c.id = p_caixa_id AND c.loja_id = v_loja_usuario
    ) THEN
      RAISE EXCEPTION 'RELATORIO_CONSISTENCIA_LOJA_INVALIDA';
    END IF;
  END IF;

  -- F1: o escopo "global" de DONO/ADMIN é o da empresa. Caixa pedido precisa estar na cerca;
  -- consulta sem caixa e sem loja só é permitida enquanto não houver loja fora da cerca
  -- (o relatório subjacente não agrega por empresa). Para o cliente atual: idêntico.
  IF p_caixa_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.caixas c WHERE c.id = p_caixa_id
                      AND public.fp_loja_na_cerca(c.loja_id)) THEN
    RAISE EXCEPTION 'RELATORIO_CONSISTENCIA_LOJA_INVALIDA';
  END IF;
  IF p_caixa_id IS NULL AND v_loja_escopo IS NULL
     AND EXISTS (SELECT 1 FROM public.lojas l WHERE NOT (l.id = ANY (public.fp_lojas_cerca()))) THEN
    RAISE EXCEPTION 'RELATORIO_CONSISTENCIA_ESCOPO_MULTIEMPRESA' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT * FROM public.relatorio_consistencia_vendas(p_caixa_id, v_loja_escopo, p_from, p_to);
END;
$function$;

-- ----------------------------------------------------------------------------
-- 9. Views que executam como dono (ignoram RLS e a cerca)
-- produtos_custos precisa continuar definer (preco_custo tem SELECT revogado); ganha a cerca.
-- v_top_produtos / v_vendas_dia / v_venda_consistencia_anomalias agregavam vendas de TODAS
-- as lojas para qualquer autenticado; sem uso no aplicativo. Passam a respeitar RLS (invoker).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.produtos_custos WITH (security_invoker = off) AS
 SELECT p.id AS produto_id,
    p.loja_id,
    p.preco_custo,
    p.preco_custo_medio
   FROM produtos p
     JOIN usuarios u ON u.id = (( SELECT auth.uid() AS uid)) AND COALESCE(u.ativo, false) AND (u.perfil = ANY (ARRAY['GERENTE'::text, 'DONO'::text, 'ADMIN'::text])) AND (u.perfil = 'ADMIN'::text OR u.loja_id = p.loja_id)
  WHERE p.loja_id = ANY ((SELECT public.fp_lojas_cerca())::uuid[]);

ALTER VIEW public.v_top_produtos SET (security_invoker = true);
ALTER VIEW public.v_vendas_dia SET (security_invoker = true);
ALTER VIEW public.v_venda_consistencia_anomalias SET (security_invoker = true);

COMMIT;
