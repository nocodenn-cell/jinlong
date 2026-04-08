-- Lojas + estoque por loja (baseline multi-loja).
-- UUID fixo da Matriz para defaults estáveis em seeds e smoke.

CREATE TABLE IF NOT EXISTS public.lojas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  codigo text UNIQUE,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.lojas (id, nome, codigo, ativo)
VALUES (
  'a0000001-0000-4000-8000-000000000001'::uuid,
  'Matriz',
  'MATRIZ',
  true
)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.lojas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "lojas_select_authenticated" ON public.lojas;
CREATE POLICY "lojas_select_authenticated"
  ON public.lojas FOR SELECT
  USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "lojas_write_gerente" ON public.lojas;
CREATE POLICY "lojas_write_gerente"
  ON public.lojas FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.id = auth.uid() AND u.perfil IN ('GERENTE', 'DONO')
    )
  );

-- caixas.loja_id
ALTER TABLE public.caixas
  ADD COLUMN IF NOT EXISTS loja_id uuid REFERENCES public.lojas(id);

UPDATE public.caixas c
SET loja_id = 'a0000001-0000-4000-8000-000000000001'::uuid
WHERE c.loja_id IS NULL;

ALTER TABLE public.caixas
  ALTER COLUMN loja_id SET NOT NULL;

ALTER TABLE public.caixas
  ALTER COLUMN loja_id SET DEFAULT 'a0000001-0000-4000-8000-000000000001'::uuid;

-- usuarios.loja_id
ALTER TABLE public.usuarios
  ADD COLUMN IF NOT EXISTS loja_id uuid REFERENCES public.lojas(id);

UPDATE public.usuarios u
SET loja_id = 'a0000001-0000-4000-8000-000000000001'::uuid
WHERE u.loja_id IS NULL;

ALTER TABLE public.usuarios
  ALTER COLUMN loja_id SET NOT NULL;

ALTER TABLE public.usuarios
  ALTER COLUMN loja_id SET DEFAULT 'a0000001-0000-4000-8000-000000000001'::uuid;

-- estoque: uma linha por (loja, produto)
ALTER TABLE public.estoque
  ADD COLUMN IF NOT EXISTS loja_id uuid REFERENCES public.lojas(id);

UPDATE public.estoque e
SET loja_id = 'a0000001-0000-4000-8000-000000000001'::uuid
WHERE e.loja_id IS NULL;

ALTER TABLE public.estoque
  ALTER COLUMN loja_id SET NOT NULL;

ALTER TABLE public.estoque
  ALTER COLUMN loja_id SET DEFAULT 'a0000001-0000-4000-8000-000000000001'::uuid;

ALTER TABLE public.estoque DROP CONSTRAINT IF EXISTS estoque_produto_id_key;

DROP INDEX IF EXISTS estoque_loja_produto_unique;
CREATE UNIQUE INDEX estoque_loja_produto_unique
  ON public.estoque (loja_id, produto_id);

CREATE INDEX IF NOT EXISTS idx_estoque_loja ON public.estoque (loja_id);

CREATE OR REPLACE VIEW public.v_estoque_baixo AS
SELECT
  p.id,
  p.nome,
  p.codigo_barras,
  p.origem,
  l.id AS loja_id,
  l.nome AS loja_nome,
  e.quantidade_atual,
  e.estoque_minimo,
  (e.estoque_minimo - e.quantidade_atual) AS deficit
FROM public.produtos p
JOIN public.estoque e ON e.produto_id = p.id
JOIN public.lojas l ON l.id = e.loja_id
WHERE p.ativo = true
  AND e.quantidade_atual <= e.estoque_minimo
ORDER BY deficit DESC;

COMMENT ON VIEW public.v_estoque_baixo IS 'Produtos com estoque abaixo do mínimo, por loja.';

