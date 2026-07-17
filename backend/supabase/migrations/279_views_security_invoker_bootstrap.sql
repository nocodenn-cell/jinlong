-- 279_views_security_invoker_bootstrap.sql
--
-- FRENTE 4 (Database Integrity Hardening) — fecha bypass de RLS em views no
-- bootstrap do zero.
--
-- ACHADO (evidência de produção, projeto jinlong kbabmewnahysfvlybiak, 2026-07-17)
-- ==============================================================================
-- Produção tem 7 views, TODAS já com security_invoker habilitado — está segura.
-- Porém 3 delas são criadas no repositório SEM security_invoker (migrations
-- anteriores ao padrão introduzido pela 040):
--   • v_vendas_dia                  — criada em 001_schema_inicial.sql:329
--   • v_top_produtos                — criada em 001_schema_inicial.sql:342
--   • v_venda_consistencia_anomalias — criada em 244_consistencia_vendas_auditoria.sql
--
-- Ou seja: um `db reset` do zero recria essas 3 views SEM security_invoker. Como
-- o owner é `postgres`, elas rodariam com privilégio do dono (definer) e
-- **contornariam a RLS das tabelas base** (`vendas`, `itens_venda`) — um caminho
-- paralelo de leitura ignorando o isolamento por loja. Produção foi corrigida
-- direto no banco (drift); o repositório nunca foi. Esta migration reconcilia.
--
-- SEM MUDANÇA EM PRODUÇÃO: as 3 já têm security_invoker lá, então o ALTER é
-- idempotente/no-op no remoto. O efeito real é no bootstrap (instalações novas).
--
-- USO: nenhuma das 3 é consultada pelo app (0 ocorrências de `.from('<view>')` em
-- pdv-importados/pdv-local/functions). v_vendas_dia e v_top_produtos são órfãs
-- (substituídas pelas RPCs relatorio_vendas_por_dia_periodo /
-- relatorio_top_produtos_periodo; 0 dependências no banco — pg_depend vazio) e
-- são candidatas a DROP — ver docs/DATABASE_INTEGRITY_DECISIONS.md DEC-06 (gate:
-- confirmar ausência de consumidor externo de BI antes de remover).
-- v_venda_consistencia_anomalias é view de monitoramento/auditoria — mantida.
--
-- ROLLBACK: ALTER VIEW ... SET (security_invoker = false) em cada uma.

BEGIN;

ALTER VIEW public.v_vendas_dia SET (security_invoker = true);
ALTER VIEW public.v_top_produtos SET (security_invoker = true);
ALTER VIEW public.v_venda_consistencia_anomalias SET (security_invoker = true);

COMMIT;

-- ─── VERIFICAÇÃO (rodar após aplicar) ───────────────────────────────────────
-- Deve retornar 0 (nenhuma view public sem security_invoker):
--   SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
--   WHERE n.nspname='public' AND c.relkind='v'
--     AND COALESCE((SELECT option_value FROM pg_options_to_table(c.reloptions)
--                   WHERE option_name='security_invoker'),'false') NOT IN ('true','on');
