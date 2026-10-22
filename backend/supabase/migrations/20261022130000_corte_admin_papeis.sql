-- 20261022130000_corte_admin_papeis.sql
-- Fase "Corte ADMIN" (ESPEC_MULTIEMPRESA_V1 §6, etapa 11): o perfil global legado ADMIN deixa de ter
-- qualquer poder dentro das lojas/empresas. Papéis do cliente: DONO, GERENTE, OPERADOR.
-- Acesso da equipe da plataforma (Nature Code) fica fora do sistema das lojas (hub comercial) — nada novo aqui.
--
-- NÃO APLICAR no Supabase remoto sem revisão do dono e validação em homologação. Depende do PR #620
-- (20261022120000_sec_token_gerente_loja_nula_fora_da_loja e 20261022121000_cobranca_correcoes_revisao_585).
--
-- O que faz (aditivo; não remove valor de CHECK nem apaga linhas):
--  1. backup dos usuários ADMIN em internal.usuarios_admin_corte_backup (rollback);
--  2. ADMIN com vínculo DONO ativo numa empresa ⇒ perfil DONO (só nessa empresa, pelo vínculo);
--     ADMIN sem vínculo DONO ⇒ ativo = false (sem acesso de loja). Perfil ADMIN mantido na linha;
--  3. trigger impede criar ADMIN novo, promover alguém a ADMIN ou reativar um ADMIN (exceto contexto de servidor);
--  4. helpers sem o ramo ADMIN: fp_admin_legado() e auth_usuario_eh_admin() = false; fp_pode_loja sem ADMIN
--     (isso neutraliza as guardas tenant_guard, fp_pode_loja_nula, fp_pode_empresa, envelopes de RPC,
--      comissao_eh_gestor e as policies que chamam auth_usuario_eh_admin);
--  5. vincular_usuario_loja e internal.token_gerente_fora_da_loja sem o atalho ADMIN.
-- As policies antigas que listam 'ADMIN' inline (perfil IN ('GERENTE','DONO','ADMIN')) ficam mortas:
-- nenhum ADMIN ativo existe após (2) e (3), e a guarda RESTRICTIVE tenant_guard exige vínculo.
--
-- Pré-checagem (somente leitura), 22/10/2026 em produção: 1 usuário ADMIN, já inativo, sem vínculo.
--   SELECT perfil, ativo, count(*) FROM public.usuarios WHERE perfil = 'ADMIN' GROUP BY 1, 2;
-- Rollback: backend/supabase/rollback/20261022130000_corte_admin_papeis.rollback.sql

BEGIN;

-- 1. Backup -------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS internal.usuarios_admin_corte_backup (
  usuario_id uuid PRIMARY KEY,
  perfil_antes text NOT NULL,
  ativo_antes boolean,
  acao text NOT NULL,
  em timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON internal.usuarios_admin_corte_backup FROM PUBLIC;

INSERT INTO internal.usuarios_admin_corte_backup (usuario_id, perfil_antes, ativo_antes, acao)
SELECT u.id, u.perfil, u.ativo,
       CASE WHEN EXISTS (SELECT 1 FROM public.usuario_vinculos v
                          WHERE v.usuario_id = u.id AND v.ativo AND v.papel = 'DONO')
            THEN 'VIROU_DONO' ELSE 'DESATIVADO' END
  FROM public.usuarios u
 WHERE u.perfil = 'ADMIN'
ON CONFLICT (usuario_id) DO NOTHING;

-- 2. Remapeamento ------------------------------------------------------------------------------------
UPDATE public.usuarios u SET perfil = 'DONO'
  FROM internal.usuarios_admin_corte_backup b
 WHERE b.usuario_id = u.id AND b.acao = 'VIROU_DONO' AND u.perfil = 'ADMIN';

UPDATE public.usuarios u SET ativo = false
  FROM internal.usuarios_admin_corte_backup b
 WHERE b.usuario_id = u.id AND b.acao = 'DESATIVADO' AND u.perfil = 'ADMIN' AND u.ativo IS DISTINCT FROM false;

-- 3. Bloqueio de ADMIN novo/reativado --------------------------------------------------------------
CREATE OR REPLACE FUNCTION internal.fp_bloquear_perfil_admin()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.perfil IS DISTINCT FROM 'ADMIN' THEN RETURN NEW; END IF;
  IF current_setting('fp.permitir_admin_legado', true) = 'on' THEN RETURN NEW; END IF; -- só rollback/manutenção
  IF TG_OP = 'INSERT' OR OLD.perfil IS DISTINCT FROM 'ADMIN' THEN
    RAISE EXCEPTION 'PERFIL_ADMIN_DESCONTINUADO' USING ERRCODE = '42501';
  END IF;
  IF coalesce(NEW.ativo, true) AND OLD.ativo IS NOT DISTINCT FROM false THEN
    RAISE EXCEPTION 'PERFIL_ADMIN_DESCONTINUADO' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_fp_bloquear_perfil_admin ON public.usuarios;
CREATE TRIGGER trg_fp_bloquear_perfil_admin
  BEFORE INSERT OR UPDATE OF perfil, ativo ON public.usuarios
  FOR EACH ROW EXECUTE FUNCTION internal.fp_bloquear_perfil_admin();

-- 4. Helpers sem ramo ADMIN -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fp_admin_legado()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT false; -- Corte ADMIN: nenhum perfil global dentro das lojas
$$;

CREATE OR REPLACE FUNCTION public.auth_usuario_eh_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT false; -- Corte ADMIN
$$;
COMMENT ON FUNCTION public.auth_usuario_eh_admin() IS
  'Descontinuado (Corte ADMIN 20261022130000): sempre false. Mantido para as policies antigas que o chamam.';

CREATE OR REPLACE FUNCTION public.fp_pode_loja(p_loja uuid, p_papeis text[] DEFAULT NULL)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT p_loja IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.fp_lojas_permitidas(p_papeis) x WHERE x = p_loja);
$$;

