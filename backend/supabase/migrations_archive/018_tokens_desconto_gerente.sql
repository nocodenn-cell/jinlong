-- Tabela de auditoria/revogação para tokens temporários de desconto de gerente.
-- Consumida pela Edge Function validar-gerente.

CREATE TABLE IF NOT EXISTS public.tokens_desconto_gerente (
  token text PRIMARY KEY,
  expira_em timestamptz NOT NULL,
  usado boolean NOT NULL DEFAULT false,
  loja_id text NULL,
  criado_por uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.tokens_desconto_gerente ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.tokens_desconto_gerente IS
  'Tokens temporários para autorização de desconto de gerente (auditoria/revogação).';

REVOKE ALL ON TABLE public.tokens_desconto_gerente FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE ON TABLE public.tokens_desconto_gerente TO service_role;

CREATE INDEX IF NOT EXISTS idx_tokens_desconto_gerente_expira_em
  ON public.tokens_desconto_gerente (expira_em);
