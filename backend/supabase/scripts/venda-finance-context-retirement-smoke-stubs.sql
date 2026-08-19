-- Schema mínimo para testar isoladamente a migration histórica 252 e a tombstone.
-- Não representa um reset completo do FastProduct.
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS public.lojas (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
CREATE TABLE IF NOT EXISTS public.clientes (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
CREATE TABLE IF NOT EXISTS public.caixas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  loja_id uuid REFERENCES public.lojas(id)
);
CREATE TABLE IF NOT EXISTS public.vendas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  forma_pagamento text,
  caixa_id uuid REFERENCES public.caixas(id),
  status text
);
CREATE TABLE IF NOT EXISTS public.vendas_pagamentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venda_id uuid REFERENCES public.vendas(id),
  forma_pagamento text,
  valor numeric
);
CREATE TABLE IF NOT EXISTS public.contas_receber (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venda_id uuid REFERENCES public.vendas(id),
  cliente_id uuid REFERENCES public.clientes(id),
  created_at timestamptz DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.usuarios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  loja_id uuid REFERENCES public.lojas(id),
  perfil text
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN;
  END IF;
END
$$;

CREATE SCHEMA IF NOT EXISTS auth;
DO $$
BEGIN
  IF to_regprocedure('auth.uid()') IS NULL THEN
    EXECUTE 'CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS ''SELECT NULL::uuid''';
  END IF;
END
$$;
