CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
CREATE SCHEMA auth; CREATE SCHEMA internal;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $$;
CREATE TABLE public.empresas (id uuid PRIMARY KEY);
CREATE TABLE public.lojas (id uuid PRIMARY KEY, empresa_id uuid REFERENCES public.empresas(id), UNIQUE (id, empresa_id));
CREATE TABLE public.usuarios (id uuid PRIMARY KEY, loja_id uuid, perfil text CHECK (perfil IN ('OPERADOR','GERENTE','DONO','ADMIN')), ativo boolean DEFAULT true);
CREATE TABLE public.usuario_vinculos (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), usuario_id uuid, empresa_id uuid, loja_id uuid, papel text, ativo boolean DEFAULT true, created_by uuid);
CREATE UNIQUE INDEX ON public.usuario_vinculos (usuario_id, empresa_id, papel, COALESCE(loja_id, '00000000-0000-0000-0000-000000000000'::uuid));
CREATE TABLE public.tokens_desconto_gerente (token text PRIMARY KEY, loja_id text, criado_por uuid, usado boolean, expira_em timestamptz);
