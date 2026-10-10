-- ============================================================================
-- ROLLBACK da M1 (20261010120000 + 20261010120100).
-- NÃO fica em supabase/migrations/ (guard de sequência). Executar manualmente,
-- com autorização, na ordem indicada. Testado em banco local (ver doc 12).
--
-- O que este rollback remove: SOMENTE estruturas introduzidas pela M1.
-- Dados de negócio (saldos, lançamentos, vendas, produtos, usuarios, lojas) NÃO são tocados.
-- Única perda: os metadados de empresa/vínculo/módulo criados pela M1. Antes de rodar,
-- confirme que nenhum código passou a depender deles (ver doc 12, §Rollback).
-- ============================================================================
BEGIN;

-- Policies primeiro: dependem das funções fp_* (sem isto, DROP FUNCTION falha)
DROP POLICY IF EXISTS empresa_modulos_historico_leitura_dono ON public.empresa_modulos_historico;
DROP POLICY IF EXISTS empresa_modulos_leitura_dono ON public.empresa_modulos;
DROP POLICY IF EXISTS modulos_catalogo_leitura ON public.modulos_catalogo;
DROP POLICY IF EXISTS usuario_vinculos_leitura ON public.usuario_vinculos;
DROP POLICY IF EXISTS empresas_leitura_vinculo ON public.empresas;

-- módulo
DROP TRIGGER IF EXISTS empresa_modulos_historico_trg ON public.empresa_modulos;
DROP TRIGGER IF EXISTS empresa_modulos_historico_imutavel ON public.empresa_modulos_historico;
DROP FUNCTION IF EXISTS public.ops_definir_modulo_empresa(uuid, text, boolean, text, text);
DROP FUNCTION IF EXISTS public.fp_pode_modulo(uuid, text, text[]);
DROP FUNCTION IF EXISTS public.fp_modulo_ativo(uuid, text);
DROP FUNCTION IF EXISTS public.trg_empresa_modulos_historico();
DROP FUNCTION IF EXISTS public.trg_empresa_modulos_historico_imutavel();
DROP TABLE IF EXISTS public.empresa_modulos_historico;
DROP TABLE IF EXISTS public.empresa_modulos;
DROP TABLE IF EXISTS public.modulos_catalogo;

-- backfill
DROP FUNCTION IF EXISTS public.m1_backfill_empresa_legada();
DROP TABLE IF EXISTS public.m1_backfill_excecoes;
DROP TABLE IF EXISTS public.m1_backfill_controle;

-- helpers e verificação
DROP FUNCTION IF EXISTS public.fp_divergencias_vinculos_legados();
DROP FUNCTION IF EXISTS public.fp_pode_operar_loja(uuid, text[]);
DROP FUNCTION IF EXISTS public.fp_eh_dono_da_empresa(uuid);
DROP FUNCTION IF EXISTS public.fp_empresa_operacional(uuid);
DROP FUNCTION IF EXISTS public.fp_mesma_empresa(uuid, uuid);
DROP FUNCTION IF EXISTS public.fp_empresa_da_loja(uuid);
DROP FUNCTION IF EXISTS public.fp_pode_loja(uuid, text[]);
DROP FUNCTION IF EXISTS public.fp_lojas_permitidas(text[]);
DROP FUNCTION IF EXISTS public.fp_empresas_do_usuario();
DROP FUNCTION IF EXISTS public.fp_eh_plataforma();
DROP FUNCTION IF EXISTS public.fp_legado_admin_global();
DROP FUNCTION IF EXISTS public.fp_usuario_ativo();

-- vínculos, plataforma e empresas
DROP POLICY IF EXISTS usuario_vinculos_leitura ON public.usuario_vinculos;
DROP POLICY IF EXISTS empresas_leitura_vinculo ON public.empresas;
DROP TABLE IF EXISTS public.usuario_vinculos;
DROP TABLE IF EXISTS public.plataforma_admins;

-- lojas: remove só a ligação criada pela M1 (colunas legadas não são tocadas)
ALTER TABLE public.lojas DROP CONSTRAINT IF EXISTS lojas_id_empresa_key;
DROP INDEX IF EXISTS public.lojas_empresa_id_idx;
ALTER TABLE public.lojas DROP COLUMN IF EXISTS empresa_id;

DROP TABLE IF EXISTS public.empresas;

COMMIT;
