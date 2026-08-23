-- ============================================================================
-- Seed de desenvolvimento local — fixture determinística das suítes financeiras
--
-- Referenciado por `supabase/config.toml` (`db.seed.sql_paths`). Roda ao final
-- de `supabase db reset` e do primeiro `supabase start`.
--
-- ⛔ SOMENTE AMBIENTE LOCAL. Cria usuários em `auth.users` sem senha utilizável
--    e uma loja sintética. Nunca executar contra produção ou Preview.
--
-- POR QUE ESTE ARQUIVO EXISTE
--   As suítes `test:financial` e `test:financial-concurrency` exigem uma loja
--   que satisfaça, ao mesmo tempo:
--     - produto com `preco_varejo > 0`, `preco_custo` não-nulo e margem 50–100%
--       (o GATE 21 de `financial-adversarial-gates` congela regra por margem);
--     - saldo de estoque positivo (a v4 baixa estoque);
--     - caixa ABERTO na mesma loja;
--     - formas de pagamento cadastradas — a migration `302_f1_05` só semeou as
--       lojas que existiam naquele momento, então lojas criadas depois ficam
--       sem nenhuma forma válida e a v4 rejeita com FORMA_PAGAMENTO_INVALIDA;
--     - usuários ativos de perfil GERENTE, OPERADOR e DONO na loja.
--
--   Sem este seed nenhuma loja satisfaz o conjunto: os produtos demo ficam na
--   Matriz (migration 027) e `test:rls-scope` cria usuários e caixas numa loja
--   separada, sem produtos. O gate ficava vermelho por falta de fixture, não
--   por defeito de schema.
--
-- IDEMPOTENTE: UUIDs fixos + ON CONFLICT. Reexecutar não duplica nada.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Loja da fixture
-- ---------------------------------------------------------------------------
INSERT INTO public.lojas (id, nome, ativo)
VALUES ('f1000000-0000-4000-8000-000000000001', 'Loja Fixture Financeiro', true)
ON CONFLICT (id) DO UPDATE SET nome = EXCLUDED.nome, ativo = true;

-- ---------------------------------------------------------------------------
-- Formas de pagamento da loja da fixture
--
-- A `302_f1_05` semeou apenas as lojas existentes à época. Como esta loja
-- nasce no seed (depois das migrations), o cadastro precisa ser explícito.
-- ---------------------------------------------------------------------------
INSERT INTO public.formas_pagamento (loja_id, codigo, nome)
VALUES
  ('f1000000-0000-4000-8000-000000000001', 'DINHEIRO',       'Dinheiro'),
  ('f1000000-0000-4000-8000-000000000001', 'PIX',            'Pix'),
  ('f1000000-0000-4000-8000-000000000001', 'CARTAO_DEBITO',  'Cartão de Débito'),
  ('f1000000-0000-4000-8000-000000000001', 'CARTAO_CREDITO', 'Cartão de Crédito')
ON CONFLICT (loja_id, codigo) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Usuários — GERENTE, OPERADOR e DONO ativos na loja
--
-- `public.usuarios.id` referencia `auth.users(id)`, então a identidade precisa
-- existir primeiro. Sem `encrypted_password`: estes usuários são fixtures de
-- consulta, não servem para login.
-- ---------------------------------------------------------------------------
INSERT INTO auth.users (id, email)
VALUES
  ('f1000000-0000-4000-8000-0000000000d1', 'fixture_dono@local.test'),
  ('f1000000-0000-4000-8000-0000000000e1', 'fixture_gerente@local.test'),
  ('f1000000-0000-4000-8000-0000000000f1', 'fixture_operador@local.test')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.usuarios (id, nome, perfil, loja_id, ativo)
VALUES
  ('f1000000-0000-4000-8000-0000000000d1', 'Fixture Dono',     'DONO',     'f1000000-0000-4000-8000-000000000001', true),
  ('f1000000-0000-4000-8000-0000000000e1', 'Fixture Gerente',  'GERENTE',  'f1000000-0000-4000-8000-000000000001', true),
  ('f1000000-0000-4000-8000-0000000000f1', 'Fixture Operador', 'OPERADOR', 'f1000000-0000-4000-8000-000000000001', true)
ON CONFLICT (id) DO UPDATE
  SET perfil = EXCLUDED.perfil, loja_id = EXCLUDED.loja_id, ativo = true;

-- ---------------------------------------------------------------------------
-- Produto — margem 60% (25,00 sobre custo 10,00)
--
-- A margem precisa cair na faixa 50–100 para o GATE 21 conseguir provar o
-- congelamento histórico da regra por margem.
-- ---------------------------------------------------------------------------
INSERT INTO public.produtos (
  id, nome, preco_varejo, preco_custo, preco_custo_medio,
  origem, loja_id, ativo
)
VALUES (
  'f1000000-0000-4000-8000-0000000000a1', 'Produto Fixture Financeiro',
  25.00, 10.00, 10.00, 'brasil_nf',
  'f1000000-0000-4000-8000-000000000001', true
)
ON CONFLICT (id) DO UPDATE
  SET preco_varejo = EXCLUDED.preco_varejo,
      preco_custo = EXCLUDED.preco_custo,
      preco_custo_medio = EXCLUDED.preco_custo_medio,
      ativo = true;

-- Segundo produto: o GATE 20 de `financial-adversarial-gates` exige dois
-- produtos distintos na mesma loja para provar o rateio entre itens.
-- Margem também em 60% (40,00 sobre custo 16,00).
INSERT INTO public.produtos (
  id, nome, preco_varejo, preco_custo, preco_custo_medio,
  origem, loja_id, ativo
)
VALUES (
  'f1000000-0000-4000-8000-0000000000a2', 'Produto Fixture Financeiro II',
  40.00, 16.00, 16.00, 'brasil_nf',
  'f1000000-0000-4000-8000-000000000001', true
)
ON CONFLICT (id) DO UPDATE
  SET preco_varejo = EXCLUDED.preco_varejo,
      preco_custo = EXCLUDED.preco_custo,
      preco_custo_medio = EXCLUDED.preco_custo_medio,
      ativo = true;

INSERT INTO public.estoque (produto_id, loja_id, quantidade_atual)
VALUES
  ('f1000000-0000-4000-8000-0000000000a1', 'f1000000-0000-4000-8000-000000000001', 100000),
  ('f1000000-0000-4000-8000-0000000000a2', 'f1000000-0000-4000-8000-000000000001', 100000)
ON CONFLICT (loja_id, produto_id) DO UPDATE
  SET quantidade_atual = EXCLUDED.quantidade_atual;

-- ---------------------------------------------------------------------------
-- Caixa aberto, operado pelo OPERADOR da fixture
-- ---------------------------------------------------------------------------
INSERT INTO public.caixas (id, loja_id, operador_id, status, valor_inicial, saldo_atual)
VALUES (
  'f1000000-0000-4000-8000-0000000000c1',
  'f1000000-0000-4000-8000-000000000001',
  'f1000000-0000-4000-8000-0000000000f1',
  'ABERTO', 0, 0
)
ON CONFLICT (id) DO UPDATE
  SET status = 'ABERTO', operador_id = EXCLUDED.operador_id;
