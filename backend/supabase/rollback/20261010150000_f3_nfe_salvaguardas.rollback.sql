-- ============================================================================
-- ROLLBACK da F3 (20261010150000_f3_nfe_salvaguardas.sql). Manual, com autorização.
-- Remove a trava D7, a conferência registrada e o relatório D5.
-- Perde: as conferências registradas em importacoes_nfe.conferencia_recebimento_anterior.
-- O rollout ROLLOUT_NFE_TRAVA_RECEBIMENTO só sai do catálogo se nenhuma empresa tiver histórico
-- dele (histórico é imutável); caso contrário fica no catálogo, sem efeito.
-- ============================================================================
BEGIN;

DROP TRIGGER IF EXISTS nfe_trava_recebimento_duplicado ON public.importacoes_nfe;
DROP FUNCTION IF EXISTS public.trg_nfe_trava_recebimento_duplicado();
DROP FUNCTION IF EXISTS public.nfe_registrar_conferencia_recebimento_anterior(uuid, text);
DROP FUNCTION IF EXISTS public.nfe_recebimentos_anteriores_suspeitos(uuid);
DROP FUNCTION IF EXISTS public._nfe_recebimentos_suspeitos(uuid);
DROP FUNCTION IF EXISTS public.ops_relatorio_vinculos_d5();
ALTER TABLE public.importacoes_nfe DROP COLUMN IF EXISTS conferencia_recebimento_anterior;

DELETE FROM public.empresa_modulos WHERE modulo_codigo = 'ROLLOUT_NFE_TRAVA_RECEBIMENTO' AND NOT habilitado
  AND NOT EXISTS (SELECT 1 FROM public.empresa_modulos_historico h WHERE h.modulo_codigo = 'ROLLOUT_NFE_TRAVA_RECEBIMENTO');
DELETE FROM public.modulos_catalogo c WHERE c.codigo = 'ROLLOUT_NFE_TRAVA_RECEBIMENTO'
  AND NOT EXISTS (SELECT 1 FROM public.empresa_modulos_historico h WHERE h.modulo_codigo = c.codigo)
  AND NOT EXISTS (SELECT 1 FROM public.empresa_modulos m WHERE m.modulo_codigo = c.codigo);

COMMIT;
