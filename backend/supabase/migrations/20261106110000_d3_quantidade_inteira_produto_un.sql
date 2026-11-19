-- D3 (PLANO_LIBERACAO_PRIMEIRO_CLIENTE_2026-11-06, P0-8 / D-04 aprovado):
-- Produto com unidade_medida = 'UN' só aceita quantidade inteira em itens_venda.
-- Produtos vendidos a granel devem ter unidade própria (KG, G, L, M etc.).
--
-- Regra no banco (não só na tela) para valer também no sync do PDV local.
-- Não altera linhas existentes: a checagem é só em INSERT e UPDATE.
--
-- ANTES DE APLICAR EM PRODUÇÃO (pré-checagem somente leitura, obrigatória):
--   SELECT iv.id, iv.venda_id, p.nome, iv.quantidade
--   FROM public.itens_venda iv JOIN public.produtos p ON p.id = iv.produto_id
--   WHERE p.unidade_medida = 'UN' AND iv.quantidade <> trunc(iv.quantidade);
-- Se houver linhas, a decisão é corrigir o cadastro da unidade antes do deploy.
-- O default de produtos.unidade_medida é 'UN': produto de balança cadastrado sem
-- unidade fica bloqueado para fração.

CREATE OR REPLACE FUNCTION internal.valida_quantidade_inteira_produto_un()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_unidade text;
BEGIN
  SELECT p.unidade_medida INTO v_unidade
  FROM public.produtos p
  WHERE p.id = NEW.produto_id;

  IF v_unidade = 'UN' AND NEW.quantidade <> trunc(NEW.quantidade) THEN
    RAISE EXCEPTION 'VENDA_QUANTIDADE_FRACIONADA_UN'
      USING DETAIL = format('produto_id=%s quantidade=%s', NEW.produto_id, NEW.quantidade),
            HINT = 'Produto em unidade UN aceita apenas quantidade inteira.';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION internal.valida_quantidade_inteira_produto_un() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_itens_venda_quantidade_inteira_un ON public.itens_venda;
CREATE TRIGGER trg_itens_venda_quantidade_inteira_un
  BEFORE INSERT OR UPDATE OF quantidade, produto_id ON public.itens_venda
  FOR EACH ROW
  EXECUTE FUNCTION internal.valida_quantidade_inteira_produto_un();

COMMENT ON FUNCTION internal.valida_quantidade_inteira_produto_un() IS
  'D-04: itens de produto UN exigem quantidade inteira (INSERT/UPDATE).';
