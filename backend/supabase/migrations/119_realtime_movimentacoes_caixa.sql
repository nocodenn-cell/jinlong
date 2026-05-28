-- Habilita Supabase Realtime para movimentacoes_caixa.
-- Permite que clientes autenticados recebam eventos de INSERT/UPDATE em tempo real
-- para qualquer sangria ou suprimento registrado no caixa ativo, mesmo que
-- originado em outro terminal. A RLS existente (movimentacoes_caixa_select_loja)
-- garante que cada assinante só enxerga eventos do próprio caixa/loja.
ALTER PUBLICATION supabase_realtime ADD TABLE public.movimentacoes_caixa;
