# Roadmap — fastproduct

Estado atual: MVP com web (Next + Supabase), desktop (Tauri + SQLite), sync outbox, i18n trilingue, middleware por sessao e perfil.

## Feito (referencia)

- Auth Supabase, `/login` com `next` seguro
- Rotas `/gerente/*` e `/caixa` protegidas; **middleware por perfil** (OPERADOR apenas `/caixa`; GERENTE/DONO apenas area `/gerente` na URL)
- Edge `sync-outbox` (venda, caixa, movimento) + RPC estoque (`007`) + `GRANT authenticated` p/ caixa web (`009`); logs JSON na function
- Caixa web: **Finalizar venda** → `vendas` / `itens_venda` + RPC estoque (Server Action)
- Playwright (porta dedicada) + Vitest
- Documentacao: E2E, Vercel, Supabase env, TAURI_SYNC
- Migrations e Edge Functions em **`backend/supabase/`** (pasta única de backend Supabase no monorepo)
- **Fase 1 (gerente):** migration **010** — RLS `SELECT` em `estoque_baixas` para GERENTE/DONO; rota **`/gerente/vendas/[id]`** com itens e baixas; links na lista e no painel
- **Relatórios:** migrations **011**–**013** — RPCs `relatorio_*_periodo` com **`p_de` / `p_ate` / `p_tz`** (IANA validado em `pg_timezone_names`); **`relatorio_settings`** + env **`RELATORIO_TIMEZONE`**; **`/gerente/relatorios`**; estoque baixo instantâneo

## Curto prazo

- [ ] **P0 operacional** — roteiro linear: [P0_CHECKLIST_OPERACIONAL.md](./P0_CHECKLIST_OPERACIONAL.md) (§1 migrations + verify SQL → §2 Edge se usar desktop → §5 web; teste **§4b web-only** ou **§4** com desktop)
- [ ] Aplicar migrations **001–013** em **cada** ambiente Supabase usado (dev/staging/prod) — `verify_p0_producao.sql` (011–013 = relatórios + fuso configurável)
- [ ] Secrets `SYNC_KEY` + `pdv-local/.env` — **obrigatório** só no piloto com **desktop**; web-only dispensa §2–§3
- [x] CI: build + lint + Vitest em PR; job Playwright **opcional** (`vars.ENABLE_PLAYWRIGHT_E2E` + secrets — ver `ci-pdv-importados.yml`)
- [x] `npm audit` / atualizacao de dependencias criticas (pdv-importados + pdv-local)

## Medio prazo

- [x] Painel gerente: estoque, vendas, caixas, relatórios, início (`/gerente`) — consumindo Supabase
- [x] Politica de retry da outbox (limite, backoff, DLQ, UI reprocessar) — `pdv-local`
- [ ] Metricas / observabilidade desktop (opcional)
- [x] Reuso de `core/` no `pdv-local` via alias `@core` (comentário em `vite.config.ts`; `cartStore` já importa pricing/tipos)
- [x] Observabilidade: logs estruturados na Edge (`sync-outbox`, uma linha JSON por evento)

## Longo prazo

- [ ] Multi-loja / filiais
- [x] Export CSV nas telas do gerente (vendas, estoque, produtos, caixas, relatórios)
- [ ] Atualizacoes automaticas do app Tauri
