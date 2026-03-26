-- PDV local: permitir caixas criados pela Edge Function (sync-outbox) sem operador
-- autenticado no app web — o mesmo padrão de vendas em 002_mvp_desconto_gerente.sql.

ALTER TABLE public.caixas
  ALTER COLUMN operador_id DROP NOT NULL;

COMMENT ON COLUMN public.caixas.operador_id IS
  'Pode ser NULL quando o caixa veio apenas do PDV local (sync) até haver login de operador.';
