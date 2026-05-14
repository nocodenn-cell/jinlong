-- P1: validação de transições de status em documentos_fiscais_pendentes + auditoria de transição.

ALTER TABLE public.documentos_fiscais_pendentes
  ADD COLUMN IF NOT EXISTS ultima_transicao_em timestamptz,
  ADD COLUMN IF NOT EXISTS transicao_origem text;

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
