-- RLS em descontos_venda (antes exposta por GRANT default no schema public).
-- Edge sync-outbox usa service_role (ignora RLS). App web: apenas GERENTE/DONO.

ALTER TABLE public.descontos_venda ENABLE ROW LEVEL SECURITY;

CREATE POLICY "descontos_venda_select_gerente_dono"
  ON public.descontos_venda FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.id = auth.uid() AND u.perfil IN ('GERENTE', 'DONO')
    )
  );

CREATE POLICY "descontos_venda_insert_gerente_dono"
  ON public.descontos_venda FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.id = auth.uid() AND u.perfil IN ('GERENTE', 'DONO')
    )
  );

CREATE POLICY "descontos_venda_update_gerente_dono"
  ON public.descontos_venda FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.id = auth.uid() AND u.perfil IN ('GERENTE', 'DONO')
    )
  );

CREATE POLICY "descontos_venda_delete_gerente_dono"
  ON public.descontos_venda FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.id = auth.uid() AND u.perfil IN ('GERENTE', 'DONO')
    )
  );
