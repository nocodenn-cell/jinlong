-- Fiscal: aceita fiscal_error_category = 'CANCELAMENTO' (ADITIVA, só amplia o CHECK).
--
-- PROBLEMA (reproduzido em homologação yvdilcmxyjafnnsfdtam, 2026-10-16, transação abortada sem persistir):
--   `fiscal_cancelar_documento` (20261007161220 / 20261009220000) e `fiscal_marcar_cancelado` (20261007161220)
--   gravam fiscal_error_category = 'CANCELAMENTO', mas o CHECK criado em 065 só aceita
--   DADOS_CADASTRAIS_INVALIDOS, FALHA_COMUNICACAO_PROVIDER, TIMEOUT_RATE_LIMIT, REJEICAO_REGRA_FISCAL, DESCONHECIDO.
--   Resultado: GERENTE ativo da própria loja chama fiscal_cancelar_documento(doc PENDENTE, justificativa válida) →
--     ERROR 23514 new row for relation "documentos_fiscais_pendentes" violates check constraint
--     "documentos_fiscais_pendentes_error_category_check".
--   Todo cancelamento fiscal explícito (UI /gerente/financeiro) e a reconciliação de cancelamento do worker falham.
--   O teste PGlite fiscal-rpc-loja-authz usa tabela-stub sem CHECK e não pegava o defeito.
--
-- CORREÇÃO: recria o CHECK com a mesma lista + 'CANCELAMENTO'. Nenhuma linha existente muda; a validação do CHECK
-- passa porque o conjunto aceito é um superconjunto do anterior. Não altera funções nem grants.
--
-- ROLLBACK (só se nenhuma linha usar a categoria nova; senão o ADD falha e nada muda):
--   ALTER TABLE public.documentos_fiscais_pendentes DROP CONSTRAINT IF EXISTS documentos_fiscais_pendentes_error_category_check;
--   ALTER TABLE public.documentos_fiscais_pendentes ADD CONSTRAINT documentos_fiscais_pendentes_error_category_check
--     CHECK (fiscal_error_category IS NULL OR fiscal_error_category IN ('DADOS_CADASTRAIS_INVALIDOS',
--       'FALHA_COMUNICACAO_PROVIDER', 'TIMEOUT_RATE_LIMIT', 'REJEICAO_REGRA_FISCAL', 'DESCONHECIDO'));

ALTER TABLE public.documentos_fiscais_pendentes
  DROP CONSTRAINT IF EXISTS documentos_fiscais_pendentes_error_category_check;

ALTER TABLE public.documentos_fiscais_pendentes
  ADD CONSTRAINT documentos_fiscais_pendentes_error_category_check
  CHECK (
    fiscal_error_category IS NULL
    OR fiscal_error_category IN (
      'DADOS_CADASTRAIS_INVALIDOS',
      'FALHA_COMUNICACAO_PROVIDER',
      'TIMEOUT_RATE_LIMIT',
      'REJEICAO_REGRA_FISCAL',
      'DESCONHECIDO',
      'CANCELAMENTO'
    )
  );

COMMENT ON CONSTRAINT documentos_fiscais_pendentes_error_category_check ON public.documentos_fiscais_pendentes IS
  'Categorias do worker (065) + CANCELAMENTO (fiscal_cancelar_documento / fiscal_marcar_cancelado).';
