-- ROLLBACK de 20261023120000 — ALTERA PRODUÇÃO. Só com decisão registrada em ROTEIRO.md §5.
-- 20261022020000 não tem rollback em produção (no-op: a coluna não existe).
-- Não apaga linhas de supabase_migrations.schema_migrations; depois do rollback, abrir PR com
-- migration nova que registre o estado revertido.

BEGIN;

GRANT EXECUTE ON FUNCTION public.decrementar_estoque_seguro(uuid, numeric, uuid) TO authenticated;

DO $diag$
DECLARE
  v_oid oid := to_regprocedure('public.pdv_diagnostico_pre_producao(text)');
  v_def text;
  v_nova text;
  c_novo constant text :=
    $re$v_ok\s*:=\s*NOT\s+has_function_privilege\(\s*'authenticated'\s*,\s*'public\.decrementar_estoque_seguro\(uuid, numeric, uuid\)'\s*,\s*'EXECUTE'\s*\)$re$;
BEGIN
  IF v_oid IS NULL THEN
    RAISE NOTICE 'pdv_diagnostico_pre_producao ausente — nada a reverter';
    RETURN;
  END IF;

  v_def := pg_get_functiondef(v_oid);
  IF v_def !~ c_novo THEN
    RAISE NOTICE 'check novo não encontrado — diagnóstico já está no estado anterior';
    RETURN;
  END IF;

  v_nova := regexp_replace(v_def, c_novo,
    $r$v_ok := has_function_privilege('authenticated', 'public.decrementar_estoque_seguro(uuid, numeric, uuid)', 'EXECUTE')$r$);
  v_nova := replace(v_nova, $t$'Estoque seguro sem EXECUTE direto'$t$, $t$'GRANT estoque seguro'$t$);
  v_nova := replace(v_nova,
    $d$'authenticated sem EXECUTE direto (só finalizar v4 / sync-outbox).'$d$,
    $d$'authenticated (pode executar decrementar_estoque_seguro).'$d$);
  EXECUTE v_nova;
END
$diag$;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- Conferir depois: has_function_privilege('authenticated', 'public.decrementar_estoque_seguro(uuid, numeric, uuid)', 'EXECUTE') = true
