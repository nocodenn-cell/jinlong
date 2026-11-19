-- Seed determinístico do Golden Flow E2E (JL-GO-LIVE-01). Entidades 100% fictícias, IDs fixos.
-- Não cria caixa aberto: a abertura é um passo do spec (ensureCaixaAberto), exercido pela tela.
-- :operador_id é substituído por provision.mjs pelo id do usuário criado no GoTrue da stack E2E.
BEGIN;

INSERT INTO public.empresas (id, nome) VALUES
  ('ee000001-0000-4000-8000-000000000001', 'E2E Empresa Ficticia')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.lojas (id, empresa_id, nome, codigo, ativo) VALUES
  ('ee000002-0000-4000-8000-000000000001', 'ee000001-0000-4000-8000-000000000001', 'E2E Loja Ficticia', 'E2E01', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.categorias (id, nome, empresa_id) VALUES
  ('ee000003-0000-4000-8000-000000000001', 'E2E Mercearia', 'ee000001-0000-4000-8000-000000000001')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.produtos (id, codigo_barras, nome, categoria_id, preco_varejo, origem, tem_nf, ativo, loja_id, unidade_medida) VALUES
  ('ee000004-0000-4000-8000-000000000001', '7898512340003', 'E2E Produto Demo', 'ee000003-0000-4000-8000-000000000001', 10.00, 'brasil_nf', false, true, 'ee000002-0000-4000-8000-000000000001', 'UN'),
  ('ee000004-0000-4000-8000-000000000002', '7898512340010', 'E2E Produto Fracionado', 'ee000003-0000-4000-8000-000000000001', 40.00, 'brasil_nf', false, true, 'ee000002-0000-4000-8000-000000000001', 'KG')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.estoque (produto_id, loja_id, quantidade_atual, estoque_minimo) VALUES
  ('ee000004-0000-4000-8000-000000000001', 'ee000002-0000-4000-8000-000000000001', 500, 0),
  ('ee000004-0000-4000-8000-000000000002', 'ee000002-0000-4000-8000-000000000001', 100, 0)
ON CONFLICT (produto_id, loja_id) DO UPDATE SET quantidade_atual = EXCLUDED.quantidade_atual, estoque_minimo = EXCLUDED.estoque_minimo;

INSERT INTO public.formas_pagamento (loja_id, codigo, nome, ativo) VALUES
  ('ee000002-0000-4000-8000-000000000001', 'DINHEIRO', 'DINHEIRO', true),
  ('ee000002-0000-4000-8000-000000000001', 'PIX', 'PIX', true),
  ('ee000002-0000-4000-8000-000000000001', 'CARTAO_CREDITO', 'CARTAO_CREDITO', true),
  ('ee000002-0000-4000-8000-000000000001', 'CARTAO_DEBITO', 'CARTAO_DEBITO', true)
ON CONFLICT (loja_id, codigo) DO UPDATE SET ativo = true;

-- Configuração do PDV da empresa fictícia (linha da empresa, loja_id nulo), necessária à resolução de config.
INSERT INTO public.pdv_config (id, empresa_id, loja_id, gerente_id)
SELECT (SELECT COALESCE(MAX(id), 0) + 1 FROM public.pdv_config), 'ee000001-0000-4000-8000-000000000001', NULL, 'gerente-e2e-1'
WHERE NOT EXISTS (SELECT 1 FROM public.pdv_config WHERE empresa_id = 'ee000001-0000-4000-8000-000000000001' AND loja_id IS NULL);

INSERT INTO public.usuarios (id, nome, perfil, ativo, loja_id) VALUES
  (:operador_id, 'E2E Operador', 'OPERADOR', true, 'ee000002-0000-4000-8000-000000000001')
ON CONFLICT (id) DO UPDATE SET perfil = 'OPERADOR', ativo = true, loja_id = EXCLUDED.loja_id;

COMMIT;
