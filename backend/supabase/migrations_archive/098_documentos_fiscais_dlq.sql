-- DLQ de documentos fiscais (dead letter). Deve existir antes de 098_documentos_fiscais_dlq_enable_rls.sql.
-- IF NOT EXISTS: ambientes que já criaram a tabela manualmente apenas pulam o CREATE.

CREATE TABLE IF NOT EXISTS public.documentos_fiscais_dlq (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  documento_id uuid NOT NULL REFERENCES public.documentos_fiscais_pendentes (id) ON DELETE CASCADE,
  venda_id uuid NOT NULL REFERENCES public.vendas (id) ON DELETE CASCADE,
  tipo_doc text NOT NULL,
  payload jsonb,
  correlation_id uuid,
  motivo text,
  criado_em timestamptz DEFAULT now(),
  original_status text,
  original_tentativas integer
);

CREATE INDEX IF NOT EXISTS idx_documentos_fiscais_dlq_documento_id
  ON public.documentos_fiscais_dlq (documento_id);

CREATE INDEX IF NOT EXISTS idx_documentos_fiscais_dlq_venda_id
  ON public.documentos_fiscais_dlq (venda_id);

COMMENT ON TABLE public.documentos_fiscais_dlq IS
  'Dead letter queue de emissão fiscal; ver migration 098 para RLS e REVOKE em anon/authenticated.';
