-- Reduz políticas permissivas duplicadas em public.vendas (INSERT avaliava vendas_operador + vendas_gerente).
-- Comportamento preservado: operador insere/consulta apenas vendas próprias; GERENTE/DONO acesso total.

DROP POLICY IF EXISTS "vendas_operador" ON public.vendas;
DROP POLICY IF EXISTS "vendas_gerente" ON public.vendas;

CREATE POLICY "vendas_select_authenticated"
  ON public.vendas FOR SELECT TO authenticated
  USING (
    operador_id = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM public.usuarios u
      WHERE u.id = auth.uid()
        AND u.perfil IN ('GERENTE', 'DONO')
    )
  );

CREATE POLICY "vendas_insert_authenticated"
  ON public.vendas FOR INSERT TO authenticated
  WITH CHECK (
    operador_id = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM public.usuarios u
      WHERE u.id = auth.uid()
        AND u.perfil IN ('GERENTE', 'DONO')
    )
  );

CREATE POLICY "vendas_update_authenticated"
  ON public.vendas FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.usuarios u
      WHERE u.id = auth.uid()
        AND u.perfil IN ('GERENTE', 'DONO')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.usuarios u
      WHERE u.id = auth.uid()
        AND u.perfil IN ('GERENTE', 'DONO')
    )
  );

CREATE POLICY "vendas_delete_authenticated"
  ON public.vendas FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.usuarios u
      WHERE u.id = auth.uid()
        AND u.perfil IN ('GERENTE', 'DONO')
    )
  );
