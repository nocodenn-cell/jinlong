-- Migration 234: corrige "permission denied for table pdv_config" na finalização de venda.
--
-- Causa raiz:
--   calcular_preco_produto era SECURITY INVOKER: rodava com os privilégios do
--   chamador (role authenticated). Internamente acessa pdv_config para ler
--   quantidade_minima_atacado_padrao, mas a migration 058 revogou SELECT em
--   pdv_config de authenticated (tabela contém gerente_senha_sha256). Resultado:
--   "permission denied for table pdv_config" → exibido como "Acesso negado a
--   dados do sistema" ao operador durante finalizar_venda.
--
-- Correção:
--   Alteração para SECURITY DEFINER: a função passa a rodar com os privilégios
--   do owner (postgres), que tem acesso a pdv_config. Seguro porque:
--     * A função só retorna { preco, tipo } – sem colunas sensíveis.
--     * Lookup por p_produto_id (parâmetro) – sem varredura de tabela.
--     * search_path fixo = public (exigido pelo hardening da migration 115).
--     * EXECUTE já restrito: REVOKE FROM PUBLIC; GRANT TO authenticated (077).
--
-- Observação: quando chamada internamente por finalizar_venda_transacional_canonica_v3
-- (SECURITY DEFINER, owner=postgres), o SET SESSION AUTHORIZATION era postgres e a
-- função já funcionava. O bug só se manifestava na chamada direta via PostgREST
-- (caixaPrecoAutoritativoServer.ts → supabase.rpc), onde o caller é authenticated.

CREATE OR REPLACE FUNCTION public.calcular_preco_produto(
  p_produto_id uuid,
  p_quantidade integer,
  p_loja_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_varejo numeric(10, 2);
  v_atacado_cat numeric(10, 2);
  v_min_padrao numeric(10, 3);
  r record;
BEGIN
  IF p_quantidade IS NULL OR p_quantidade < 1 THEN
    RETURN jsonb_build_object(
      'preco', NULL,
      'tipo', 'VAREJO',
      'erro', 'quantidade_invalida'
    );
  END IF;

  SELECT p.preco_varejo, p.preco_atacado
  INTO v_varejo, v_atacado_cat
  FROM public.produtos p
  WHERE p.id = p_produto_id AND p.ativo = true;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'preco', NULL,
      'tipo', 'VAREJO',
      'erro', 'produto_nao_encontrado'
    );
  END IF;

  SELECT pa.preco_unitario, pa.id
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
      'regra_id', r.id
    );
  END IF;

  SELECT c.quantidade_minima_atacado_padrao
  INTO v_min_padrao
  FROM public.pdv_config c
  WHERE c.id = 1
  LIMIT 1;

  IF v_atacado_cat IS NOT NULL
     AND v_min_padrao IS NOT NULL
     AND p_quantidade::numeric >= v_min_padrao THEN
    RETURN jsonb_build_object(
      'preco', v_atacado_cat,
      'tipo', 'ATACADO',
      'fonte', 'catalogo'
    );
  END IF;

  RETURN jsonb_build_object(
    'preco', v_varejo,
    'tipo', 'VAREJO',
    'fonte', 'varejo'
  );
END;
$$;

COMMENT ON FUNCTION public.calcular_preco_produto(uuid, integer, uuid) IS
  'Preço unitário efetivo para quantidade no carrinho (faixas precos_atacado ou catálogo atacado). '
  'SECURITY DEFINER: necessário para acessar pdv_config (revogado de authenticated na migration 058).';

-- Manter grants idênticos à migration 077 (idempotente).
REVOKE ALL ON FUNCTION public.calcular_preco_produto(uuid, integer, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.calcular_preco_produto(uuid, integer, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.calcular_preco_produto(uuid, integer, uuid) TO service_role;
