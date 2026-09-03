-- Fase C / Onda C2.6 (prontidão Focus NFe) — modelagem mínima de icms_origem.
--
-- Gate C2.5 (investigação tributária, docs/audits/
-- AUDITORIA_PRONTIDAO_FOCUS_NFE_FASE_C_GATE_C2_5_TRIBUTACAO.md) confirmou por
-- inspeção direta de `\d public.produtos` que `icms_origem` — o código de
-- origem ICMS (tag `orig`, valores '0'..'8') que a Focus exige em todo item
-- de NFC-e/NF-e — está AUSENTE do schema inteiro. Não é dúvida de dado, é
-- fato de schema. Autorizado pelo usuário como onda isolada, escopo mínimo.
--
-- NÃO É `produtos.origem`: `origem` (migration original de cadastro) é um
-- conceito OPERACIONAL — canal de aquisição do produto dentro do Jinlong
-- (`china_manual` | `brasil_nf` | `brasil_sem_nf`) — usado para decisões de
-- compra/reposição, sem relação 1:1 segura com o código fiscal ICMS de
-- origem (a Focus distingue nuances — ex. nacional com/sem >40% conteúdo
-- importado, estrangeira com/sem similar nacional — que `origem` não
-- carrega). O usuário proibiu explicitamente derivar `icms_origem` de
-- `origem` nesta onda. Esta migration NÃO toca `produtos.origem` — nenhuma
-- linha, constraint, default ou comentário daquela coluna é alterado.
--
-- SEM DEFAULT (decisão deliberada, não omissão): ao contrário de
-- csosn/cst_pis/cst_cofins (que têm defaults seguros para Simples Nacional/
-- isento), não existe valor universal seguro para icms_origem — o Jinlong
-- vende produtos importados, então '0' (nacional) como default seria
-- especificamente errado. Produtos legados ficam NULL até classificação
-- humana — mesmo padrão de `ncm`/`cest` (colunas nullable sem default,
-- migration 210).
--
-- FAIL-CLOSED: o bloqueio de icms_origem ausente acontece no boundary
-- fiscal (fiscal_focus_dto.ts, mapSnapshotItemToFocus — Onda C2.6, mesmo
-- arquivo/mecanismo já usado para NCM ausente), nunca aqui. Este ALTER TABLE
-- não bloqueia cadastro, estoque, venda ou PDV — produto com icms_origem
-- NULL continua vendável normalmente enquanto emissão fiscal automática
-- não está habilitada (FISCAL_PROVIDER_TYPE ainda não é 'focus' em
-- produção nesta missão).
--
-- Nenhuma migration de dados: nenhum UPDATE roda sobre produtos existentes.
-- Índice parcial `idx_produtos_sem_icms_origem` só para consulta futura
-- (painel gerente listar pendentes de classificação) — não implementado
-- nesta onda além do índice em si (mesmo padrão de idx_produtos_sem_ncm).
--
-- ROLLBACK: DROP INDEX IF EXISTS idx_produtos_sem_icms_origem;
--           ALTER TABLE produtos DROP COLUMN IF EXISTS icms_origem;
-- (aditiva; nenhuma linha de produção é criada ou alterada por esta migration).

BEGIN;

ALTER TABLE produtos
  ADD COLUMN IF NOT EXISTS icms_origem TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_produto_icms_origem_valido' AND conrelid = 'produtos'::regclass
  ) THEN
    ALTER TABLE produtos
      ADD CONSTRAINT chk_produto_icms_origem_valido
      CHECK (icms_origem IS NULL OR icms_origem IN ('0','1','2','3','4','5','6','7','8'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_produtos_sem_icms_origem
  ON produtos (id)
  WHERE icms_origem IS NULL AND ativo = true;

COMMENT ON COLUMN produtos.icms_origem IS
  'Código de origem ICMS exigido pela Focus NFe (tag orig), valores ''0''..''8''. '
  'NULLABLE, SEM DEFAULT — produtos legados ficam NULL até classificação humana. '
  'NÃO confundir com produtos.origem (conceito operacional de canal de aquisição '
  'china_manual/brasil_nf/brasil_sem_nf, sem correspondência 1:1 segura com este '
  'campo). Onda C2.6 (2026-09-02, prontidão Focus NFe) — não deriva de origem, '
  'não tem default, bloqueio de ausência fica no boundary fiscal (fiscal-worker), '
  'nunca aqui.';

NOTIFY pgrst, 'reload schema';

DO $verify$
DECLARE
  v_col_exists boolean;
  v_col_default text;
  v_ok boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'produtos' AND column_name = 'icms_origem'
  ) INTO v_col_exists;
  IF NOT v_col_exists THEN
    RAISE EXCEPTION 'ICMS_ORIGEM_COLUNA_AUSENTE';
  END IF;

  SELECT column_default INTO v_col_default
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'produtos' AND column_name = 'icms_origem';
  IF v_col_default IS NOT NULL THEN
    RAISE EXCEPTION 'ICMS_ORIGEM_TEM_DEFAULT_INESPERADO: %', v_col_default;
  END IF;

  -- Prova viva: CHECK aceita NULL e cada valor 0..8, rejeita valor inválido.
  BEGIN
    EXECUTE 'CREATE TEMP TABLE _t_icms_origem_ok (icms_origem TEXT) ON COMMIT DROP';
    EXECUTE 'ALTER TABLE _t_icms_origem_ok ADD CONSTRAINT _chk CHECK (icms_origem IS NULL OR icms_origem IN (''0'',''1'',''2'',''3'',''4'',''5'',''6'',''7'',''8''))';
    INSERT INTO _t_icms_origem_ok VALUES (NULL), ('0'), ('1'), ('2'), ('3'), ('4'), ('5'), ('6'), ('7'), ('8');
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'ICMS_ORIGEM_CHECK_REJEITA_VALOR_VALIDO: %', SQLERRM;
  END;

  v_ok := false;
  BEGIN
    EXECUTE 'INSERT INTO _t_icms_origem_ok VALUES (''9'')';
  EXCEPTION WHEN check_violation THEN
    v_ok := true;
  END;
  IF NOT v_ok THEN
    RAISE EXCEPTION 'ICMS_ORIGEM_CHECK_NAO_REJEITA_VALOR_INVALIDO';
  END IF;

  -- produtos.origem permanece intocado: mesmo CHECK/default de antes desta migration.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'produtos_origem_check' AND conrelid = 'produtos'::regclass
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.check_constraints cc
    JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = cc.constraint_name
    WHERE ccu.table_name = 'produtos' AND ccu.column_name = 'origem'
  ) THEN
    RAISE EXCEPTION 'PRODUTOS_ORIGEM_CONSTRAINT_AUSENTE_INESPERADO';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND tablename = 'produtos' AND indexname = 'idx_produtos_sem_icms_origem'
  ) THEN
    RAISE EXCEPTION 'ICMS_ORIGEM_INDICE_AUSENTE';
  END IF;
END
$verify$;

COMMIT;
