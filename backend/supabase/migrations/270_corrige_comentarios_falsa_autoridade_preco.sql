-- Migration 270: corrige comentários de FALSA AUTORIDADE no cálculo de preço.
--
-- Motivação (Sprint de Estabilização do Domínio — correção de documentação):
--   Os comentários da migration 122 afirmam que "vendas com token de gerente
--   validado também isentam seus itens do limite por item". Isso NÃO representa
--   o domínio no caminho canônico:
--     * O flag session.gerente_token_validado é setado APENAS pela função legada
--       public.finalizar_venda_transacional (não-canônica), que o app não chama.
--     * O caller canônico finalizar_venda_transacional_canonica_v4 nunca seta o
--       flag → o teto de 15% por item é INCONDICIONAL (exceto tipo_preco ATACADO).
--   Auditoria histórica confirmou: nenhuma outra migration seta o flag.
--
-- Esta migration é ESTRITAMENTE de comentário (COMMENT ON). NÃO altera lógica,
-- não altera o corpo de nenhuma função/trigger e não muda comportamento.
-- A remoção da branch morta do trigger e da função legada é follow-up dedicado
-- (exige validação em DB real) — ver docs/regras-negocio/MATRIZ_PRECO_FINAL.md §9.
--
-- Contrato oficial do preço final: docs/regras-negocio/MATRIZ_PRECO_FINAL.md

COMMENT ON COLUMN public.pdv_config.max_desconto_manual_item_percentual IS
  'Percentual máximo de desconto por item para tipo_preco VAREJO ou MANUAL. '
  'Itens ATACADO são isentos (precificação por tabela de atacado). '
  'Teto RÍGIDO no caminho canônico (v4): o desconto de gerente NÃO amplia este '
  'limite por item — a autoridade do gerente é apenas sobre o TOTAL líquido '
  '(pdv_config.max_desconto_gerente_percentual). Padrão: 15%. '
  'Contrato: docs/regras-negocio/MATRIZ_PRECO_FINAL.md §4.';

COMMENT ON FUNCTION public.trg_fn_itens_venda_limite_desconto() IS
  'Trigger BEFORE INSERT/UPDATE em itens_venda: rejeita desconto por item acima do '
  'limite em pdv_config.max_desconto_manual_item_percentual (padrão 15%). '
  'Isenta tipo_preco ATACADO. A branch session.gerente_token_validado é LEGADA: só '
  'a função não-canônica public.finalizar_venda_transacional a ativa, e o app não a '
  'chama; no caller canônico (v4) o teto é incondicional. '
  'Contrato: docs/regras-negocio/MATRIZ_PRECO_FINAL.md §4/§9.';
