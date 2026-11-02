-- Seed mínimo para os testes SQL de NF-e em ambiente local descartável (Supabase CLI).
-- Espelha os ids da FIXTURE-S1 existentes em homologação (dados de teste, nunca produção).
-- Idempotente: pode ser executado várias vezes. Não usar em produção.
--
-- Empresa 1 (e1): loja A (a1) com GERENTE (…0002)
-- Empresa 2 (e2): loja C (c1) com GERENTE (…0005)

BEGIN;

INSERT INTO auth.users (id) VALUES
  ('f5100000-0000-4000-8000-000000000002'),
  ('f5100000-0000-4000-8000-000000000005')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.empresas (id, nome, status) VALUES
  ('f5100000-0000-4000-8000-0000000000e1', 'FIXTURE-S1 Empresa 1', 'ATIVA'),
  ('f5100000-0000-4000-8000-0000000000e2', 'FIXTURE-S1 Empresa 2', 'ATIVA')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.lojas (id, nome, codigo, ativo, empresa_id, numero_serie_nfce, numero_serie_nfe) VALUES
  ('f5100000-0000-4000-8000-0000000000a1', 'FIXTURE-S1 Loja A', 'FS1-A', true, 'f5100000-0000-4000-8000-0000000000e1', 1, 1),
  ('f5100000-0000-4000-8000-0000000000c1', 'FIXTURE-S1 Loja C', 'FS1-C', true, 'f5100000-0000-4000-8000-0000000000e2', 1, 1)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.usuarios (id, nome, perfil, ativo, loja_id) VALUES
  ('f5100000-0000-4000-8000-000000000002', 'FIXTURE-S1 Gerente A', 'GERENTE', true, 'f5100000-0000-4000-8000-0000000000a1'),
  ('f5100000-0000-4000-8000-000000000005', 'FIXTURE-S1 Gerente C', 'GERENTE', true, 'f5100000-0000-4000-8000-0000000000c1')
ON CONFLICT (id) DO NOTHING;

COMMIT;

-- Produto de teste na loja A (usado por scripts que precisam de um produto ativo).
BEGIN;
INSERT INTO public.categorias (id, nome, empresa_id) VALUES
  ('f5100000-0000-4000-8000-0000000000c0', 'FIXTURE-S1 Categoria', 'f5100000-0000-4000-8000-0000000000e1')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.produtos (id, nome, categoria_id, preco_varejo, preco_custo, origem, tem_nf, ativo, status_publicacao, loja_id, codigo_barras)
VALUES ('f5100000-0000-4000-8000-0000000000f1', 'FIXTURE-S1 Produto A', 'f5100000-0000-4000-8000-0000000000c0', 30, 10, 'brasil_nf', true, true, 'PUBLICADO', 'f5100000-0000-4000-8000-0000000000a1', '7898000000011')
ON CONFLICT (id) DO NOTHING;
COMMIT;
