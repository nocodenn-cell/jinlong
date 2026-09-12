-- ============================================================================
-- Formas de pagamento: `formas_pagamento` vira a fonte unica das duas telas
-- ============================================================================
-- Achado do diagnostico da Onda 2: Contas a Receber e Contas a Pagar -- as duas
-- listas irmas do financeiro -- ofereciam conjuntos DIFERENTES e INCOMPATIVEIS
-- de forma de pagamento, nenhum deles vindo de cadastro:
--
--   Receber (ReceberTituloModal): DINHEIRO PIX CARTAO_DEBITO CARTAO_CREDITO OUTROS
--   Pagar   (PagamentoModal):     DINHEIRO PIX CARTAO        BOLETO        TRANSF
--
-- Enquanto isso `formas_pagamento` existia -- com `taxa_percentual` e
-- `prazo_compensacao_dias` modelados -- e sem UMA leitura em todo o produto.
--
-- O vocabulario canonico do sistema ja e o de `vendas`, `vendas_pagamentos`,
-- `devolucoes` e `liquidacoes_receber`:
--   DINHEIRO | PIX | CARTAO_DEBITO | CARTAO_CREDITO
-- Quem divergia era Contas a Pagar, e divergia NO BANCO, nao so na tela.
--
-- POR QUE NAO ACHATAR AS DUAS LISTAS NUMA SO:
-- `BOLETO` e `TRANSF` estao EM USO em `contas_pagar_pagamentos`. Sao formas
-- legitimas de pagar fornecedor -- ninguem recebe venda de balcao em boleto.
-- Unificar a FONTE nao e uniformizar a OFERTA: o catalogo passa a ser um so, e
-- cada tela pergunta a ele o que se aplica ao seu lado da operacao. Dai o
-- `escopo`, e nao uma lista unica que ou mutila o AP ou poluiria o PDV.
--
-- TUDO AQUI E ADITIVO:
--   - coluna nova com DEFAULT (nenhuma linha existente invalida);
--   - linhas novas para formas que ja eram usadas;
--   - o CHECK do AP e ALARGADO, nunca restringido -- `CARTAO` continua valido
--     para os historicos, mesmo sem uso hoje.
-- Nenhuma RPC e alterada. O PDV nao e tocado: ele escreve em `vendas` /
-- `vendas_pagamentos`, cujos CHECKs seguem exatamente como estavam.
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Escopo: a que lado da operacao a forma se aplica
-- ---------------------------------------------------------------------------
ALTER TABLE public.formas_pagamento
  ADD COLUMN IF NOT EXISTS escopo text NOT NULL DEFAULT 'AMBOS';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'formas_pagamento_escopo_check'
  ) THEN
    ALTER TABLE public.formas_pagamento
      ADD CONSTRAINT formas_pagamento_escopo_check
      CHECK (escopo IN ('RECEBER', 'PAGAR', 'AMBOS'));
  END IF;
END $$;

COMMENT ON COLUMN public.formas_pagamento.escopo IS
  'RECEBER = entrada de dinheiro (liquidacao de titulo, venda). PAGAR = saida '
  '(pagamento a fornecedor). AMBOS = serve aos dois. Define o que cada tela '
  'oferece, sem duplicar catalogo.';

-- ---------------------------------------------------------------------------
-- 2. Formas que ja eram usadas e nao estavam no cadastro
-- ---------------------------------------------------------------------------
-- Por loja que ja tenha catalogo -- nao inventa catalogo para loja que nao tem.
INSERT INTO public.formas_pagamento (loja_id, codigo, nome, escopo)
SELECT l.loja_id, v.codigo, v.nome, v.escopo
FROM (SELECT DISTINCT loja_id FROM public.formas_pagamento) l
CROSS JOIN (
  VALUES
    ('BOLETO',  'Boleto',        'PAGAR'),
    ('TRANSF',  'Transferência', 'PAGAR'),
    ('OUTROS',  'Outros',        'RECEBER')
) AS v(codigo, nome, escopo)
WHERE NOT EXISTS (
  SELECT 1 FROM public.formas_pagamento f
  WHERE f.loja_id = l.loja_id AND f.codigo = v.codigo
);

-- ---------------------------------------------------------------------------
-- 3. Contas a Pagar passa a aceitar o vocabulario canonico de cartao
-- ---------------------------------------------------------------------------
-- Alargamento puro: os cinco valores antigos continuam validos (ha historico em
-- BOLETO, PIX e TRANSF), e os dois canonicos entram. Sem isso, uma tela que le
-- o catalogo ofereceria CARTAO_DEBITO e o INSERT seria recusado pelo CHECK.
ALTER TABLE public.contas_pagar_pagamentos
  DROP CONSTRAINT IF EXISTS contas_pagar_pagamentos_forma_pagamento_check;

ALTER TABLE public.contas_pagar_pagamentos
  ADD CONSTRAINT contas_pagar_pagamentos_forma_pagamento_check
  CHECK (forma_pagamento IN (
    'DINHEIRO', 'PIX', 'CARTAO', 'CARTAO_DEBITO', 'CARTAO_CREDITO', 'BOLETO', 'TRANSF'
  ));

COMMIT;
