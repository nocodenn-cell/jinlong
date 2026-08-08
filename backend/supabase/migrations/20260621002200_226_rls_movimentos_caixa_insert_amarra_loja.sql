-- 226_rls_movimentos_caixa_insert_amarra_loja.sql
--
-- SEGURANÇA (escopo de loja no INSERT direto de movimentos_caixa).
--
-- Problema: a policy `movimentos_insert` só exigia `auth.role() = 'authenticated'`.
-- Qualquer usuário autenticado podia, via REST direto, inserir um movimento
-- referenciando QUALQUER caixa_id — inclusive de outra loja — sem ser dono do
-- caixa nem gerente. Não amarrava à loja nem ao operador.
--
-- Fix: o INSERT direto passa a exigir que o caixa referenciado seja da MESMA loja
-- do usuário E que o usuário seja o operador dono do caixa OU GERENTE/DONO/ADMIN.
-- Espelha o padrão de `vendas_insert_loja` e das policies de `caixas`.
--
-- IMPACTO NULO no fluxo do caixa: registrar/aprovar/cancelar/estornar movimentação
-- passam por RPCs SECURITY DEFINER (registrar_movimentacao etc.), que rodam fora da
-- RLS. Nenhum caminho da aplicação faz INSERT direto nesta tabela.
--
-- ALTER POLICY (não DROP/CREATE): sem janela de deny. Preserva o initplan
-- `( SELECT auth.uid() )` introduzido na migration 224.

ALTER POLICY movimentos_insert ON public.movimentos_caixa
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.caixas c
      JOIN public.usuarios u ON u.id = ( SELECT auth.uid() )
      WHERE c.id = movimentos_caixa.caixa_id
        AND c.loja_id = u.loja_id
        AND (
          c.operador_id = ( SELECT auth.uid() )
          OR u.perfil = ANY (ARRAY['GERENTE'::text, 'DONO'::text, 'ADMIN'::text])
        )
    )
  );
