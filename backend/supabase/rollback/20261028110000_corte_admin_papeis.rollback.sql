-- Rollback de 20261028110000_corte_admin_papeis.sql (somente após decisão do dono).
-- Restaura perfil/ativo/loja cadastral dos ex-ADMIN e o estado (ativo) de TODOS os vínculos deles a partir do
-- backup, e remove o bloqueio. Vínculos que não existiam antes do corte ficam inativos.
-- As funções voltam às definições anteriores reaplicando os CREATE OR REPLACE de:
--   20261019120000_multiempresa_fase1_base.sql (fp_pode_loja), 20261019140000_multiempresa_fase2_guardas.sql
--   (fp_admin_legado, vincular_usuario_loja), 20260816140000_rls_produtos_historico_isolamento_por_loja.sql
--   (auth_usuario_eh_admin) e 20261028100000_sec_token_gerente_loja_nula_fora_da_loja.sql (token).
-- Pré-requisito: reverter antes 20261028122000, 20261028121000 e 20261028120100 (nessa ordem), se aplicadas (rollbacks próprios).
BEGIN;
DROP TRIGGER IF EXISTS trg_fp_bloquear_perfil_admin ON public.usuarios;
DROP FUNCTION IF EXISTS internal.fp_bloquear_perfil_admin();
-- 1) perfil/ativo/loja (o gatilho de sincronização desativa os vínculos DONO ao sair de DONO; corrigido em 2)
UPDATE public.usuarios u SET perfil = b.perfil_antes, ativo = b.ativo_antes, loja_id = coalesce(b.loja_id_antes, u.loja_id)
  FROM internal.usuarios_admin_corte_backup b WHERE b.usuario_id = u.id;
-- 2) vínculos exatamente como estavam
UPDATE public.usuario_vinculos v SET ativo = k.ativo_antes
  FROM internal.usuarios_admin_corte_vinculos_backup k WHERE k.vinculo_id = v.id AND v.ativo IS DISTINCT FROM k.ativo_antes;
UPDATE public.usuario_vinculos v SET ativo = false
  FROM internal.usuarios_admin_corte_backup b
 WHERE b.usuario_id = v.usuario_id AND v.ativo
   AND NOT EXISTS (SELECT 1 FROM internal.usuarios_admin_corte_vinculos_backup k WHERE k.vinculo_id = v.id);
COMMIT;
