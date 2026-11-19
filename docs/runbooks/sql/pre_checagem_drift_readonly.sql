-- Pré-checagem SOMENTE LEITURA para a reconciliação do drift (ver RECONCILIACAO_DRIFT_MIGRATIONS.md).
-- Não contém DDL nem DML. Rodar em homolog antes de qualquer migration.

-- 1. Presença no histórico remoto
select version, name from supabase_migrations.schema_migrations
where version in ('20261028100000','20261028101000','20261028110000','20261028120100','20261028121000',
                  '20261028122000','20261029155000','20261030100000','20261030120000','20261030130000','20261030140000')
order by version;

-- 2. Objetos de segurança (ordem 1, 3, 5, 8)
select 'token_gerente_fora_da_loja tem ramo ADMIN' as checagem,
       (select pg_get_functiondef(p.oid) ilike '%ADMIN%' from pg_proc p join pg_namespace n on n.oid=p.pronamespace
         where n.nspname='internal' and p.proname='token_gerente_fora_da_loja' limit 1) as resultado;
select 'trigger trg_fp_bloquear_perfil_admin' as checagem, count(*) from pg_trigger where tgname='trg_fp_bloquear_perfil_admin';
select 'tabela usuarios_admin_corte_backup' as checagem, count(*) from information_schema.tables
 where table_schema='internal' and table_name='usuarios_admin_corte_backup';
select 'usuarios com perfil ADMIN (ativos)' as checagem, count(*) from public.usuarios where perfil='ADMIN' and ativo;

-- 3. Objetos de estoque e NF-e (ordem 7, 9, 10, 11)
select 'movimentos_estoque_log.transferencia_id' as checagem, count(*) from information_schema.columns
 where table_schema='public' and table_name='movimentos_estoque_log' and column_name='transferencia_id';
select 'índice único de duplicata (contas a pagar)' as checagem, count(*) from pg_indexes
 where schemaname='public' and indexdef ilike '%numero_duplicata%';
select 'colunas de precisão NF-e' as checagem, count(*) from information_schema.columns
 where table_schema='public' and table_name='importacoes_nfe_itens'
   and column_name in ('fator_conversao','valor_total_documento','valor_unitario_documento',
                       'quantidade_comercial_documento','unidade_comercial');
