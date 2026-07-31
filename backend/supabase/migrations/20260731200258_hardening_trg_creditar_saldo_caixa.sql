-- Hardening: `trg_creditar_saldo_caixa_venda_dinheiro` (migration anterior) é função
-- de trigger, sem uso legítimo fora do disparo automático em vendas_pagamentos —
-- o advisor de segurança do Supabase (linter) acusou corretamente que ela ficou
-- exposta como RPC pública para `anon`/`authenticated` (comportamento padrão do
-- Postgres/PostgREST para função nova em schema public, sem REVOKE explícito).
-- Segue o mesmo padrão de hardening já usado nas demais funções deste projeto.

REVOKE ALL ON FUNCTION public.trg_creditar_saldo_caixa_venda_dinheiro() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.trg_creditar_saldo_caixa_venda_dinheiro() FROM anon;
REVOKE ALL ON FUNCTION public.trg_creditar_saldo_caixa_venda_dinheiro() FROM authenticated;
-- O mecanismo de trigger dispara independente de GRANT de EXECUTE — não precisa de
-- nenhum role com acesso direto.
