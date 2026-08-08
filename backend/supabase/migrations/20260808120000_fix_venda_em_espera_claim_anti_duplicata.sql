-- Migration: claim anti-duplicata em venda em espera.
--
-- Contexto: a migration 288 deixou `retomar_venda_em_espera` sem consumir o
-- pedido (status permanece EM_ESPERA) para o operador não perder o cupom ao
-- retomar o pedido errado. O FOR UPDATE só vale durante a RPC — após o commit,
-- outro terminal (ou F5 + retomar de novo) carrega o mesmo cupom e finaliza com
-- outra chave de idempotência → duas vendas CONCLUIDA, estoque e caixa em dobro.
--
-- Correção:
--  1) retomar CLAIMA o pedido (EM_ESPERA → RETOMADA); 2ª retomada falha.
--  2) devolver_venda_em_espera devolve RETOMADA → EM_ESPERA (abandono do cupom).
--  3) descartar aceita EM_ESPERA ou RETOMADA (re-park / limpeza).
--  4) converter só a partir de EM_ESPERA|RETOMADA (idempotente em CONVERTIDA).
--
-- O P2 da 288 (não perder cupom ao desistir) fica no app: ao limpar o cupom
-- sem vender, chama devolver_venda_em_espera.

BEGIN;

CREATE OR REPLACE FUNCTION public.retomar_venda_em_espera(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'venda_em_espera_nao_encontrada' USING ERRCODE = 'P0002';
  END IF;

  IF v_row.operador_id IS DISTINCT FROM v_uid THEN
    RAISE EXCEPTION 'permissao_negada' USING ERRCODE = '42501';
  END IF;

  IF v_row.status = 'RETOMADA' THEN
    RAISE EXCEPTION 'venda_em_espera_em_uso' USING ERRCODE = 'P0001';
  END IF;

  IF v_row.status IS DISTINCT FROM 'EM_ESPERA' THEN
    RAISE EXCEPTION 'venda_em_espera_nao_encontrada' USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.vendas_em_espera
  SET status = 'RETOMADA', atualizada_em = now()
  WHERE id = p_id;

  RETURN jsonb_build_object(
    'id', v_row.id,
    'numero_local', v_row.numero_local,
    'rotulo', v_row.rotulo,
    'itens', v_row.itens,
    'totais', v_row.totais,
    'cliente_id', v_row.cliente_id,
    'desconto_gerente_percentual', v_row.desconto_gerente_percentual,
    'desconto_gerente_token', v_row.desconto_gerente_token
  );
END;
$$;

COMMENT ON FUNCTION public.retomar_venda_em_espera(uuid) IS
  'Claim exclusivo: EM_ESPERA → RETOMADA. Impede retomada concorrente / F5 '
  'duplicando a mesma venda. Abandono devolve via devolver_venda_em_espera.';

CREATE OR REPLACE FUNCTION public.devolver_venda_em_espera(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'venda_em_espera_nao_encontrada' USING ERRCODE = 'P0002';
  END IF;

  IF v_row.operador_id IS DISTINCT FROM v_uid THEN
    RAISE EXCEPTION 'permissao_negada' USING ERRCODE = '42501';
  END IF;

  IF v_row.status = 'EM_ESPERA' THEN
    RETURN jsonb_build_object('id', p_id, 'status', 'EM_ESPERA');
  END IF;

  IF v_row.status IS DISTINCT FROM 'RETOMADA' THEN
    RAISE EXCEPTION 'venda_em_espera_nao_encontrada' USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.vendas_em_espera
  SET status = 'EM_ESPERA', atualizada_em = now()
  WHERE id = p_id;

  RETURN jsonb_build_object('id', p_id, 'status', 'EM_ESPERA');
END;
$$;

COMMENT ON FUNCTION public.devolver_venda_em_espera(uuid) IS
  'Devolve pedido RETOMADA → EM_ESPERA quando o operador desiste do cupom '
  'sem finalizar a venda (preserva o P2 da migration 288).';

REVOKE ALL ON FUNCTION public.devolver_venda_em_espera(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.devolver_venda_em_espera(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.descartar_venda_em_espera(
  p_id uuid,
  p_motivo text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
$$;

CREATE OR REPLACE FUNCTION public.converter_venda_em_espera(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'venda_em_espera_nao_encontrada' USING ERRCODE = 'P0002';
  END IF;

  IF v_row.operador_id IS DISTINCT FROM v_uid THEN
    RAISE EXCEPTION 'permissao_negada' USING ERRCODE = '42501';
  END IF;

  IF v_row.status = 'CONVERTIDA' THEN
    RETURN jsonb_build_object('id', p_id, 'status', 'CONVERTIDA');
  END IF;

  IF v_row.status NOT IN ('EM_ESPERA', 'RETOMADA') THEN
    RAISE EXCEPTION 'venda_em_espera_nao_encontrada' USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.vendas_em_espera
  SET status = 'CONVERTIDA', atualizada_em = now()
  WHERE id = p_id;

  RETURN jsonb_build_object('id', p_id, 'status', 'CONVERTIDA');
END;
$$;

COMMENT ON FUNCTION public.converter_venda_em_espera(uuid) IS
  'Marca pedido em espera como CONVERTIDA após finalização. Aceita EM_ESPERA '
  'ou RETOMADA; idempotente em CONVERTIDA; rejeita DESCARTADA.';

NOTIFY pgrst, 'reload schema';

COMMIT;
