-- ============================================================================
-- S1b — Transferência entre CNPJs distintos bloqueada para TODOS os perfis.
--
-- ANTES (S1): a checagem de CNPJ distinto valia só para GERENTE fora da loja legada.
--   DONO podia transferir entre CNPJs distintos (comportamento legado).
-- AGORA: qualquer perfil. Lojas com CNPJs diferentes são pessoas jurídicas
--   distintas; sem fluxo fiscal validado (S8), a operação é recusada.
--   Mesmo CNPJ segue normal. CNPJ nulo é tratado como 'SEM_CNPJ' (distinto de
--   qualquer CNPJ informado, igual a outro nulo).
--
-- Substituição textual exata do bloco S1 em internal.transferir_estoque_seguro
-- (1 ocorrência, asserção). Rollback: 20261029130000_s1b_..._rollback.sql.
-- ============================================================================

BEGIN;

DO $s1b$
DECLARE
  v_def text;
  v_antigo text := $a$  -- S1: autorização por vínculo fora da loja legada não abre transferência entre
  -- CNPJs distintos (sem fluxo fiscal validado). Caminho legado inalterado.
  IF v_perfil = 'GERENTE'
     AND (v_loja_usuario IS NULL OR v_loja_usuario NOT IN (p_loja_origem, p_loja_destino))
     AND (SELECT count(DISTINCT coalesce(l.cnpj, '')) FROM public.lojas l
           WHERE l.id IN (p_loja_origem, p_loja_destino)) > 1 THEN
    RAISE EXCEPTION 'TRANSFERENCIA_CNPJ_DISTINTO_SEM_FLUXO_FISCAL';
  END IF;$a$;
  v_novo text := $b$  -- S1b: transferência entre CNPJs distintos exige fluxo fiscal (ainda não implementado).
  -- Vale para qualquer perfil; mesmo CNPJ segue normal.
  IF (SELECT count(DISTINCT coalesce(l.cnpj, 'SEM_CNPJ')) FROM public.lojas l
       WHERE l.id IN (p_loja_origem, p_loja_destino)) > 1 THEN
    RAISE EXCEPTION 'TRANSFERENCIA_CNPJ_DISTINTO_SEM_FLUXO_FISCAL';
  END IF;$b$;
BEGIN
  v_def := pg_get_functiondef('internal.transferir_estoque_seguro(uuid,uuid,uuid,numeric,text,text,numeric)'::regprocedure);
  IF (length(v_def) - length(replace(v_def, v_antigo, ''))) / length(v_antigo) <> 1 THEN
    RAISE EXCEPTION 'S1b: bloco S1 não encontrado exatamente 1 vez';
  END IF;
  EXECUTE replace(v_def, v_antigo, v_novo);
END
$s1b$;

DO $prova$
BEGIN
  IF position('S1b: transferência entre CNPJs' IN pg_get_functiondef('internal.transferir_estoque_seguro(uuid,uuid,uuid,numeric,text,text,numeric)'::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'S1b PROVA FAIL';
  END IF;
END
$prova$;

NOTIFY pgrst, 'reload schema';
COMMIT;
