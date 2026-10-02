-- Dashboard Comercial (P0): devolução pós-venda consolidada para o DONO.
--
-- `vendas` já tem `vendas_select_dono_todas_lojas` (DONO lê todas as lojas visíveis), mas
-- `venda_pos_venda_operacoes_select_loja` só liberava operações cujo caixa é da loja do próprio usuário.
-- Resultado: o DONO via faturado consolidado e devoluções só da própria loja (receita líquida incoerente).
-- Premissa do piloto (temporária): "lojas visíveis" do DONO = todas as lojas do banco, igual a `vendas`.
-- GERENTE/ADMIN continuam restritos à loja do caixa da operação (ramo EXISTS inalterado).
-- Reutiliza o helper existente `auth_usuario_eh_dono()`; nenhuma regra de autorização nova.

DROP POLICY IF EXISTS "venda_pos_venda_operacoes_select_loja" ON public.venda_pos_venda_operacoes;

CREATE POLICY "venda_pos_venda_operacoes_select_loja"
  ON public.venda_pos_venda_operacoes FOR SELECT TO authenticated
  USING (
    public.auth_usuario_eh_dono()
    OR EXISTS (
      SELECT 1
      FROM public.caixas c
      INNER JOIN public.usuarios u ON u.id = auth.uid()
      WHERE c.id = venda_pos_venda_operacoes.caixa_id
        AND c.loja_id = u.loja_id
    )
  );
