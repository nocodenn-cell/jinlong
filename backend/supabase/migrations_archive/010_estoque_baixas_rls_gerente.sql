-- Leitura de estoque_baixas para GERENTE/DONO (auditoria por venda na área gerente).
-- Inserções continuam apenas via RPC SECURITY DEFINER / service_role (Edge).

CREATE POLICY "estoque_baixas_select_gerente_dono"
  ON public.estoque_baixas FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.id = auth.uid() AND u.perfil IN ('GERENTE', 'DONO')
    )
  );

COMMENT ON POLICY "estoque_baixas_select_gerente_dono" ON public.estoque_baixas IS
  'Gerente/dono consultam registros de baixa idempotente; sem INSERT/UPDATE/DELETE para authenticated.';
