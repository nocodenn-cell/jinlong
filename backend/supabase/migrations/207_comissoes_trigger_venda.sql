-- Subsistema de Comissões: Trigger de cálculo automático pós-venda.
-- Dispara AFTER INSERT em itens_venda e registra comissão em comissoes_vendedores.

CREATE OR REPLACE FUNCTION public.calcular_comissao_item_venda()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_comissao_tipo     TEXT;
  v_comissao_valor    DECIMAL(10,2);
  v_padrao            DECIMAL(10,2);
  v_valor_comissao    DECIMAL(10,2);
  v_vendedor_id       UUID;
  v_loja_id           UUID;
BEGIN
  -- Busca tipo/valor de comissão configurado no produto
  SELECT comissao_tipo, comissao_valor
    INTO v_comissao_tipo, v_comissao_valor
    FROM public.produtos
   WHERE id = NEW.produto_id;

  -- Busca vendedor e loja via caixa da venda
  SELECT v.operador_id, c.loja_id
    INTO v_vendedor_id, v_loja_id
    FROM public.vendas v
    JOIN public.caixas c ON c.id = v.caixa_id
   WHERE v.id = NEW.venda_id;

  -- Sem vendedor associado, não registra comissão
  IF v_vendedor_id IS NULL OR v_loja_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Produto sem comissão específica: usa percentual padrão global
  IF v_comissao_valor IS NULL THEN
    SELECT (cg.valor::TEXT)::DECIMAL
      INTO v_padrao
      FROM public.configuracoes_gerais cg
     WHERE cg.chave = 'comissao_padrao_percentual'
     LIMIT 1;
    v_comissao_tipo  := 'percentual';
    v_comissao_valor := COALESCE(v_padrao, 5.00);
  END IF;

  -- Calcula valor unitário da comissão
  IF v_comissao_tipo = 'percentual' THEN
    v_valor_comissao := ROUND(NEW.preco_unitario * (v_comissao_valor / 100.0), 2);
  ELSE
    v_valor_comissao := ROUND(v_comissao_valor, 2);
  END IF;

  INSERT INTO public.comissoes_vendedores (
    loja_id,
    venda_id,
    vendedor_id,
    produto_id,
    quantidade,
    valor_venda_unitario,
    valor_comissao_unitario,
    valor_comissao_total
  ) VALUES (
    v_loja_id,
    NEW.venda_id,
    v_vendedor_id,
    NEW.produto_id,
    NEW.quantidade,
    NEW.preco_unitario,
    v_valor_comissao,
    ROUND(v_valor_comissao * NEW.quantidade, 2)
  );

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_comissao_item_venda
  AFTER INSERT ON public.itens_venda
  FOR EACH ROW
  EXECUTE FUNCTION public.calcular_comissao_item_venda();
