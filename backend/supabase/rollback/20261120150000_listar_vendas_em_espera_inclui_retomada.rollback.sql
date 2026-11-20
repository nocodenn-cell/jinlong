-- Restaura a lista só com EM_ESPERA (corpo de 20260710163032).
-- Não apaga vendas. Um RETOMADA deixa de aparecer na lista de novo.

CREATE OR REPLACE FUNCTION public.listar_vendas_em_espera()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'sessao_expirada' USING ERRCODE = '42501';
  END IF;

  RETURN COALESCE(
    (
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', v.id,
          'numero_local', v.numero_local,
          'rotulo', v.rotulo,
          'totais', v.totais,
          'qtd_itens', jsonb_array_length(v.itens),
          'criada_em', v.criada_em,
          'atualizada_em', v.atualizada_em
        )
        ORDER BY v.atualizada_em DESC
      )
      FROM public.vendas_em_espera v
      WHERE v.operador_id = v_uid AND v.status = 'EM_ESPERA'
    ),
    '[]'::jsonb
  );
END;
$$;
