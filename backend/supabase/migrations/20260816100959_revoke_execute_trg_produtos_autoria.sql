-- Revoga EXECUTE público/authenticated nas 2 trigger functions da migração
-- produtos_autoria_criado_atualizado_por.
--
-- ACHADO (advisor de segurança, 2026-08-16): `registrar_criado_por_produto`
-- e `registrar_atualizado_por_produto` são SECURITY DEFINER e, por padrão do
-- Postgres (GRANT EXECUTE ON FUNCTION ... TO PUBLIC implícito em CREATE
-- FUNCTION), ficaram executáveis via RPC (`/rest/v1/rpc/...`) por `anon` e
-- `authenticated`. Confirmado por teste real que isso NÃO é explorável —
-- funções que RETURNS trigger não podem ser chamadas fora do mecanismo de
-- trigger (Postgres recusa com erro `0A000: trigger functions can only be
-- called as triggers`) — mas a concessão é desnecessária e não seguimos o
-- mínimo privilégio. Revogar aqui NÃO quebra as triggers: o disparo por
-- INSERT/UPDATE não passa pelo grant de EXECUTE do chamador (mecanismo
-- interno do trigger manager), só uma chamada direta via SQL/RPC precisaria
-- do grant — e essa chamada já falha por si só.
--
-- Padrão consistente com as migrações 218/221 (revoke_anon/public_execute_
-- security_definer) já usadas neste schema para outras funções SECURITY
-- DEFINER. Diferente daquelas (que mantêm `authenticated`, pois são RPCs de
-- negócio chamadas pelo app), aqui revogamos também `authenticated`: estas
-- duas funções não são RPCs de negócio, são exclusivamente triggers — nenhum
-- código de aplicação deveria chamá-las diretamente.

REVOKE EXECUTE ON FUNCTION public.registrar_criado_por_produto() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.registrar_atualizado_por_produto() FROM PUBLIC, anon, authenticated;
