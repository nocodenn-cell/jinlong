-- Migration 276: Hardening — remove 'PROMOCAO' residual do CHECK de itens_venda.tipo_preco
-- Data: 2026-07-25
--
-- Achado da auditoria pré-BL-2 (docs/BL2_AUDITORIA_PRE_BL2_SUPABASE.md §2.3):
-- o CHECK constraint de itens_venda.tipo_preco já permitia o valor 'PROMOCAO'
-- neste banco, sem qualquer migration local documentando essa alteração —
-- resquício de uma tentativa anterior (abandonada) de seguir a Opção A do
-- modelo de promoção. A decisão arquitetural aprovada (docs/BL2_MODELO_FINAL_APROVADO.md)
-- rejeita explicitamente tipo_preco='PROMOCAO': promoção é modelada como
-- regra aplicada (itens_venda.promocao_regra_id), nunca como tipo de preço.
--
-- Motivo do fechamento (não apenas teórico):
--   1. Verificado: 0 linhas em itens_venda usam 'PROMOCAO' hoje (56 linhas,
--      todas 'VAREJO') — fechamento não invalida nenhum dado existente.
--   2. Verificado: shared-core/src/caixa/mapRegrasPreco.ts (único ponto que
--      converte regras_preco real para o tipo consumido por PricingService)
--      nunca produz tipo:'PROMOCAO' — mapeia só para VAREJO/ATACADO. O
--      caminho que produziria esse valor a partir de dado real está morto,
--      inclusive no PDV local (única exceção arquitetural que usa
--      PricingService offline).
--   3. Verificado: as RPCs legadas finalizar_venda_transacional_canonica_v2/v3
--      ainda têm EXECUTE concedido a anon/authenticated/PUBLIC e tratam
--      tipo_preco IN ('MANUAL','PROMOCAO') com a mesma validação frouxa
--      (bypassa revalidação de preço). Sem este fechamento, seria hoje
--      tecnicamente possível inserir um item com tipo_preco='PROMOCAO' via
--      chamada direta a essas RPCs, sem auditoria de regra e sem a
--      revalidação de preço que v4/BL-2 exige.
--
-- Fecha essa porta residual na camada de tabela — proteção válida
-- independente de qual RPC (ou bypass futuro) tente escrever em itens_venda.
--
-- Validado (aplicado e testado em kbabmewnahysfvlybiak antes deste commit):
--   - Venda real com promoção via BL-2 (regra_aplicada_id) continua CONCLUIDA
--     normalmente após o fechamento.
--   - INSERT direto com tipo_preco='PROMOCAO' (preço sem desconto, isolando
--     do trigger de limite manual) rejeitado com:
--     "violates check constraint itens_venda_tipo_preco_check".

BEGIN;

ALTER TABLE public.itens_venda DROP CONSTRAINT itens_venda_tipo_preco_check;
ALTER TABLE public.itens_venda ADD CONSTRAINT itens_venda_tipo_preco_check
  CHECK (tipo_preco = ANY (ARRAY['VAREJO'::text, 'ATACADO'::text, 'MANUAL'::text]));

NOTIFY pgrst, 'reload schema';

COMMIT;
