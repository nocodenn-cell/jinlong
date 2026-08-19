-- F-3 e F-4 da reauditoria adversarial: privilégios destrutivos que a
-- aplicação nunca exerce.
--
-- ───────────────────────────────────────────────────────────────────────────
-- F-3 — TRUNCATE concedido a `authenticated`
--
-- Comprovado: `SET ROLE authenticated` (sem JWT algum) executou
-- `TRUNCATE public.caixas CASCADE` com sucesso, cascateando para 24 tabelas —
-- vendas, itens_venda, vendas_pagamentos, liquidacoes_receber, contas_receber,
-- contas_pagar_pagamentos, movimentacoes_caixa, devolucoes,
-- comissoes_vendedores, vendas_canceladas_auditoria, movimentos_estoque_log e
-- documentos_fiscais_*. TRUNCATE **ignora RLS**, então nenhuma policy de loja
-- protege contra isso.
--
-- É o default do Supabase (73 grants em 68 tabelas), não algo introduzido pela
-- remediação, e não encontrei vetor de exploração: PostgREST não emite TRUNCATE
-- e não existe função SECURITY INVOKER executável por `authenticated` com SQL
-- dinâmico. Ainda assim é privilégio que a aplicação nunca usa.
--
-- Prova de que nenhum fluxo legítimo depende: busca por `truncate` em
-- `pdv-importados/`, Edge Functions, `dev-tools/` e scripts SQL do repositório
-- não retorna nenhuma execução — apenas um comentário sobre truncar texto de
-- impressão térmica. `supabase db reset` roda como `postgres`, não como
-- `authenticated`, e portanto não é afetado.
--
-- ───────────────────────────────────────────────────────────────────────────
-- F-4 — DELETE físico de `caixas`
--
-- Comprovado: DONO/GERENTE/ADMIN da loja apagam um caixa ABERTO com
-- `valor_inicial` declarado e sem movimento, destruindo a declaração de
-- abertura antes do primeiro fato financeiro. Caixa com venda ou sangria já era
-- bloqueado pelas FKs, e operador que não é o dono já era bloqueado pela RLS.
--
-- O modelo existente já expressa o fim de vida de um caixa por `status`
-- (`ABERTO`/`FECHADO`), fechado pela RPC `fechar_caixa_atomico`. Nenhum status
-- novo é inventado: o privilégio de exclusão física é simplesmente removido dos
-- atores de aplicação. Nenhum código do produto executa DELETE em `caixas`.
--
-- ROLLBACK:
--   GRANT TRUNCATE ON ALL TABLES IN SCHEMA public TO authenticated, anon;
--   GRANT DELETE ON public.caixas TO authenticated;

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════════
-- F-3
-- ═══════════════════════════════════════════════════════════════════════════

REVOKE TRUNCATE ON ALL TABLES IN SCHEMA public FROM authenticated;
REVOKE TRUNCATE ON ALL TABLES IN SCHEMA public FROM anon;

-- Tabelas criadas depois desta migration não devem reintroduzir o privilégio.
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE TRUNCATE ON TABLES FROM authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE TRUNCATE ON TABLES FROM anon;

-- ═══════════════════════════════════════════════════════════════════════════
-- F-4
-- ═══════════════════════════════════════════════════════════════════════════

REVOKE DELETE ON public.caixas FROM authenticated;
REVOKE DELETE ON public.caixas FROM anon;

-- A policy de DELETE deixa de ter efeito prático sem o privilégio, mas fica
-- registrada a intenção para quem ler o schema.
COMMENT ON TABLE public.caixas IS
  'Sessao de caixa. saldo_atual e contador fisico gravavel apenas pelos writers '
  'financeiros SECURITY DEFINER. Encerramento e por status via fechar_caixa_atomico: '
  'exclusao fisica nao e permitida a atores de aplicacao (F-4).';

COMMIT;
