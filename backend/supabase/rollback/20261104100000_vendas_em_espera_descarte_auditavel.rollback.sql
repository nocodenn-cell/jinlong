-- Rollback de 20261104100000_vendas_em_espera_descarte_auditavel.sql
-- Restaura a função anterior (motivo opcional, sem autor/data) e remove o CHECK e as colunas.
-- PERDA DE DADOS: as colunas descartada_por e descartada_em, com os valores gravados depois
-- da migration, são eliminadas. Exporte-as antes se houver descartes auditados que precisem
-- ser preservados. Não há efeito sobre motivo, status ou demais colunas.
-- Executar somente em ambiente autorizado.

BEGIN;

CREATE OR REPLACE FUNCTION internal.descartar_venda_em_espera(p_id uuid, p_motivo text DEFAULT NULL::text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_row public.vendas_em_espera%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'sessao_expirada' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_row
  FROM public.vendas_em_espera
  WHERE id = p_id
    AND status IN ('EM_ESPERA', 'RETOMADA')
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'venda_em_espera_nao_encontrada' USING ERRCODE = 'P0002';
  END IF;

  IF v_row.operador_id IS DISTINCT FROM v_uid THEN
    RAISE EXCEPTION 'permissao_negada' USING ERRCODE = '42501';
  END IF;

  UPDATE public.vendas_em_espera
  SET
    status = 'DESCARTADA',
    descartada_motivo = NULLIF(btrim(COALESCE(p_motivo, '')), ''),
    atualizada_em = now()
  WHERE id = p_id;

  RETURN jsonb_build_object('id', p_id, 'status', 'DESCARTADA');
END;
$function$;

ALTER TABLE public.vendas_em_espera DROP CONSTRAINT IF EXISTS vendas_em_espera_descarte_auditavel_chk;
ALTER TABLE public.vendas_em_espera DROP COLUMN IF EXISTS descartada_em;
ALTER TABLE public.vendas_em_espera DROP COLUMN IF EXISTS descartada_por;

COMMIT;
