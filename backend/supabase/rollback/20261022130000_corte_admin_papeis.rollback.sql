-- Rollback de 20261022130000_corte_admin_papeis.sql (somente após decisão do dono).
-- Restaura perfil/ativo dos ex-ADMIN a partir do backup e remove o bloqueio.
-- As funções voltam às definições anteriores reaplicando os CREATE OR REPLACE de:
--   20261019120000_multiempresa_fase1_base.sql (fp_pode_loja), 20261019140000_multiempresa_fase2_guardas.sql
--   (fp_admin_legado, vincular_usuario_loja), 20260816140000_rls_produtos_historico_isolamento_por_loja.sql
--   (auth_usuario_eh_admin) e 20261022120000_sec_token_gerente_loja_nula_fora_da_loja.sql (token).
BEGIN;
DROP TRIGGER IF EXISTS trg_fp_bloquear_perfil_admin ON public.usuarios;
DROP FUNCTION IF EXISTS internal.fp_bloquear_perfil_admin();
UPDATE public.usuarios u SET perfil = b.perfil_antes, ativo = b.ativo_antes
  FROM internal.usuarios_admin_corte_backup b WHERE b.usuario_id = u.id;
COMMIT;