-- 5. RPCs com atalho ADMIN -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.vincular_usuario_loja(p_usuario uuid, p_loja uuid, p_papel text, p_ator uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_emp uuid; v_id uuid;
BEGIN
  IF p_papel NOT IN ('GERENTE', 'OPERADOR') THEN RAISE EXCEPTION 'VINCULO_PAPEL_INVALIDO'; END IF;
  SELECT empresa_id INTO v_emp FROM public.lojas WHERE id = p_loja;
  IF v_emp IS NULL THEN RAISE EXCEPTION 'VINCULO_LOJA_SEM_EMPRESA'; END IF;
  IF NOT public.fp_usuario_pode_loja(p_ator, p_loja, ARRAY['DONO', 'GERENTE']) THEN
    RAISE EXCEPTION 'VINCULO_ATOR_SEM_ACESSO_LOJA';
  END IF;
  IF EXISTS (SELECT 1 FROM public.usuario_vinculos WHERE usuario_id = p_usuario AND ativo AND empresa_id <> v_emp) THEN
    RAISE EXCEPTION 'VINCULO_USUARIO_DE_OUTRA_EMPRESA';
  END IF;
  IF p_papel = 'OPERADOR' THEN
    UPDATE public.usuario_vinculos SET ativo = false
     WHERE usuario_id = p_usuario AND empresa_id = v_emp AND papel = 'OPERADOR' AND loja_id <> p_loja AND ativo;
  END IF;
  INSERT INTO public.usuario_vinculos (usuario_id, empresa_id, loja_id, papel, created_by)
  VALUES (p_usuario, v_emp, p_loja, p_papel, p_ator)
  ON CONFLICT (usuario_id, empresa_id, papel, COALESCE(loja_id, '00000000-0000-0000-0000-000000000000'::uuid))
  DO UPDATE SET ativo = true
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION public.vincular_usuario_loja(uuid, uuid, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.vincular_usuario_loja(uuid, uuid, text, uuid) TO service_role;

-- Token de gerente: só o emissor DONO (vínculo DONO ativo na empresa da loja) vale fora da própria loja_id.
CREATE OR REPLACE FUNCTION internal.token_gerente_fora_da_loja(p_token text, p_loja_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
      FROM public.tokens_desconto_gerente t
      LEFT JOIN public.usuarios u ON u.id = t.criado_por
     WHERE t.token = p_token
       AND (
         u.id IS NULL
         OR t.loja_id IS NULL
         OR btrim(t.loja_id::text) = ''
         OR p_loja_id IS NULL
         OR (u.loja_id IS DISTINCT FROM p_loja_id AND NOT (
               u.perfil = 'DONO' AND EXISTS (
                 SELECT 1 FROM public.usuario_vinculos v JOIN public.lojas l ON l.empresa_id = v.empresa_id
                  WHERE v.usuario_id = u.id AND v.ativo AND v.papel = 'DONO' AND l.id = p_loja_id)))
         OR lower(btrim(t.loja_id::text)) IS DISTINCT FROM p_loja_id::text
       )
  );
$function$;
COMMENT ON FUNCTION internal.token_gerente_fora_da_loja(text, uuid) IS
  'SEC-04 + loja nula + Corte ADMIN: true quando o token existe e NÃO pertence à loja. Fora da loja_id do emissor só vale se ele for DONO (vínculo ativo) da empresa da loja. Token inexistente = false.';

COMMIT;
