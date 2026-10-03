-- ============================================================
-- Migration: RPC atualizar_preco_varejo_produto
--
-- Fecha o Risco 1 (P0) da auditoria de segurança 2026-09-27:
-- a Server Action atualizarPrecoVarejoProduto fazia
-- `UPDATE produtos SET preco_varejo WHERE id = produto_id`
-- direto via PostgREST, sem checar se o produto pertence à
-- loja do usuário. A policy `produtos_escrita` valida apenas
-- que o usuário tem perfil gerencial em ALGUMA loja
-- (auth_usuario_gerencial_loja), não que o PRODUTO ALVO
-- pertence à loja do usuário — permitindo que um GERENTE da
-- Loja A altere preço de produto da Loja B se souber o UUID.
--
-- Segue o mesmo padrão de receber_ordem_compra (migration 110):
-- GERENTE é restrito à própria loja; DONO/ADMIN têm acesso
-- global (mesma regra já aplicada em toda a base).
-- ============================================================

CREATE OR REPLACE FUNCTION public.atualizar_preco_varejo_produto(
  p_produto_id uuid,
  p_preco      numeric
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid          uuid := auth.uid();
  v_perfil       text;
  v_loja_usuario uuid;
  v_loja_produto uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'PRECO_AUTH';
  END IF;

  SELECT u.perfil, u.loja_id INTO v_perfil, v_loja_usuario
    FROM public.usuarios u WHERE u.id = v_uid;

  IF v_perfil IS NULL OR v_perfil NOT IN ('GERENTE', 'DONO', 'ADMIN') THEN
    RAISE EXCEPTION 'PRECO_PERFIL';
  END IF;

  IF p_preco IS NULL OR p_preco <= 0 THEN
    RAISE EXCEPTION 'PRECO_INVALIDO';
  END IF;

  SELECT loja_id INTO v_loja_produto
    FROM public.produtos WHERE id = p_produto_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PRECO_PRODUTO_NAO_ENCONTRADO';
  END IF;

  IF v_perfil = 'GERENTE' AND v_loja_usuario IS DISTINCT FROM v_loja_produto THEN
    RAISE EXCEPTION 'PRECO_LOJA';
  END IF;

  UPDATE public.produtos
     SET preco_varejo = p_preco
   WHERE id = p_produto_id;
END;
$$;

REVOKE ALL ON FUNCTION public.atualizar_preco_varejo_produto(uuid, numeric) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.atualizar_preco_varejo_produto(uuid, numeric) FROM anon;
GRANT EXECUTE ON FUNCTION public.atualizar_preco_varejo_produto(uuid, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.atualizar_preco_varejo_produto(uuid, numeric) TO service_role;