CREATE OR REPLACE FUNCTION public.decrementar_estoque_seguro(
  p_produto_id UUID,
  p_quantidade NUMERIC,
  p_venda_id UUID
)
RETURNS TABLE(
  sucesso BOOLEAN,
  mensagem TEXT,
  estoque_atual NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_quantidade_atual NUMERIC;
  v_version INTEGER;
  v_baixa_existente BOOLEAN;
  v_loja_id uuid;
BEGIN
  SELECT c.loja_id INTO v_loja_id
  FROM public.vendas v
  JOIN public.caixas c ON c.id = v.caixa_id
  WHERE v.id = p_venda_id
  LIMIT 1;

  IF v_loja_id IS NULL THEN
    RETURN QUERY SELECT FALSE, 'VENDA_CAIXA_INVALIDA'::TEXT, NULL::NUMERIC;
    RETURN;
  END IF;

  IF auth.role() IS DISTINCT FROM 'service_role' AND auth.uid() IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.vendas v
      WHERE v.id = p_venda_id
        AND v.operador_id = auth.uid()
    ) THEN
      RETURN QUERY SELECT FALSE, 'VENDA_NAO_AUTORIZADA'::TEXT, NULL::NUMERIC;
      RETURN;
    END IF;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM estoque_baixas eb
    WHERE eb.venda_id = p_venda_id
      AND eb.produto_id = p_produto_id
  ) INTO v_baixa_existente;

  IF v_baixa_existente THEN
    SELECT e.quantidade_atual INTO v_quantidade_atual
    FROM estoque e
    WHERE e.produto_id = p_produto_id
      AND e.loja_id = v_loja_id;

    RETURN QUERY SELECT TRUE, 'BAIXA_JA_EXISTE'::TEXT, v_quantidade_atual;
    RETURN;
  END IF;

  SELECT e.quantidade_atual, e.version
  INTO v_quantidade_atual, v_version
  FROM estoque e
  WHERE e.produto_id = p_produto_id
    AND e.loja_id = v_loja_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT FALSE, 'PRODUTO_NAO_ENCONTRADO_NO_ESTOQUE'::TEXT, NULL::NUMERIC;
    RETURN;
  END IF;

  IF v_quantidade_atual < p_quantidade THEN
    RETURN QUERY SELECT FALSE, 'ESTOQUE_INSUFICIENTE'::TEXT, v_quantidade_atual;
    RETURN;
  END IF;

  UPDATE estoque e
  SET
    quantidade_atual = e.quantidade_atual - p_quantidade,
    version = e.version + 1,
    updated_at = NOW()
  WHERE e.produto_id = p_produto_id
    AND e.loja_id = v_loja_id
    AND e.version = v_version;

  IF NOT FOUND THEN
    RETURN QUERY SELECT FALSE, 'CONCORRENCIA_DETECTADA'::TEXT, NULL::NUMERIC;
    RETURN;
  END IF;

  INSERT INTO estoque_baixas (venda_id, produto_id, quantidade)
  VALUES (p_venda_id, p_produto_id, p_quantidade)
  ON CONFLICT (venda_id, produto_id) DO NOTHING;

  v_quantidade_atual := v_quantidade_atual - p_quantidade;

  RETURN QUERY SELECT TRUE, 'SUCESSO'::TEXT, v_quantidade_atual;
END;
$$;

COMMENT ON FUNCTION public.decrementar_estoque_seguro IS
  'Decrementa estoque na loja do caixa da venda; idempotente por (venda_id, produto_id).';

CREATE OR REPLACE FUNCTION public.decrementar_estoque_idempotente(
  p_produto_id uuid,
  p_quantidade numeric,
  p_venda_id uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_loja_id uuid;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    IF auth.uid() IS NULL THEN
      RAISE EXCEPTION 'decrementar_estoque: sessão inválida';
    END IF;
    IF NOT EXISTS (
      SELECT 1
      FROM public.vendas v
      WHERE v.id = p_venda_id
        AND v.operador_id = auth.uid()
    ) THEN
      RAISE EXCEPTION 'decrementar_estoque: venda inexistente ou não pertence ao operador';
    END IF;
  END IF;

  SELECT c.loja_id INTO v_loja_id
  FROM public.vendas v
  JOIN public.caixas c ON c.id = v.caixa_id
  WHERE v.id = p_venda_id
  LIMIT 1;

  IF v_loja_id IS NULL THEN
    RAISE EXCEPTION 'decrementar_estoque: caixa/loja inválidos';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.estoque_baixas
    WHERE venda_id = p_venda_id AND produto_id = p_produto_id
  ) THEN
    RETURN;
  END IF;

  UPDATE public.estoque e
  SET
    quantidade_atual = quantidade_atual - p_quantidade,
    version = e.version + 1,
    updated_at = now()
  WHERE e.produto_id = p_produto_id
    AND e.loja_id = v_loja_id;

  INSERT INTO estoque_baixas (venda_id, produto_id, quantidade)
  VALUES (p_venda_id, p_produto_id, p_quantidade)
  ON CONFLICT (venda_id, produto_id) DO NOTHING;
END;
$$;
