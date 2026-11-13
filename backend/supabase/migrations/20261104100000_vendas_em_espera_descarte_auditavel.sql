-- ============================================================================
-- PDV-100.2 · RN-03 — descarte auditável de venda em espera (expand-contract).
--
-- DEPENDÊNCIA DE ORDEM: esta migration deve ser aplicada DEPOIS de
-- 20261103120000_fechar_caixa_bloqueia_vendas_em_espera (bloqueio do fechamento
-- com venda EM_ESPERA/RETOMADA). Não há conflito de DDL: esta migration não altera
-- fechar_caixa_atomico. Os testes de concorrência entre descarte e fechamento só
-- valem com a 20261103120000 aplicada.
--
-- EXPAND (esta migration, compatível com o código atual):
--   1. Colunas novas, nulas, sem backfill: descartada_por, descartada_em.
--      Registros históricos DESCARTADA ficam com NULL: não inventamos autor nem data.
--   2. CHECK NOT VALID (não revalida histórico): todo DESCARTADA novo tem motivo
--      (>= 3 caracteres), autor e data.
--   3. internal.descartar_venda_em_espera passa a exigir motivo, gravar o autor pelo
--      contexto autenticado (auth.uid()) e a data pelo banco (now()). A assinatura
--      pública public.descartar_venda_em_espera(uuid, text) permanece a mesma.
--
-- CONTRACT (fora desta migration, quando nenhum consumidor depender do legado):
--   validar o CHECK (VALIDATE CONSTRAINT) após conferir histórico em homologação.
--
-- Permissões mantidas: só o operador que colocou a venda em espera pode descartá-la
-- (regra existente). Empresa/loja são verificadas pelo wrapper público
-- (fp_assert_loja) e o caixa é o da própria venda.
--
-- NÃO APLICAR em produção sem autorização expressa. Rollback:
-- backend/supabase/rollback/20261104100000_vendas_em_espera_descarte_auditavel.rollback.sql
-- ============================================================================

BEGIN;

ALTER TABLE public.vendas_em_espera
  ADD COLUMN IF NOT EXISTS descartada_por uuid NULL REFERENCES public.usuarios(id),
  ADD COLUMN IF NOT EXISTS descartada_em timestamptz NULL;

-- Expand: só vale para linhas novas/alteradas (NOT VALID).
ALTER TABLE public.vendas_em_espera
  DROP CONSTRAINT IF EXISTS vendas_em_espera_descarte_auditavel_chk;
ALTER TABLE public.vendas_em_espera
  ADD CONSTRAINT vendas_em_espera_descarte_auditavel_chk
  CHECK (
    status <> 'DESCARTADA'
    OR (
      descartada_por IS NOT NULL
      AND descartada_em IS NOT NULL
      AND descartada_motivo IS NOT NULL
      AND length(btrim(descartada_motivo)) >= 3
    )
  ) NOT VALID;

-- Autor e data do descarte gravados no servidor (sem parâmetro do cliente).
CREATE OR REPLACE FUNCTION internal.descartar_venda_em_espera(p_id uuid, p_motivo text DEFAULT NULL::text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_row public.vendas_em_espera%ROWTYPE;
  v_motivo text := btrim(COALESCE(p_motivo, ''));
  v_agora timestamptz := now();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'sessao_expirada' USING ERRCODE = '42501';
  END IF;

  IF length(v_motivo) < 3 THEN
    RAISE EXCEPTION 'motivo_obrigatorio' USING ERRCODE = '22023';
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
    descartada_motivo = v_motivo,
    descartada_por = v_uid,
    descartada_em = v_agora,
    atualizada_em = v_agora
  WHERE id = p_id;

  RETURN jsonb_build_object(
    'id', p_id,
    'status', 'DESCARTADA',
    'descartada_por', v_uid,
    'descartada_em', v_agora
  );
END;
$function$;

COMMIT;
