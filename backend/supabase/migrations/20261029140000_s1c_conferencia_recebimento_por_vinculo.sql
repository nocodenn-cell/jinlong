-- ============================================================================
-- S1c — Conferência de recebimento autorizada por vínculo (fecha lacuna do S1).
--
-- internal.registrar_conferencia_ordem_compra e internal.registrar_conferencia_nfe
-- ainda autorizavam GERENTE por usuarios.loja_id; GERENTE multi-loja era negado
-- na loja vinculada. Troca exata da guarda por fp_usuario_pode_loja (1 ocorrência cada).
-- Rollback: 20261029140000_s1c_..._rollback.sql
-- ============================================================================

BEGIN;

DO $s1c$
DECLARE
  r record;
  v_def text;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('internal.registrar_conferencia_ordem_compra(uuid,jsonb)',
       $a$IF v_perfil = 'GERENTE' AND v_loja_usuario IS DISTINCT FROM v_oc.loja_id THEN$a$,
       $b$IF v_perfil = 'GERENTE' AND NOT public.fp_usuario_pode_loja(v_uid, v_oc.loja_id, ARRAY['GERENTE']) THEN$b$),
      ('internal.registrar_conferencia_nfe(uuid,jsonb)',
       $a$IF v_perfil = 'GERENTE' AND v_loja_usuario IS DISTINCT FROM v_imp.loja_id THEN$a$,
       $b$IF v_perfil = 'GERENTE' AND NOT public.fp_usuario_pode_loja(v_uid, v_imp.loja_id, ARRAY['GERENTE']) THEN$b$)
    ) AS t(fn, antigo, novo)
  LOOP
    v_def := pg_get_functiondef(r.fn::regprocedure);
    IF (length(v_def) - length(replace(v_def, r.antigo, ''))) / length(r.antigo) <> 1 THEN
      RAISE EXCEPTION 'S1c: guarda não encontrada exatamente 1 vez em %', r.fn;
    END IF;
    EXECUTE replace(v_def, r.antigo, r.novo);
  END LOOP;
END
$s1c$;

DO $prova$
BEGIN
  IF position('fp_usuario_pode_loja' IN pg_get_functiondef('internal.registrar_conferencia_ordem_compra(uuid,jsonb)'::regprocedure)) = 0
     OR position('fp_usuario_pode_loja' IN pg_get_functiondef('internal.registrar_conferencia_nfe(uuid,jsonb)'::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'S1c PROVA FAIL';
  END IF;
END
$prova$;

NOTIFY pgrst, 'reload schema';
COMMIT;
