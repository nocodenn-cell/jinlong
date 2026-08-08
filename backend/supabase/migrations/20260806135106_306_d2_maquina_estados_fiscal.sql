-- Backport Fase 1 (Git-only) from supabase_migrations.schema_migrations.statements
-- version: 20260806135106
-- name: 306_d2_maquina_estados_fiscal
-- source: production read-only export (schema_migrations)
-- Applied in production: yes (do NOT re-run on production).

BEGIN;

ALTER TABLE public.documentos_fiscais_pendentes
  ADD COLUMN IF NOT EXISTS ultima_transicao_em timestamptz,
  ADD COLUMN IF NOT EXISTS transicao_origem text;

COMMENT ON COLUMN public.documentos_fiscais_pendentes.ultima_transicao_em IS
  'Instante da ultima mudanca de status (gravado por tr_documentos_fiscais_estado_bu).';
COMMENT ON COLUMN public.documentos_fiscais_pendentes.transicao_origem IS
  'Transicao que produziu o status atual, no formato ANTES>DEPOIS.';

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
    RAISE EXCEPTION 'FISCAL_TRANSICAO_INVALIDA:%->%', OLD.status, NEW.status
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

DO $verify$
DECLARE
  v_venda_id uuid;
  v_doc_id uuid;
  v_bloqueou boolean := false;
BEGIN
  IF (SELECT count(*) FROM information_schema.columns
      WHERE table_schema='public' AND table_name='documentos_fiscais_pendentes'
        AND column_name IN ('ultima_transicao_em','transicao_origem')) <> 2 THEN
    RAISE EXCEPTION 'MIG306_COLUNAS_AUSENTES';
  END IF;

  IF (SELECT count(*) FROM pg_trigger
      WHERE tgrelid='public.documentos_fiscais_pendentes'::regclass
        AND tgname IN ('tr_documentos_fiscais_estado_bi','tr_documentos_fiscais_estado_bu')) <> 2 THEN
    RAISE EXCEPTION 'MIG306_TRIGGERS_AUSENTES';
  END IF;

  SELECT v.id INTO v_venda_id
  FROM public.vendas v
  WHERE NOT EXISTS (
    SELECT 1 FROM public.documentos_fiscais_pendentes d WHERE d.venda_id = v.id
  )
  LIMIT 1;

  IF v_venda_id IS NULL THEN
    RAISE NOTICE '306 - sem vendas para prova viva; verificacao estrutural OK';
  ELSE
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

    RAISE NOTICE '306 OK - D-2 fechado';
  END IF;
END
$verify$;

COMMIT;