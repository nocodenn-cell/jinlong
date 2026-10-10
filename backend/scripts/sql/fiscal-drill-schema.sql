CREATE SCHEMA IF NOT EXISTS auth;
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
CREATE OR REPLACE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('request.jwt.claim.role', true), '')
$$;
CREATE ROLE anon NOINHERIT;
CREATE ROLE authenticator SUPERUSER NOINHERIT;
CREATE ROLE authenticated NOINHERIT;
CREATE ROLE service_role NOINHERIT;
GRANT anon, authenticated, service_role TO authenticator;
CREATE TABLE lojas(id uuid PRIMARY KEY);
CREATE TABLE usuarios(id uuid PRIMARY KEY, perfil text, loja_id uuid, ativo boolean);
CREATE TABLE caixas(id uuid PRIMARY KEY, loja_id uuid);
CREATE TABLE vendas(id uuid PRIMARY KEY, caixa_id uuid, operador_id uuid, tipo_venda text);
CREATE TABLE documentos_fiscais_pendentes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), venda_id uuid, tipo_doc text, status text, payload jsonb,
  ultimo_erro text, tentativas integer NOT NULL DEFAULT 0, proxima_tentativa_em timestamptz,
  fiscal_error_code text, fiscal_error_category text, fiscal_action_hint text,
  fiscal_retryable boolean, fiscal_next_step_url text, fiscal_error_payload jsonb,
  deleted_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX idx_doc_fiscal_unique_venda_tipo
  ON documentos_fiscais_pendentes (venda_id, tipo_doc) WHERE status <> 'CANCELADO';
CREATE TABLE documentos_fiscais_dlq(documento_id uuid, venda_id uuid);
CREATE TABLE documentos_fiscais_eventos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), documento_id uuid, evento_tipo text,
  status_antes text, status_depois text, actor_user_id uuid, actor_role text,
  origem_acao text, payload jsonb
);
GRANT INSERT ON public.documentos_fiscais_pendentes TO authenticated, anon;
