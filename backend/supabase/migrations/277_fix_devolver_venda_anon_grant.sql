-- Fecha o drift de GRANT descoberto ao aplicar 248 em produção (jinlong, 2026-07-17):
-- Supabase re-concede EXECUTE a `anon` no momento da criação da função (default
-- privileges no schema public), o que o `REVOKE ALL ... FROM PUBLIC` da 248 não
-- alcança (anon é grantee direto, não herda via PUBLIC nesta configuração).
--
-- O corpo da 248 já declara a intenção inequívoca: só authenticated/service_role
-- devem executar devolver_ou_trocar_venda. anon com EXECUTE nesta RPC é um risco
-- real — a função é SECURITY DEFINER e tem fallback `COALESCE(auth.uid(),
-- p_operador_id)`; sem REVOKE, um chamador anônimo poderia tentar se passar por
-- um operador informando p_operador_id diretamente (a checagem de perfil/loja
-- ainda barra o abuso, mas a superfície não deveria existir para anon).
--
-- Mesmo padrão de drift já documentado para finalizar_venda_transacional_canonica_v4
-- em backend/supabase/reconciliation/P0_DB_DRIFT_RECONCILIATION.md §8.0.
--
-- Idempotente: REVOKE em role sem o privilégio é no-op.

REVOKE EXECUTE ON FUNCTION public.devolver_ou_trocar_venda(
  uuid, text, text, text, jsonb, numeric, text, uuid, uuid
) FROM anon;

-- Segundo achado do mesmo smoke: quantidade_devolvida_item_venda (helper de leitura
-- da 248) nunca teve GRANT/REVOKE explícito no arquivo original — ficou com o
-- privilégio padrão do schema, que neste projeto inclui PUBLIC e anon. A função é
-- SECURITY DEFINER, ignora RLS, e não faz nenhuma checagem de loja/perfil internamente
-- (ao contrário da RPC principal) — qualquer papel com EXECUTE pode consultar
-- quantidade devolvida de qualquer item_venda_id do sistema. Restringe ao mesmo
-- padrão da RPC principal: authenticated + service_role, sem PUBLIC/anon.
REVOKE ALL ON FUNCTION public.quantidade_devolvida_item_venda(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.quantidade_devolvida_item_venda(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.quantidade_devolvida_item_venda(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.quantidade_devolvida_item_venda(uuid) TO service_role;
