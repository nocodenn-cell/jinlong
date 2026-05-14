-- DLQ fiscal: tabela em public exposta ao PostgREST.
-- Estado pré-migration (Advisor): RLS desligado + grants totais para anon e authenticated
-- (SELECT/INSERT/UPDATE/DELETE/TRUNCATE/etc.) — superfície crítica para chave publicável do projeto.
--
-- Correção: RLS sem policies (nenhum acesso PostgREST para anon/auth) + REVOKE explícito
-- (defesa em profundidade se RLS for alterado no futuro).
-- Acesso operacional: service_role (bypass RLS) / backend / RPC SECURITY DEFINER conforme desenho.

ALTER TABLE public.documentos_fiscais_dlq ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.documentos_fiscais_dlq FROM anon, authenticated;

COMMENT ON TABLE public.documentos_fiscais_dlq IS
  'Fila DLQ fiscal. RLS sem policies públicas; sem GRANT para anon/authenticated. Acesso via service_role ou servidor.';
