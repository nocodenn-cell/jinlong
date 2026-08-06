-- Migration 306: D-2 — máquina de estados de documentos fiscais (aplica o conteúdo do 092)
-- Data: 2026-08-06
-- Referência: docs/GO_LIVE_BLOCKERS.md §3 (D-2)
-- Ordem obrigatória do fiscal: D-1 → D-2 → D-3 → B-6 → B-5. Esta é a segunda (D-1 = migration 305).
--
-- PROBLEMA (confirmado no banco vivo em 2026-08-06)
-- ------------------------------------------------
-- A migration `092_fiscal_state_machine.sql` está versionada no repositório desde
-- sempre, mas NUNCA foi aplicada em produção. Verificado por catálogo:
--   • information_schema.columns  → `ultima_transicao_em` e `transicao_origem`
--                                    AUSENTES em documentos_fiscais_pendentes.
--   • pg_trigger                  → apenas tr_documentos_fiscais_eventos_ai/_au.
--                                    tr_documentos_fiscais_estado_bi/_bu AUSENTES.
--
-- Efeito real: nenhuma transição de status é validada. `EMITIDO → PENDENTE` é
-- aceita hoje — isto é, um documento fiscal já autorizado pode voltar para a
-- fila e ser reemitido, gerando segunda emissão do mesmo documento.
--
-- POR QUE UMA MIGRATION NOVA EM VEZ DE APLICAR A 092
-- --------------------------------------------------
-- Registrar a versão `092` agora, em 2026-08, mentiria sobre a ordem real de
-- aplicação e agravaria o achado de ordenação de migrations já registrado
-- (GO_LIVE_CERTIFICATION_REPORT §5). O conteúdo é idêntico ao da 092 — que
-- permanece no repositório como registro histórico — e todo ele é idempotente
-- (`ADD COLUMN IF NOT EXISTS`, `CREATE OR REPLACE FUNCTION`, `DROP TRIGGER IF
-- EXISTS` + `CREATE TRIGGER`), então aplicar as duas em sequência num rebuild do
-- zero é seguro e converge para o mesmo estado.
--
-- COMPATIBILIDADE COM OS ESCRITORES EXISTENTES (verificada antes de aplicar)
-- -------------------------------------------------------------------------
--   fiscal_enfileirar_documento_venda → INSERT sempre com status 'PENDENTE' ✓ (BI)
--       O ramo `ON CONFLICT DO UPDATE` só alcança linhas não-CANCELADO (o índice
--       único é parcial: `WHERE status <> 'CANCELADO'`), logo a única transição
--       que ele produz é ERRO → PENDENTE, permitida.
--   fiscal_claim_documentos          → PENDENTE|ERRO → EM_PROCESSAMENTO ✓
--   fiscal_marcar_emitido            → EM_PROCESSAMENTO → EMITIDO ✓
--   fiscal_marcar_erro[_normalizado] → EM_PROCESSAMENTO → ERRO ✓
--   fiscal_reprocessar_documento(uuid) → ERRO|PENDENTE → PENDENTE ✓
--
-- Dados existentes: 2 linhas (1 EMITIDO, 1 PENDENTE), nenhuma em
-- EM_PROCESSAMENTO. Os triggers são BEFORE e só atuam em escrita nova — nenhum
-- backfill necessário, nenhuma linha existente é tocada.
--
-- ROLLBACK
-- --------
--   DROP TRIGGER IF EXISTS tr_documentos_fiscais_estado_bu ON public.documentos_fiscais_pendentes;
--   DROP TRIGGER IF EXISTS tr_documentos_fiscais_estado_bi ON public.documentos_fiscais_pendentes;
-- (as colunas podem permanecer: são aditivas e nullable)

BEGIN;

ALTER TABLE public.documentos_fiscais_pendentes
  ADD COLUMN IF NOT EXISTS ultima_transicao_em timestamptz,
  ADD COLUMN IF NOT EXISTS transicao_origem text;

COMMENT ON COLUMN public.documentos_fiscais_pendentes.ultima_transicao_em IS
  'Instante da última mudança de status (gravado por tr_documentos_fiscais_estado_bu).';
COMMENT ON COLUMN public.documentos_fiscais_pendentes.transicao_origem IS
  'Transição que produziu o status atual, no formato ANTES>DEPOIS.';

-- ═══════════════════════════════════════════════════════════════════════════
-- INSERT: documento fiscal só nasce PENDENTE
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.tg_documentos_fiscais_estado_bi()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status IS NULL OR NEW.status <> 'PENDENTE' THEN
    RAISE EXCEPTION 'FISCAL_INSERT_STATUS_INVALIDO:%', COALESCE(NEW.status, 'NULL');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_documentos_fiscais_estado_bi ON public.documentos_fiscais_pendentes;
