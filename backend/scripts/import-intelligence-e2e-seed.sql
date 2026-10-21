-- Seed LOCAL e FICTÍCIO para o E2E do Import Intelligence (nunca aplicar fora do Postgres local).
-- 1) auth.uid()/role() lendo request.jwt.claims (PostgREST ≥ 10) além do legado claim.sub
-- 2) empresas A (módulo ON), B (módulo ON, concorrente), C (sem módulo)
\set ON_ERROR_STOP on
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $f$
  SELECT coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''),
                  nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid $f$;
CREATE OR REPLACE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $f$
  SELECT coalesce(nullif(current_setting('request.jwt.claim.role', true), ''),
                  nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', 'anon') $f$;
CREATE OR REPLACE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $f$
  SELECT coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $f$;
GRANT anon, authenticated, service_role TO postgres;

DO $$
DECLARE
  ea uuid := 'a0000000-0000-4000-8000-00000000000a'; eb uuid := 'b0000000-0000-4000-8000-00000000000b'; ec uuid := 'c0000000-0000-4000-8000-00000000000c';
  la uuid := 'a1000000-0000-4000-8000-0000000000a1'; lb uuid := 'b1000000-0000-4000-8000-0000000000b1'; lc uuid := 'c1000000-0000-4000-8000-0000000000c1';
  pw text := extensions.crypt('Demo-Importacoes-2026!', extensions.gen_salt('bf'));
  r record;
BEGIN
  INSERT INTO public.empresas (id, nome) VALUES (ea, 'Importadora Demo A (fictícia)'), (eb, 'Concorrente Demo B (fictícia)'), (ec, 'Loja Demo C sem módulo (fictícia)') ON CONFLICT DO NOTHING;
  INSERT INTO public.lojas (id, nome, codigo, empresa_id) VALUES (la, 'Demo A — Matriz', 'DEMO-IMP-A1', ea), (lb, 'Demo B — Loja', 'DEMO-IMP-B1', eb), (lc, 'Demo C — Loja', 'DEMO-IMP-C1', ec) ON CONFLICT DO NOTHING;
  FOR r IN SELECT * FROM (VALUES
      ('d0000000-0000-4000-8000-0000000000a1'::uuid, 'dono.a@demo.test', 'Dono A (fictício)', 'DONO', la),
      ('d0000000-0000-4000-8000-0000000000a2'::uuid, 'gerente.a@demo.test', 'Gerente A (fictício)', 'GERENTE', la),
      ('d0000000-0000-4000-8000-0000000000a3'::uuid, 'operador.a@demo.test', 'Operador A (fictício)', 'OPERADOR', la),
      ('d0000000-0000-4000-8000-0000000000b1'::uuid, 'dono.b@demo.test', 'Dono B (fictício)', 'DONO', lb),
      ('d0000000-0000-4000-8000-0000000000c1'::uuid, 'dono.c@demo.test', 'Dono C (fictício)', 'DONO', lc)) AS v(id, email, nome, perfil, loja)
  LOOP
    INSERT INTO auth.users (id, email, aud, role, encrypted_password, email_confirmed_at, raw_app_meta_data)
    VALUES (r.id, r.email, 'authenticated', 'authenticated', pw, now(), '{"provider":"email"}') ON CONFLICT DO NOTHING;
    INSERT INTO public.usuarios (id, nome, perfil, loja_id, ativo) VALUES (r.id, r.nome, r.perfil, r.loja, true) ON CONFLICT DO NOTHING;
  END LOOP;
  PERFORM public.ops_definir_modulo_empresa(ea, 'IMPORT_INTELLIGENCE', true, 'demo local', 'E2E local com dados fictícios', 'e2e-seed');
  PERFORM public.ops_definir_modulo_empresa(eb, 'IMPORT_INTELLIGENCE', true, 'demo local', 'E2E local com dados fictícios', 'e2e-seed');
END $$;
-- ERP fictício da loja A (só para provar ausência de efeito: estoque/preço não mudam)
DO $$
DECLARE c uuid; p uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.produtos WHERE codigo_barras = '7890000099001') THEN
    INSERT INTO public.categorias (nome, empresa_id) VALUES ('Demo importados', 'a0000000-0000-4000-8000-00000000000a') RETURNING id INTO c;
    INSERT INTO public.produtos (codigo_barras, nome, categoria_id, preco_varejo, preco_custo, origem, tem_nf, ativo, status_publicacao, loja_id)
      VALUES ('7890000099001', 'Chaleira demo (ERP)', c, 99.90, 40, 'brasil_nf', true, true, 'PUBLICADO', 'a1000000-0000-4000-8000-0000000000a1') RETURNING id INTO p;
    INSERT INTO public.estoque (produto_id, loja_id, quantidade_atual, estoque_minimo, version) VALUES (p, 'a1000000-0000-4000-8000-0000000000a1', 12, 0, 0);
  END IF;
END $$;
