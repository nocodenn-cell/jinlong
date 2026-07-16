-- P0 Rollback — reverte 248/252/256. DESTRUTIVO. Só com confirmação + após PITR snapshot.
-- Preferir SEMPRE fix-forward; usar isto apenas se a aplicação falhar ou precisar reverter.
-- Ordem: reverso da aplicação (256 -> 252 -> 248). Wrap manualmente em transação por bloco.

-- ============ 256 rollback ============
DROP FUNCTION IF EXISTS public.pdv_diagnostico_pre_producao();
-- (se houver overload com args, dropar pela assinatura exata via \df pdv_diagnostico_pre_producao)

-- ============ 252 rollback ============
DROP FUNCTION IF EXISTS public.trg_finance_context_via_conta() CASCADE;
DROP FUNCTION IF EXISTS public.trg_finance_context_via_pagamento() CASCADE;
DROP FUNCTION IF EXISTS public.sincronizar_finance_context_venda(uuid) CASCADE;  -- ajustar assinatura via \df
DROP TABLE IF EXISTS public.venda_finance_context;  -- só se aceitável perder o espelho (é derivável)

-- ============ 248 rollback ============
-- 1) Restaurar o check de venda_eventos ao estado PRE-248 (capturado 2026-07-16):
ALTER TABLE public.venda_eventos DROP CONSTRAINT IF EXISTS venda_eventos_event_type_check;
ALTER TABLE public.venda_eventos
  ADD CONSTRAINT venda_eventos_event_type_check
  CHECK ((event_type = ANY (ARRAY['SALE_REGISTERED'::text, 'SALE_CANCELLED'::text])));

-- 2) Restaurar v_kardex_unificado ao estado PRE-248 (captura fiel de produção 2026-07-16):
CREATE OR REPLACE VIEW public.v_kardex_unificado AS
 SELECT 'mel:'::text || m.id::text AS evento_id,
    m.created_at AS ocorrido_em, m.loja_id, m.produto_id, m.quantidade_delta,
    'movimentos_estoque_log'::text AS origem, m.tipo_codigo,
    COALESCE(m.venda_id, m.id) AS referencia_id, m.usuario_id, m.observacao
   FROM movimentos_estoque_log m
UNION ALL
 SELECT (('eb:'::text || eb.venda_id::text) || ':'::text) || eb.produto_id::text AS evento_id,
    eb.created_at AS ocorrido_em, c.loja_id, eb.produto_id,
    (- COALESCE(eb.quantidade, ivsum.qtd, 0::numeric))::numeric(10,3) AS quantidade_delta,
    'estoque_baixas'::text AS origem, 'SAIDA_VENDA'::text AS tipo_codigo,
    eb.venda_id AS referencia_id, v.operador_id AS usuario_id, NULL::text AS observacao
   FROM estoque_baixas eb
     JOIN vendas v ON v.id = eb.venda_id
     JOIN caixas c ON c.id = v.caixa_id
     LEFT JOIN LATERAL ( SELECT sum(iv.quantidade)::numeric(10,3) AS qtd
           FROM itens_venda iv WHERE iv.venda_id = eb.venda_id AND iv.produto_id = eb.produto_id) ivsum ON true
  WHERE NOT (EXISTS ( SELECT 1 FROM movimentos_estoque_log mel
          WHERE mel.venda_id = eb.venda_id AND mel.produto_id = eb.produto_id AND mel.tipo_codigo = 'SAIDA_VENDA'::text))
UNION ALL
 SELECT (('erc:'::text || erc.venda_id::text) || ':'::text) || erc.produto_id::text AS evento_id,
    erc.created_at AS ocorrido_em, c.loja_id, erc.produto_id, erc.quantidade AS quantidade_delta,
    'estoque_reposicoes_cancelamento'::text AS origem, 'ENTRADA_CANCELAMENTO_VENDA'::text AS tipo_codigo,
    erc.venda_id AS referencia_id, vca.operador_id AS usuario_id, vca.motivo AS observacao
   FROM estoque_reposicoes_cancelamento erc
     JOIN vendas v ON v.id = erc.venda_id
     JOIN caixas c ON c.id = v.caixa_id
     LEFT JOIN vendas_canceladas_auditoria vca ON vca.venda_id = erc.venda_id;

-- 3) Remover coluna e função novas:
ALTER TABLE public.devolucoes DROP COLUMN IF EXISTS operacao_id;
DROP FUNCTION IF EXISTS public.devolver_ou_trocar_venda CASCADE;      -- ajustar assinatura via \df
DROP FUNCTION IF EXISTS public.quantidade_devolvida_item_venda CASCADE;
-- cancelar_venda_transacional foi CREATE OR REPLACE em 248: restaurar corpo PRE-248
--   a partir do snapshot pg_get_functiondef capturado no pré-passo (ou via PITR).

-- 4) Índices e tabelas novas (só se vazias):
DROP INDEX IF EXISTS public.uq_devolucoes_operacao_forma;
-- (uq_devolucoes_venda_dinheiro_legacy: 248 recriou; avaliar restaurar uq_devolucoes_venda_dinheiro)
DROP TABLE IF EXISTS public.estoque_reposicoes_devolucao;
DROP TABLE IF EXISTS public.venda_pos_venda_itens;
DROP TABLE IF EXISTS public.venda_pos_venda_operacoes;

-- Após rollback, rodar 01_validation.sql (esperar todos = false) e confirmar fluxo de venda intacto.
