-- Rollback de 20261107120000_d11_atacado_fonte_unica_produto.sql (D-11).
-- Restaura calcular_preco_produto da versão 20260901030000 (só faixas de precos_atacado).
-- Remove trigger de invariantes, trigger e tabela de auditoria de atacado, plano/execução
-- de migração e seleção manual. ATENÇÃO: remover as tabelas apaga a auditoria. Exporte antes
-- se já houver registros. Não desfaz preco_atacado/quantidade_gatilho_atacado já migrados;
-- para isso, restaure os valores pelo historico_atacado_produto e pelo d11_migracao_faixas_log.
BEGIN;

DROP FUNCTION IF EXISTS public.registrar_selecao_manual_atacado(uuid, integer, text);
DROP FUNCTION IF EXISTS public.d11_perfil_pode_selecao_manual_atacado(text);
DROP TABLE IF EXISTS public.selecoes_manuais_atacado;

DROP FUNCTION IF EXISTS public.d11_executar_migracao_faixas_atacado(text);
DROP FUNCTION IF EXISTS public.d11_plano_migracao_faixas_atacado();
DROP TABLE IF EXISTS public.d11_migracao_faixas_log;

DROP TRIGGER IF EXISTS trg_d11_historico_atacado_produto ON public.produtos;
DROP FUNCTION IF EXISTS public.registrar_historico_atacado_produto();
DROP TABLE IF EXISTS public.historico_atacado_produto;

DROP TRIGGER IF EXISTS trg_d11_validar_cadastro_atacado ON public.produtos;
DROP FUNCTION IF EXISTS public.validar_cadastro_atacado_produto();

CREATE OR REPLACE FUNCTION public.calcular_preco_produto(
  p_produto_id uuid,
  p_quantidade integer,
  p_loja_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_varejo numeric(10, 2);
  r record;
BEGIN
  IF p_quantidade IS NULL OR p_quantidade < 1 THEN
    RETURN jsonb_build_object(
      'preco', NULL,
      'tipo', 'VAREJO',
      'erro', 'quantidade_invalida'
    );
  END IF;

  SELECT p.preco_varejo
  INTO v_varejo
  FROM public.produtos p
  WHERE p.id = p_produto_id AND p.ativo = true;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'preco', NULL,
      'tipo', 'VAREJO',
      'erro', 'produto_nao_encontrado'
    );
  END IF;

  SELECT pa.preco_unitario, pa.id, pa.quantidade_minima
  INTO r
  FROM public.precos_atacado pa
  WHERE pa.produto_id = p_produto_id
    AND pa.ativo = true
    AND pa.quantidade_minima <= p_quantidade
    AND (pa.loja_id IS NULL OR pa.loja_id = p_loja_id)
  ORDER BY pa.quantidade_minima DESC
  LIMIT 1;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'preco', r.preco_unitario,
      'tipo', 'ATACADO',
      'fonte', 'tier',
      'regra_id', r.id,
      'quantidade_minima', r.quantidade_minima
    );
  END IF;

  RETURN jsonb_build_object(
    'preco', v_varejo,
    'tipo', 'VAREJO',
    'fonte', 'varejo',
    'regra_id', NULL,
    'quantidade_minima', NULL
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.calcular_preco_produto(uuid, integer, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.calcular_preco_produto(uuid, integer, uuid) TO authenticated, service_role;

COMMIT;
