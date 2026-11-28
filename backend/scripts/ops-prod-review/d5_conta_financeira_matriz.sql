-- ##### NÃO EXECUTAR ##### Decisão do dono (2026-11-19): não criar contas financeiras fictícias.
-- Este arquivo é só registro de revisão. Execução exige autorização específica na janela de implantação.
-- RASCUNHO PARA REVISÃO — NÃO EXECUTAR SEM AUTORIZAÇÃO (escrita em produção).
-- Objetivo (D5, 20261107110000): cadastrar conta financeira ativa para PIX, CARTAO_DEBITO e
-- CARTAO_CREDITO na loja matriz, antes do deploy da D5. Sem isso, novas vendas PIX/cartão
-- nessa loja falham com PAGAMENTO_SEM_CONTA_FINANCEIRA.
--
-- Pré-check (somente leitura, feito em 2026-11-19): a matriz não tem nenhuma conta ligada a
-- PIX/cartão; há 2 pagamentos PIX e 1 CARTAO_CREDITO já existentes sem conta.
--
-- Itens a confirmar antes de rodar:
--   [1] criado_por: usuário responsável pela conta. Sugestão: 'c839e9ee-12ec-474a-bea6-3a89dc94857e'
--       (GERENTE 'Gerente', não é usuário de teste). Confirmar com o dono.
--   [2] nome e tipo da conta: 'Conta matriz' / 'BANCO' é placeholder. Trocar pelo nome real
--       (banco ou maquininha) antes de rodar.
--   [3] data_inicial: 2026-06-12 é a primeira venda da matriz. Não pode ser posterior a
--       movimentos que a conta vá receber.
--   [4] Os usuários de teste 'Gerente E2E' e 'Dono E2E' estão ativos na matriz em produção.
--       Fora deste script; tratar em item separado.
--
-- Execução: começa com ROLLBACK. Trocar para COMMIT só após revisão e autorização.

BEGIN;

WITH c AS (
  INSERT INTO public.contas_financeiras (loja_id, nome, tipo, ativo, data_inicial, criado_por)
  VALUES (
    'a0000001-0000-4000-8000-000000000001',
    'Conta matriz (PLACEHOLDER: trocar pelo nome real)',
    'BANCO',
    true,
    DATE '2026-06-12',
    'c839e9ee-12ec-474a-bea6-3a89dc94857e'
  )
  RETURNING id
)
INSERT INTO public.financeiro_contas_forma (loja_id, forma_pagamento, conta_financeira_id)
SELECT 'a0000001-0000-4000-8000-000000000001', f.forma, c.id
FROM c CROSS JOIN unnest(ARRAY['PIX','CARTAO_DEBITO','CARTAO_CREDITO']) AS f(forma);

-- Conferência antes do COMMIT: deve listar as 3 formas ligadas à mesma conta.
SELECT f.forma_pagamento, cf.nome, cf.ativo, cf.data_inicial
FROM public.financeiro_contas_forma f
JOIN public.contas_financeiras cf ON cf.id = f.conta_financeira_id
WHERE f.loja_id = 'a0000001-0000-4000-8000-000000000001'
ORDER BY 1;

ROLLBACK; -- trocar por COMMIT somente após aprovação explícita
