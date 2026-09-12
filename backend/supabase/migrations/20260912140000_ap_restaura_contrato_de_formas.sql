-- ============================================================================
-- Contas a Pagar: restaura o contrato de formas que a Onda 2 quebrou
-- ============================================================================
-- CORRIGE A MIGRATION 20260912120000, desta mesma frente.
--
-- O ERRO: a Onda 2 leu `CARTAO` do Contas a Pagar como "divergencia" do
-- vocabulario de vendas (`CARTAO_DEBITO`/`CARTAO_CREDITO`) e tentou alinhar os
-- dois. Nao era divergencia: e diferenca legitima de dominio.
--
--   - Em VENDA, debito x credito importa: define taxa de adquirente e prazo de
--     compensacao do dinheiro que ENTRA.
--   - Em PAGAMENTO A FORNECEDOR, o dinheiro SAI. Nao ha adquirente, nao ha
--     compensacao a receber. `CARTAO` basta, e e o que a operacao usa.
--
-- Nenhuma regra de negocio, em codigo ou documentacao, autoriza debito/credito
-- para quitar obrigacao de fornecedor. A Onda 2 inventou essa oferta ao tentar
-- uniformizar catalogo -- e uniformizar catalogo nao e uniformizar dominio.
--
-- O ESTRAGO, em duas direcoes:
--   1. a tela passou a oferecer CARTAO_DEBITO/CARTAO_CREDITO, que a RPC
--      `registrar_pagamento_contas_pagar` RECUSA com PAGAMENTO_FORMA_INVALIDA
--      (ela valida o proprio conjunto, independente do CHECK da tabela);
--   2. `CARTAO` -- forma legitima e anterior -- SUMIU da oferta, porque o
--      catalogo nunca teve essa linha.
--
-- A RPC NAO E ALTERADA. Ela ja estava certa; quem estava errada era a UI.
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Desfaz o alargamento indevido do dominio de `contas_pagar_pagamentos`
-- ---------------------------------------------------------------------------
-- A 20260912120000 abriu o CHECK para CARTAO_DEBITO/CARTAO_CREDITO com um unico
-- proposito: deixar passar uma oferta de UI que nao deveria existir. Como a RPC
-- recusa esses valores, o CHECK largo so criava contrato incoerente -- a tabela
-- aceitando o que nenhum caminho de escrita produz.
--
-- Seguranca do estreitamento: verificado que NAO HA nenhuma linha gravada com
-- esses dois valores (o unico teste que os inseriu rodava em transacao com
-- ROLLBACK). O bloco abaixo aborta a migration se isso deixar de ser verdade,
-- em vez de destruir historico silenciosamente.
DO $$
DECLARE
  v_n bigint;
BEGIN
  SELECT count(*) INTO v_n
  FROM public.contas_pagar_pagamentos
  WHERE forma_pagamento IN ('CARTAO_DEBITO', 'CARTAO_CREDITO');

  IF v_n > 0 THEN
    RAISE EXCEPTION
      'ABORTADO: % pagamento(s) gravados com CARTAO_DEBITO/CARTAO_CREDITO. '
      'Estreitar o CHECK invalidaria historico. Migrar esses registros para '
      'CARTAO antes de aplicar esta migration.', v_n;
  END IF;
END $$;

ALTER TABLE public.contas_pagar_pagamentos
  DROP CONSTRAINT IF EXISTS contas_pagar_pagamentos_forma_pagamento_check;

-- Volta ao dominio original -- o mesmo que a RPC valida internamente.
ALTER TABLE public.contas_pagar_pagamentos
  ADD CONSTRAINT contas_pagar_pagamentos_forma_pagamento_check
  CHECK (forma_pagamento IN ('DINHEIRO', 'PIX', 'CARTAO', 'BOLETO', 'TRANSF'));

-- ---------------------------------------------------------------------------
-- 2. Devolve `CARTAO` ao catalogo -- a forma que a Onda 2 fez sumir da tela
-- ---------------------------------------------------------------------------
INSERT INTO public.formas_pagamento (loja_id, codigo, nome, escopo)
SELECT l.loja_id, 'CARTAO', 'Cartão', 'PAGAR'
FROM (SELECT DISTINCT loja_id FROM public.formas_pagamento) l
WHERE NOT EXISTS (
  SELECT 1 FROM public.formas_pagamento f
  WHERE f.loja_id = l.loja_id AND f.codigo = 'CARTAO'
);

-- ---------------------------------------------------------------------------
-- 3. Debito e credito passam a valer so para RECEBER
-- ---------------------------------------------------------------------------
-- Eram 'AMBOS' desde a 20260912120000, e era esse 'AMBOS' que empurrava as duas
-- formas para a tela de pagamento. Continuam intactas para Contas a Receber,
-- onde a RPC `registrar_liquidacao_receber` de fato as aceita.
UPDATE public.formas_pagamento
   SET escopo = 'RECEBER'
 WHERE codigo IN ('CARTAO_DEBITO', 'CARTAO_CREDITO')
   AND escopo <> 'RECEBER';

-- ---------------------------------------------------------------------------
-- 4. O catalogo passa a espelhar exatamente as duas RPCs
-- ---------------------------------------------------------------------------
--   PAGAR   (registrar_pagamento_contas_pagar): DINHEIRO PIX CARTAO BOLETO TRANSF
--   RECEBER (registrar_liquidacao_receber):     DINHEIRO PIX CARTAO_DEBITO
--                                               CARTAO_CREDITO OUTROS
--
-- `escopo` permanece -- e agora faz o trabalho certo. Sem ele, um catalogo
-- compartilhado nao consegue servir dois contratos legitimamente diferentes:
-- ou o AP passa a oferecer OUTROS, ou o AR passa a oferecer BOLETO. A coluna
-- nao ficou sem uso depois da correcao; ela e justamente o que mantem cada
-- tela dentro do seu proprio contrato.
DO $$
DECLARE
  v_pagar text;
  v_receber text;
BEGIN
  SELECT string_agg(codigo, ' ' ORDER BY codigo) INTO v_pagar
  FROM public.formas_pagamento
  WHERE ativo AND escopo IN ('PAGAR', 'AMBOS');

  SELECT string_agg(codigo, ' ' ORDER BY codigo) INTO v_receber
  FROM public.formas_pagamento
  WHERE ativo AND escopo IN ('RECEBER', 'AMBOS');

  IF v_pagar IS DISTINCT FROM 'BOLETO CARTAO DINHEIRO PIX TRANSF' THEN
    RAISE EXCEPTION 'CATALOGO PAGAR fora do contrato da RPC: %', v_pagar;
  END IF;

  IF v_receber IS DISTINCT FROM 'CARTAO_CREDITO CARTAO_DEBITO DINHEIRO OUTROS PIX' THEN
    RAISE EXCEPTION 'CATALOGO RECEBER fora do contrato da RPC: %', v_receber;
  END IF;

  RAISE NOTICE 'OK: catalogo espelha as duas RPCs';
END $$;

COMMIT;
