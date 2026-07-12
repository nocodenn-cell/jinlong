-- Hardening RLS: evitar inserts permissivos em movimentos_caixa e itens_venda.

DROP POLICY IF EXISTS "movimentos_insert" ON public.movimentos_caixa;
CREATE POLICY "movimentos_insert"
  ON public.movimentos_caixa
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.caixas c
      WHERE c.id = caixa_id
        AND c.operador_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1
      FROM public.usuarios u
      WHERE u.id = auth.uid()
        AND u.perfil IN ('GERENTE', 'DONO')
    )
  );

DROP POLICY IF EXISTS "itens_insert" ON public.itens_venda;
CREATE POLICY "itens_insert"
  ON public.itens_venda
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.vendas v
      WHERE v.id = venda_id
        AND v.operador_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1
      FROM public.usuarios u
      WHERE u.id = auth.uid()
        AND u.perfil IN ('GERENTE', 'DONO')
    )
  );
