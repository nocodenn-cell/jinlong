-- 255 — Baseline de GRANT em tabelas/views para authenticated e service_role.
--
-- Causa raiz: nenhuma migration deste repositório jamais concedeu GRANT
-- SELECT/INSERT/UPDATE/DELETE em tabelas-núcleo (vendas, estoque, clientes,
-- itens_venda, contas_receber, remessas etc.) para `authenticated` — o modelo
-- de segurança sempre dependeu de RLS como único gate, assumindo que o GRANT
-- de base já existia. A migration 219 (revoke de DML de `anon`) documenta
-- isso explicitamente no comentário: "authenticated/service_role intactos" —
-- ou seja, althenticated já tinha esses grants por algum caminho fora das
-- migrations.
--
-- Confirmado com o usuário (2026-07-03): mesmo padrão de drift já visto nas
-- 11 políticas RLS fantasma (224) e no índice idx_perfis_loja_id (223) —
-- produção real recebeu esse GRANT baseline fora do controle de migrations
-- (provavelmente configuração inicial via dashboard/setup do projeto), e
-- nunca foi capturado em arquivo. Um `db reset` local (CI, do zero) nunca
-- recebe esse baseline, e por isso `test:rls-scope` nunca chegou a rodar até
-- o fim antes — todas as execuções anteriores paravam antes, nos bugs de
-- colisão de sequência de migrations já corrigidos nesta mesma leva.
--
-- Risco/idempotência: GRANT redundante é no-op em produção (papel já tem o
-- privilégio). RLS continua sendo o gate real de linha — este GRANT só
-- habilita o acesso à tabela; toda política existente permanece em vigor.

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated, service_role;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO authenticated, service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE ON SEQUENCES TO authenticated, service_role;
