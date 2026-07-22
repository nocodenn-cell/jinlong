DROP POLICY IF EXISTS clientes_write_gerente_loja ON public.clientes;

CREATE POLICY clientes_insert_loja
  ON public.clientes
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE  u.id = auth.uid()
        AND  (u.perfil = 'ADMIN' OR u.loja_id = clientes.loja_id)
    )
  );

CREATE POLICY clientes_update_gerente_loja
  ON public.clientes
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE  u.id = auth.uid()
        AND  u.perfil IN ('GERENTE', 'DONO', 'ADMIN')
        AND  (u.perfil = 'ADMIN' OR u.loja_id = clientes.loja_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE  u.id = auth.uid()
        AND  u.perfil IN ('GERENTE', 'DONO', 'ADMIN')
        AND  (u.perfil = 'ADMIN' OR u.loja_id = clientes.loja_id)
    )
  );

CREATE POLICY clientes_delete_gerente_loja
  ON public.clientes
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE  u.id = auth.uid()
        AND  u.perfil IN ('GERENTE', 'DONO', 'ADMIN')
        AND  (u.perfil = 'ADMIN' OR u.loja_id = clientes.loja_id)
    )
  );