CREATE TRIGGER tr_documentos_fiscais_estado_bi
  BEFORE INSERT ON public.documentos_fiscais_pendentes
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_documentos_fiscais_estado_bi();

-- ═══════════════════════════════════════════════════════════════════════════
-- UPDATE: transições permitidas + carimbo de auditoria
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.tg_documentos_fiscais_estado_bu()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.status IS NOT DISTINCT FROM NEW.status THEN
    RETURN NEW;
  END IF;

  IF NEW.status = 'CANCELADO' THEN
    NEW.ultima_transicao_em := now();
    NEW.transicao_origem := concat(OLD.status, '>CANCELADO');
    RETURN NEW;
  END IF;

  IF NOT (
    (OLD.status = 'PENDENTE' AND NEW.status IN ('EM_PROCESSAMENTO', 'ERRO', 'CANCELADO'))
    OR (OLD.status = 'ERRO' AND NEW.status IN ('PENDENTE', 'EM_PROCESSAMENTO', 'CANCELADO'))
    OR (OLD.status = 'EM_PROCESSAMENTO' AND NEW.status IN ('EMITIDO', 'ERRO', 'PENDENTE', 'CANCELADO'))
    OR (OLD.status = 'EMITIDO' AND NEW.status IN ('CANCELADO'))
  ) THEN
    RAISE EXCEPTION 'FISCAL_TRANSICAO_INVALIDA:%→%', OLD.status, NEW.status
      USING ERRCODE = 'check_violation';
  END IF;

  NEW.ultima_transicao_em := now();
  NEW.transicao_origem := concat(OLD.status, '>', NEW.status);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_documentos_fiscais_estado_bu ON public.documentos_fiscais_pendentes;
CREATE TRIGGER tr_documentos_fiscais_estado_bu
  BEFORE UPDATE ON public.documentos_fiscais_pendentes
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_documentos_fiscais_estado_bu();

-- ═══════════════════════════════════════════════════════════════════════════
-- Verificação no efeito — a regra que motivou o D-2 tem que estar viva
-- ═══════════════════════════════════════════════════════════════════════════
DO $verify$
DECLARE
  v_venda_id uuid;
  v_doc_id uuid;
  v_bloqueou boolean := false;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='documentos_fiscais_pendentes'
      AND column_name IN ('ultima_transicao_em','transicao_origem')
    HAVING count(*) = 2
  ) THEN
    RAISE EXCEPTION 'MIG306_COLUNAS_AUSENTES';
  END IF;

  IF (SELECT count(*) FROM pg_trigger
      WHERE tgrelid='public.documentos_fiscais_pendentes'::regclass
        AND tgname IN ('tr_documentos_fiscais_estado_bi','tr_documentos_fiscais_estado_bu')) <> 2 THEN
    RAISE EXCEPTION 'MIG306_TRIGGERS_AUSENTES';
  END IF;

  -- Prova viva de EMITIDO → PENDENTE bloqueado, sem sujar dados:
  -- usa uma venda existente, cria doc, leva a EMITIDO pelo caminho legal,
  -- tenta a transição proibida e desfaz tudo com ROLLBACK TO SAVEPOINT.
  SELECT v.id INTO v_venda_id
  FROM public.vendas v
  WHERE NOT EXISTS (
    SELECT 1 FROM public.documentos_fiscais_pendentes d WHERE d.venda_id = v.id
  )
  LIMIT 1;

  IF v_venda_id IS NULL THEN
    RAISE NOTICE '306 — sem vendas para prova viva; verificação estrutural OK';
  ELSE
    BEGIN
      INSERT INTO public.documentos_fiscais_pendentes (venda_id, tipo_doc, status, payload)
      VALUES (v_venda_id, 'NFE', 'PENDENTE', '{"probe":"mig306"}'::jsonb)
      RETURNING id INTO v_doc_id;

      UPDATE public.documentos_fiscais_pendentes SET status='EM_PROCESSAMENTO' WHERE id=v_doc_id;
      UPDATE public.documentos_fiscais_pendentes SET status='EMITIDO' WHERE id=v_doc_id;

      BEGIN
        UPDATE public.documentos_fiscais_pendentes SET status='PENDENTE' WHERE id=v_doc_id;
      EXCEPTION WHEN check_violation THEN
        v_bloqueou := true;
      END;

      IF NOT v_bloqueou THEN
        RAISE EXCEPTION 'MIG306_EMITIDO_PARA_PENDENTE_AINDA_ACEITO';
      END IF;

      DELETE FROM public.documentos_fiscais_eventos WHERE documento_id = v_doc_id;
      DELETE FROM public.documentos_fiscais_pendentes WHERE id = v_doc_id;

      RAISE NOTICE '306 OK — D-2 fechado: EMITIDO→PENDENTE bloqueado e prova removida';
    END;
  END IF;
END
$verify$;

COMMIT;
