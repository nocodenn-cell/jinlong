-- Rollback S1c (20261029140000): volta a autorização de conferência por usuarios.loja_id.
BEGIN;

DO $rb$
DECLARE
  r record;
  v_def text;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('internal.registrar_conferencia_ordem_compra(uuid,jsonb)',
       $b$IF v_perfil = 'GERENTE' AND NOT public.fp_usuario_pode_loja(v_uid, v_oc.loja_id, ARRAY['GERENTE']) THEN$b$,
       $a$IF v_perfil = 'GERENTE' AND v_loja_usuario IS DISTINCT FROM v_oc.loja_id THEN$a$),
      ('internal.registrar_conferencia_nfe(uuid,jsonb)',
       $b$IF v_perfil = 'GERENTE' AND NOT public.fp_usuario_pode_loja(v_uid, v_imp.loja_id, ARRAY['GERENTE']) THEN$b$,
       $a$IF v_perfil = 'GERENTE' AND v_loja_usuario IS DISTINCT FROM v_imp.loja_id THEN$a$)
    ) AS t(fn, novo, antigo)
  LOOP
    v_def := pg_get_functiondef(r.fn::regprocedure);
    IF (length(v_def) - length(replace(v_def, r.novo, ''))) / length(r.novo) <> 1 THEN
      RAISE EXCEPTION 'S1c ROLLBACK: guarda S1c não encontrada exatamente 1 vez em %', r.fn;
    END IF;
    EXECUTE replace(v_def, r.novo, r.antigo);
  END LOOP;
END
$rb$;

NOTIFY pgrst, 'reload schema';
COMMIT;
