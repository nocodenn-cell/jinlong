-- Rollback de 20261028110000_corte_admin_papeis.sql (somente após decisão do dono).
-- STATUS: PREPARADO PARA HOMOLOGAÇÃO. NÃO APLICADO EM PRODUÇÃO.
--
-- Restaura perfil/ativo/loja cadastral dos ex-ADMIN e o estado (ativo) de TODOS os vínculos deles a partir do
-- backup, remove o bloqueio de perfil ADMIN e devolve as funções às definições ANTERIORES ao corte.
--
-- Definições restauradas:
--   - internal.token_gerente_fora_da_loja: corpo de 20261028100000 (o corte a redefine; ver ordem abaixo);
--   - public.auth_usuario_eh_admin, public.fp_admin_legado, public.fp_pode_loja, public.vincular_usuario_loja:
--     copiadas do banco de homologação descartável e conferidas por md5 do pg_get_functiondef contra
--     PRODUÇÃO (somente leitura, 2026-11-05): md5 iguais para as quatro funções.
--
-- ORDEM OBRIGATÓRIA: reverter antes 20261028122000, 20261028121000 e 20261028120100 (rollbacks próprios),
-- se estiverem aplicadas. Esta reverte o corte; depois, se 20261028100000 também for revertida, use o rollback dela.
-- Dados: a restauração de perfil/ativo usa internal.usuarios_admin_corte_backup (não é apagada aqui).
--
-- Execução prevista: psql "$DB_URL" -v ON_ERROR_STOP=1 -f <este arquivo>
BEGIN;

DROP TRIGGER IF EXISTS trg_fp_bloquear_perfil_admin ON public.usuarios;
DROP FUNCTION IF EXISTS internal.fp_bloquear_perfil_admin();

-- Funções (estado anterior ao corte)
CREATE OR REPLACE FUNCTION internal.token_gerente_fora_da_loja(
  p_token text,
  p_loja_id uuid
)
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
         OR (u.perfil NOT IN ('DONO', 'ADMIN') AND u.loja_id IS DISTINCT FROM p_loja_id)
         OR (t.loja_id IS NOT NULL
             AND lower(btrim(t.loja_id)) IS DISTINCT FROM p_loja_id::text)
         OR (u.perfil IN ('DONO', 'ADMIN')
             AND NOT EXISTS (
               SELECT 1
                WHERE public.fp_empresa_da_loja(p_loja_id) IS NOT NULL
                  AND (
                    public.fp_empresa_da_loja(u.loja_id) = public.fp_empresa_da_loja(p_loja_id)
                    OR EXISTS (
                      SELECT 1
                        FROM public.usuario_vinculos v
                       WHERE v.usuario_id = u.id
                         AND v.ativo
                         AND v.empresa_id = public.fp_empresa_da_loja(p_loja_id)
                         AND (v.papel = 'DONO' OR v.loja_id = p_loja_id)
                    )
                  )
             ))
       )
  );
$function$;

CREATE OR REPLACE FUNCTION public.auth_usuario_eh_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.usuarios u
    WHERE u.id = (SELECT auth.uid()) AND u.perfil = 'ADMIN'
  );
$function$;


CREATE OR REPLACE FUNCTION public.fp_admin_legado()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT EXISTS (SELECT 1 FROM public.usuarios u WHERE u.id = (SELECT auth.uid()) AND u.ativo AND u.perfil = 'ADMIN');
$function$;


CREATE OR REPLACE FUNCTION public.fp_pode_loja(p_loja uuid, p_papeis text[] DEFAULT NULL::text[])
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT p_loja IS NOT NULL AND (
    EXISTS (SELECT 1 FROM public.fp_lojas_permitidas(p_papeis) x WHERE x = p_loja)
    OR EXISTS (SELECT 1 FROM public.usuarios u WHERE u.id = (SELECT auth.uid()) AND u.ativo AND u.perfil = 'ADMIN')
  );
$function$;


CREATE OR REPLACE FUNCTION public.vincular_usuario_loja(p_usuario uuid, p_loja uuid, p_papel text, p_ator uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_emp uuid; v_id uuid;
BEGIN
  IF p_papel NOT IN ('GERENTE', 'OPERADOR') THEN RAISE EXCEPTION 'VINCULO_PAPEL_INVALIDO'; END IF;
  SELECT empresa_id INTO v_emp FROM public.lojas WHERE id = p_loja;
  IF v_emp IS NULL THEN RAISE EXCEPTION 'VINCULO_LOJA_SEM_EMPRESA'; END IF;
  IF NOT (public.fp_usuario_pode_loja(p_ator, p_loja, ARRAY['DONO', 'GERENTE'])
          OR EXISTS (SELECT 1 FROM public.usuarios WHERE id = p_ator AND ativo AND perfil = 'ADMIN')) THEN
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
END $function$;


-- Dados: perfil/ativo/loja (o gatilho de sincronização desativa os vínculos DONO ao sair de DONO; corrigido em 2)
UPDATE public.usuarios u SET perfil = b.perfil_antes, ativo = b.ativo_antes, loja_id = coalesce(b.loja_id_antes, u.loja_id)
  FROM internal.usuarios_admin_corte_backup b WHERE b.usuario_id = u.id;
-- Dados: vínculos exatamente como estavam
UPDATE public.usuario_vinculos v SET ativo = k.ativo_antes
  FROM internal.usuarios_admin_corte_vinculos_backup k WHERE k.vinculo_id = v.id AND v.ativo IS DISTINCT FROM k.ativo_antes;
UPDATE public.usuario_vinculos v SET ativo = false
  FROM internal.usuarios_admin_corte_backup b
 WHERE b.usuario_id = v.usuario_id AND v.ativo
   AND NOT EXISTS (SELECT 1 FROM internal.usuarios_admin_corte_vinculos_backup k WHERE k.vinculo_id = v.id);

COMMIT;
