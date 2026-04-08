-- ============================================================
-- SMOKE A.2 — Fechamento de caixa com divergência (limite R$ 5)
-- Valida: migration 039 + trilha de auditoria + invariante pós-regra
-- Rodar no SQL Editor (homologação) após `db push` da migration 039.
-- ============================================================

-- 1) Estrutura: colunas de auditoria existem
SELECT
  COUNT(*) FILTER (WHERE COLUMN_NAME = 'fechamento_diferenca') AS tem_fechamento_diferenca,
  COUNT(*) FILTER (WHERE COLUMN_NAME = 'fechamento_observacao') AS tem_fechamento_observacao
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = 'public'
  AND TABLE_NAME = 'caixas'
  AND COLUMN_NAME IN ('fechamento_diferenca', 'fechamento_observacao');
-- Aceite: tem_fechamento_diferenca = 1 AND tem_fechamento_observacao = 1

-- 2) Invariante (após a regra A.2 estar ativa no app): divergência > 5 sem motivo válido não deve existir
SELECT
  ID,
  STATUS,
  FECHAMENTO_DIFERENCA,
  FECHAMENTO_OBSERVACAO,
  DATA_FECHAMENTO
FROM PUBLIC.CAIXAS
WHERE STATUS = 'FECHADO'
  AND FECHAMENTO_DIFERENCA IS NOT NULL
  AND ABS(FECHAMENTO_DIFERENCA) > 5
  AND (
    FECHAMENTO_OBSERVACAO IS NULL
    OR LENGTH(TRIM(FECHAMENTO_OBSERVACAO)) < 5
  )
ORDER BY DATA_FECHAMENTO DESC NULLS LAST
LIMIT 20;
-- Aceite: 0 linhas (dados novos); linhas antigas pré-regra podem aparecer até saneamento

-- 3) Amostra dos últimos fechamentos com divergência (visão rápida)
SELECT
  ID,
  VALOR_INICIAL,
  VALOR_FECHAMENTO,
  FECHAMENTO_DIFERENCA,
  LEFT(TRIM(COALESCE(FECHAMENTO_OBSERVACAO, '')), 80) AS OBS_PREVIEW,
  DATA_FECHAMENTO
FROM PUBLIC.CAIXAS
WHERE STATUS = 'FECHADO'
  AND FECHAMENTO_DIFERENCA IS NOT NULL
ORDER BY DATA_FECHAMENTO DESC NULLS LAST
LIMIT 10;
