# Homologação para produção (go-live)

Checklist operacional alinhado a critérios de stress e segurança do monorepo (`pdv-importados`, Supabase, `pdv-local`). Use como evidência por ciclo antes de apontar DNS/tráfego real.

Referências: [CHECKLIST_DEPLOY_SUPABASE.md](./CHECKLIST_DEPLOY_SUPABASE.md), [CHECKLIST_P0_STAGING.md](./CHECKLIST_P0_STAGING.md), [RUNBOOK_ROLLBACK.md](./RUNBOOK_ROLLBACK.md), [P2_GOVERNANCA_RLS_E_PENTEST.md](./P2_GOVERNANCA_RLS_E_PENTEST.md).

---

## Ambiente

- [ ] Todas as migrations em `backend/supabase/migrations/` aplicadas no projeto Supabase de produção (`npx supabase db push` ou pipeline equivalente), **incluindo** as mais recentes (ex.: RLS `pdv_config`, cancelamento split 059 — conferir `migration list` sem drift).
- [ ] Secrets configurados no Supabase: `SYNC_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL` nas Edge Functions; `FISCAL_WORKER_KEY` na Edge `fiscal-worker` e na Vercel; `VALIDAR_GERENTE_CORS_STRICT` + `VALIDAR_GERENTE_ALLOWED_ORIGINS` em produção.
- [ ] Variáveis de ambiente na Vercel (ou host Next): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `FISCAL_WORKER_ENDPOINT`, `FISCAL_WORKER_KEY`, flags `USE_UNIFIED_SALES_FLOW` / `STRICT_MANAGER_DISCOUNT_AUTH` alinhadas às secrets do `sync-outbox`.

---

## Funcionalidades obrigatórias

- [ ] Caixa: abrir, vender (dinheiro, cartão, PIX, split), fechar com diferença acima do limite exigindo motivo (regra de negócio atual).
- [ ] Quantidades fracionadas (até 3 decimais) no carrinho web, coerentes com `numeric(10,3)` no banco.
- [ ] Sangria/suprimento: valores abaixo do limite automático; acima do limite com autorização de gerente (token/senha conforme configuração).
- [ ] Estoque: concorrência e bloqueio de venda sem estoque (fluxo canônico / RPC).
- [ ] Cancelamento de venda: estoque reposto; **split** — devoluções por forma; saldo em espécie debitado só para parcelas em DINHEIRO; formas não-dinheiro apenas auditoria em `devolucoes` (migration 059).
- [ ] Atalhos de caixa: F4 finalizar, F6 fechar caixa, Ctrl+B focar busca (fora de campos de texto).
- [ ] **Idempotência de finalização (web):** com `USE_UNIFIED_SALES_FLOW=true`, o cliente envia `idempotencyKey` (UUID estável por tentativa de cupom); o servidor usa como `p_venda_id` e a RPC canônica v2 (migration `061`) retorna cedo se a venda já estiver `CONCLUIDA` — evita duplicar venda em retry/duplo clique.
- [ ] Painel gerencial: vendas, caixas, estoque, financeiro, recebimento, transferências (smoke mínimo por perfil).

---

## Produto / escopo online

- [ ] **Web (`pdv-importados`)** opera **somente online** (sem IndexedDB/outbox de vendas no browser). Operação offline fica no **`pdv-local`** (Tauri). Comunicação formal a operadores e suporte documentada.

---

## Segurança

- [ ] RLS ativo nas tabelas públicas sensíveis; `pdv_config` sem SELECT direto para `authenticated` (RPC `pdv_config_para_caixa_web` aplicada).
- [ ] CORS restrito na Edge `validar-gerente` (origens explícitas em produção).
- [ ] Nenhuma `service_role` no frontend nem em builds expostos ao browser; `SYNC_KEY` só Edge + `pdv-local`.

---

## Backup e recuperação

- [ ] Backup automático do Postgres (Plano Supabase com PITR ou política interna de snapshot) ativo no projeto de produção.
- [ ] Teste de restauração ou replay documentado em **staging** antes do corte.

---

## Plano de rollback

- [ ] Procedimento revisado em [RUNBOOK_ROLLBACK.md](./RUNBOOK_ROLLBACK.md) (reverter deploy web, pin de migration, secrets).

---

## Backlog pós go-live (não bloqueante)

- [x] **Kardex unificado (baseline):** view `public.v_kardex_unificado` (migration `060_v_kardex_unificado.sql`) — unifica `movimentos_estoque_log`, `estoque_baixas` e `estoque_reposicoes_cancelamento`. Opcional: evoluir para **materialized view** + `REFRESH` se relatórios ficarem pesados.
- [ ] Cobertura E2E Playwright nos fluxos críticos de caixa e gerente.
- [ ] Revisão de `Math.round` residual no front vs `round_abnt` no banco.
- [ ] Rotina de rotação de `SYNC_KEY` / `FISCAL_WORKER_KEY` (ex.: semestral) com registro de data.

---

## SonarCloud / PR

- [ ] Quality gate SonarCloud verde e PR principal mergeado conforme processo interno (ex.: PR #6).
