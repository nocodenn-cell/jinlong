-- Usado para o teste sec02/sec03 em banco descartável (postgres:16). Não é o schema completo do Supabase.
-- Bootstrap MÍNIMO para o teste de leads em banco descartável (não é o schema completo do Supabase).
-- Reproduz só o que as migrations 150000-170000 e os testes usam: roles, schema internal, tabela commercial_leads
-- sem grants para anon/authenticated (como após 20261104120000) e o service_role com acesso ao schema.
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
CREATE SCHEMA internal;
GRANT USAGE ON SCHEMA internal TO service_role;

CREATE TABLE public.commercial_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  protocol text NOT NULL,
  product text NOT NULL,
  name text NOT NULL,
  store text NOT NULL,
  contact text NOT NULL,
  channel text NOT NULL,
  locale text NOT NULL,
  idioma text,
  city text,
  segment text,
  wechat text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  origem text,
  status text DEFAULT 'novo'
);
ALTER TABLE public.commercial_leads ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.commercial_leads FROM PUBLIC, anon, authenticated;

-- No Supabase real, service_role tem privilégios de tabela (e ignora RLS) por padrão; reproduzimos isso aqui.
GRANT ALL ON public.commercial_leads TO service_role;
GRANT ALL ON public.commercial_lead_rate_limit TO service_role;
GRANT ALL ON public.commercial_lead_rate_config TO service_role;
ALTER ROLE service_role BYPASSRLS;
