-- Migration 280: DB-01 — CHECK de formato para chave fiscal (NF-e/NFC-e)
-- Data: 2026-07-29
--
-- PROBLEMA
-- --------
-- `documentos_fiscais_pendentes.chave_fiscal` não tinha nenhuma validação de
-- formato, enquanto `vendas.chave_nf` já exigia comprimento 44. Resultado
-- verificado em produção: existe 1 documento com status EMITIDO e
-- chave_fiscal = 'CHAVE-SMOKE-123' (15 caracteres), gravado por smoke test em
-- 2026-04-08. Um documento fiscal marcado como autorizado com chave inválida.
--
-- INVENTÁRIO DE FORMATOS (produção, 2026-07-29)
-- ---------------------------------------------
--   documentos_fiscais_pendentes: 2 linhas
--     - PENDENTE  → chave_fiscal NULL          (legítimo: ainda não emitido)
--     - EMITIDO   → 'CHAVE-SMOKE-123' (15)     (INVÁLIDO — smoke test)
--   vendas.chave_nf ............... 0 linhas preenchidas
--   documentos_fiscais_dlq ........ 0 linhas (não possui coluna de chave)
--
-- ESTRATÉGIA — por que NOT VALID SEM validar
-- ------------------------------------------
-- Ao contrário da migration 279 (onde havia 0 violações e o VALIDATE passou),
-- aqui existe exatamente 1 linha violadora. Validar exigiria apagar ou alterar
-- dado — proibido nesta frente. Portanto:
--
--   * documentos_fiscais_pendentes → ADD ... NOT VALID e NÃO validar.
--     Toda escrita NOVA é bloqueada; a linha histórica permanece intocada até
--     o expurgo do DB-03. `VALIDATE CONSTRAINT` deve ser executado DEPOIS do
--     expurgo — fica registrado como pendência.
--
--   * vendas.chave_nf → 0 linhas, então a constraint entra VALIDADA.
--
-- REFORÇO DE `vendas_chave_nf_check`
-- ----------------------------------
-- A constraint existente era `length(chave_nf) = 44` — aceita 44 caracteres
-- QUAISQUER, inclusive letras. Uma chave de acesso NF-e/NFC-e é, por definição,
-- 44 DÍGITOS numéricos. Substituída por regex. Zero linhas afetadas (nenhuma
-- venda tem chave_nf preenchida), portanto sem risco de quebra.
--
-- ⚠️ CONSEQUÊNCIA DELIBERADA — BLOQUEIO DO PROVIDER MOCK
-- ------------------------------------------------------
-- backend/supabase/functions/fiscal-worker/fiscal-provider-adapter.ts:81 gera:
--
--     const chave = `NFE-MOCK-${doc.venda_id.slice(0, 8)}-${randomHex(4)}`;
--
-- e FISCAL_PROVIDER_TYPE tem default "mock" (index.ts:36). Com esta constraint,
-- uma emissão mock passa a FALHAR no banco em vez de gravar documento EMITIDO
-- com chave falsa. Isso é o comportamento PRETENDIDO: docs/GO_LIVE_BLOCKERS.md
-- classifica exatamente esse cenário (B-6 antes de D-1→D-2→D-3) como "dano
-- irreversível". A constraint é a rede de proteção no nível do banco,
-- independente de erro de configuração de variável de ambiente.
--
-- Efeito colateral aceito: smoke tests fiscais que dependam do provider mock
-- passam a falhar. A correção correta é um provider sandbox que devolva chave
-- de 44 dígitos — NÃO enfraquecer esta constraint.
--
-- FORA DE ESCOPO
-- --------------
-- `importacoes_nfe.chave_acesso` (0 linhas) — é chave de NF-e de ENTRADA, lida
-- de XML de terceiros. Não auditei o fluxo de importação; adicionar constraint
-- sem isso arriscaria rejeitar importação legítima. Registrado como pendência.
--
-- ROLLBACK
-- --------
--   ALTER TABLE public.documentos_fiscais_pendentes DROP CONSTRAINT documentos_fiscais_chave_formato;
--   ALTER TABLE public.vendas DROP CONSTRAINT vendas_chave_nf_check;
--   ALTER TABLE public.vendas ADD CONSTRAINT vendas_chave_nf_check
--     CHECK (chave_nf IS NULL OR length(chave_nf) = 44);

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════════
-- documentos_fiscais_pendentes — NOT VALID (1 linha histórica violadora)
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.documentos_fiscais_pendentes
  ADD CONSTRAINT documentos_fiscais_chave_formato
  CHECK (chave_fiscal IS NULL OR chave_fiscal ~ '^[0-9]{44}$') NOT VALID;

COMMENT ON CONSTRAINT documentos_fiscais_chave_formato ON public.documentos_fiscais_pendentes IS
  'Chave de acesso NF-e/NFC-e: exatamente 44 dígitos numéricos, ou NULL enquanto '
  'não emitido. NOT VALID por causa de 1 linha histórica de smoke test '
  '(CHAVE-SMOKE-123, 2026-04-08). Executar VALIDATE CONSTRAINT após o expurgo '
  'do DB-03. Bloqueia deliberadamente chaves do provider mock (NFE-MOCK-...).';

-- ═══════════════════════════════════════════════════════════════════════════
-- vendas.chave_nf — reforço de length(44) para 44 DÍGITOS. 0 linhas afetadas.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.vendas DROP CONSTRAINT vendas_chave_nf_check;

ALTER TABLE public.vendas
  ADD CONSTRAINT vendas_chave_nf_check
  CHECK (chave_nf IS NULL OR chave_nf ~ '^[0-9]{44}$');

COMMIT;
