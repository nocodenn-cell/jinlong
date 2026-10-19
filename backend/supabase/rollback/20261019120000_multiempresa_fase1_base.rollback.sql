-- Rollback de 20261019120000_multiempresa_fase1_base.sql
-- Ordem inversa. Não toca em dados pré-existentes (lojas/usuarios ficam como antes; só a coluna nova sai).
-- ATENÇÃO: se já houver empresa ≠ Empresa 1 provisionada, este rollback apaga empresas/vínculos/dispositivos
-- e lojas criadas por plataforma_provisionar_empresa continuam existindo (sem empresa_id). Avalie antes.
BEGIN;

DROP FUNCTION IF EXISTS public.plataforma_provisionar_empresa(jsonb, uuid);
DROP FUNCTION IF EXISTS public.ativar_dispositivo_pdv(text, text, text);
DROP FUNCTION IF EXISTS public.plataforma_registrar_codigo_ativacao_pdv(uuid, text, int, uuid);
DROP TABLE IF EXISTS public.pdv_codigos_ativacao;
DROP TABLE IF EXISTS public.pdv_dispositivos;

DROP POLICY IF EXISTS tenant_guard ON public.itens_venda;
DROP POLICY IF EXISTS tenant_guard ON public.contas_receber;
DROP POLICY IF EXISTS tenant_guard ON public.fornecedores;

DROP TRIGGER IF EXISTS trg_usuarios_sync_vinculo ON public.usuarios;
DROP FUNCTION IF EXISTS internal.tg_usuarios_sync_vinculo();
DROP FUNCTION IF EXISTS internal.fp_sync_vinculo_legado(uuid);

DROP TABLE IF EXISTS public.plataforma_admins;
DROP TABLE IF EXISTS public.usuario_vinculos;
DROP POLICY IF EXISTS empresas_select_vinculo ON public.empresas;

DROP FUNCTION IF EXISTS public.fp_pode_loja(uuid, text[]);
DROP FUNCTION IF EXISTS public.fp_lojas_permitidas(text[]);
DROP FUNCTION IF EXISTS public.fp_empresas_do_usuario_como_dono();
DROP FUNCTION IF EXISTS public.fp_empresas_do_usuario();
DROP FUNCTION IF EXISTS public.fp_eh_plataforma();
DROP FUNCTION IF EXISTS public.fp_usuario_ativo();
DROP FUNCTION IF EXISTS public.fp_empresa_da_loja(uuid);
DROP FUNCTION IF EXISTS public.fp_mesma_empresa(uuid, uuid);
DROP FUNCTION IF EXISTS public.fp_empresa_operacional(uuid);

ALTER TABLE public.lojas DROP CONSTRAINT IF EXISTS lojas_empresa_codigo_uniq;
ALTER TABLE public.lojas DROP CONSTRAINT IF EXISTS lojas_id_empresa_uniq;
DROP INDEX IF EXISTS public.lojas_empresa_id_idx;
ALTER TABLE public.lojas DROP COLUMN IF EXISTS empresa_id;
DROP TABLE IF EXISTS public.empresas;

DELETE FROM supabase_migrations.schema_migrations WHERE version = '20261019120000';

COMMIT;
