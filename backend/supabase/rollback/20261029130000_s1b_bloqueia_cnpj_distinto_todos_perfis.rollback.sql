-- Rollback S1b (20261029130000): volta o bloqueio de CNPJ distinto só para GERENTE fora da loja legada.
BEGIN;

DO $rb$
DECLARE
  v_def text;
  v_novo text := $b$  -- S1b: transferência entre CNPJs distintos exige fluxo fiscal (ainda não implementado).
  -- Vale para qualquer perfil; mesmo CNPJ segue normal.
  IF (SELECT count(DISTINCT coalesce(l.cnpj, 'SEM_CNPJ')) FROM public.lojas l
       WHERE l.id IN (p_loja_origem, p_loja_destino)) > 1 THEN
    RAISE EXCEPTION 'TRANSFERENCIA_CNPJ_DISTINTO_SEM_FLUXO_FISCAL';
  END IF;$b$;
  v_antigo text := $a$  -- S1: autorização por vínculo fora da loja legada não abre transferência entre
  -- CNPJs distintos (sem fluxo fiscal validado). Caminho legado inalterado.
  IF v_perfil = 'GERENTE'
     AND (v_loja_usuario IS NULL OR v_loja_usuario NOT IN (p_loja_origem, p_loja_destino))
     AND (SELECT count(DISTINCT coalesce(l.cnpj, '')) FROM public.lojas l
           WHERE l.id IN (p_loja_origem, p_loja_destino)) > 1 THEN
    RAISE EXCEPTION 'TRANSFERENCIA_CNPJ_DISTINTO_SEM_FLUXO_FISCAL';
  END IF;$a$;
BEGIN
  v_def := pg_get_functiondef('internal.transferir_estoque_seguro(uuid,uuid,uuid,numeric,text,text,numeric)'::regprocedure);
  IF (length(v_def) - length(replace(v_def, v_novo, ''))) / length(v_novo) <> 1 THEN
    RAISE EXCEPTION 'S1b ROLLBACK: bloco S1b não encontrado exatamente 1 vez';
  END IF;
  EXECUTE replace(v_def, v_novo, v_antigo);
END
$rb$;

NOTIFY pgrst, 'reload schema';
COMMIT;
