-- Revoga EXECUTE de `authenticated` nos helpers que revelam dados de outra empresa/loja.
--
-- PROBLEMA (comprovado na auditoria INT-01 / RPC-SECDEF, 2026-10-28): estes helpers são SECURITY DEFINER e
-- não conferem se o chamador pertence à empresa informada. Um usuário autenticado da empresa A, passando o
-- UUID de uma loja da empresa B, recebia:
--   - fp_empresa_da_loja(lojaB)   -> id da empresa B
--   - fp_empresa_operacional(eB)  -> se a empresa B está ATIVA e em vigência
--   - fp_pdv_config_id(lojaB)     -> id da configuração de PDV da loja B
--   - fp_mesma_empresa(lojaB, lojaB) -> booleano de pertencimento (exposto como enumeração)
--
-- Consumidores legítimos não dependem do grant de `authenticated`:
--   - todos os chamadores no banco são funções SECURITY DEFINER (executam como dono, que mantém EXECUTE);
--   - não há view nem policy de RLS que os chame;
--   - nenhum código do app (pdv-importados, pdv-local, shared-core, hub, site) chama essas RPCs.
-- Os corpos das funções não mudam: só o privilégio de execução.
--
-- Regressão: backend/scripts/ (suítes multiempresa e comissao) e a matriz de acesso cruzado da auditoria.
--
-- ROLLBACK (idempotente):
--   GRANT EXECUTE ON FUNCTION public.fp_empresa_da_loja(uuid) TO authenticated;
--   GRANT EXECUTE ON FUNCTION public.fp_empresa_operacional(uuid) TO authenticated;
--   GRANT EXECUTE ON FUNCTION public.fp_pdv_config_id(uuid) TO authenticated;
--   GRANT EXECUTE ON FUNCTION public.fp_mesma_empresa(uuid, uuid) TO authenticated;

DO $revoke$
DECLARE
  f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'public.fp_empresa_da_loja(uuid)',
    'public.fp_empresa_operacional(uuid)',
    'public.fp_pdv_config_id(uuid)',
    'public.fp_mesma_empresa(uuid, uuid)'
  ] LOOP
    IF to_regprocedure(f) IS NOT NULL THEN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', f);
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', f);
    END IF;
  END LOOP;
END
$revoke$;
