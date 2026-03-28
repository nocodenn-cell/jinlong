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

## Curto prazo

- [ ] **P0 operacional** — checklist: [P0_CHECKLIST_OPERACIONAL.md](./P0_CHECKLIST_OPERACIONAL.md) (migrations, Edge, `.env` desktop, teste venda → nuvem)
- **Pausado até haver projeto Supabase “real” da loja:** validação ponta a ponta da **outbox**, **prova desktop → nuvem** e **secrets + Tauri alinhados ao ref** — ver caixa “Escopo adiado” no checklist.
- [ ] Aplicar todas as migrations em **cada** ambiente Supabase usado (dev/staging/prod) — SQL auxiliar: `backend/supabase/scripts/verify_p0_producao.sql`
- [ ] Secrets `SYNC_KEY` + envs PDV local (`SYNC_ENDPOINT`, `SYNC_KEY`) — quando fechar o P0 no ambiente oficial
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
