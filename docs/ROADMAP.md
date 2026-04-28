# Roadmap — fastproduct

Estado atual: MVP com web (Next + Supabase), desktop (Tauri + SQLite), sync outbox, i18n trilingue, middleware por sessao e perfil.

## Feito (referencia)

- Auth Supabase, `/login` com `next` seguro
- Rotas `/gerente/*` e `/caixa` protegidas; **middleware por perfil** (OPERADOR apenas `/caixa`; GERENTE/DONO apenas area `/gerente` na URL)
- Edge `sync-outbox` (venda, caixa, movimento) + RPC estoque (`007`) + `GRANT authenticated` p/ caixa web (`009`); logs JSON na function; RPC transacional **`014`** (`registrar_venda_com_itens`) + type-check Deno no CI
- Caixa web: **Finalizar venda** → `vendas` / `itens_venda` + RPC estoque (Server Action)
- Playwright (porta dedicada) + Vitest
- Documentacao: E2E, Vercel, Supabase env, TAURI_SYNC
- Migrations e Edge Functions em **`backend/supabase/`** (pasta única de backend Supabase no monorepo)
- **Fase 1 (gerente):** migration **010** — RLS `SELECT` em `estoque_baixas` para GERENTE/DONO; rota **`/gerente/vendas/[id]`** com itens e baixas; links na lista e no painel
- **Relatórios:** migrations **011**–**013** — RPCs `relatorio_*_periodo` com **`p_de` / `p_ate` / `p_tz`** (IANA validado em `pg_timezone_names`); **`relatorio_settings`** + env **`RELATORIO_TIMEZONE`**; **`/gerente/relatorios`**; estoque baixo instantâneo
- **Fiscal (base técnica):** fila `documentos_fiscais_pendentes`, Edge **`fiscal-worker`**, RPC **`fiscal_enfileirar_documento_venda`** (ex.: migration **062**), enfileiramento opcional pós-venda no caixa web (`AUTO_ENQUEUE_FISCAL_ON_SALE` + `FISCAL_DEFAULT_DOC_TYPE`); opcional pós-sync **desktop** na Edge **`sync-outbox`** (`AUTO_ENQUEUE_FISCAL_ON_SYNCED_SALE` + `FISCAL_DEFAULT_DOC_TYPE`, desligado por predefinição); painel gerente em **`/gerente/financeiro`**; `npm run env:check` valida `FISCAL_*` quando o enqueue web está ligado

## Curto prazo

### Operação e ambientes (checklists — marcar ao concluir em cada ref)

- [ ] **P0 operacional** — roteiro linear: [P0_CHECKLIST_OPERACIONAL.md](./P0_CHECKLIST_OPERACIONAL.md) (trilha T1–T12: link → migrations → `verify_p0_producao.sql` → Edge `sync-outbox` + secrets se desktop → web §5 → teste **§4b** ou **§4**)
- [ ] Aplicar **todas** as migrations versionadas em **cada** ambiente Supabase usado (dev/staging/prod), **sem lacunas** — `npx supabase migration list` + `verify_p0_producao.sql` (inclui **001–013** relatórios/fuso e demais blocos P0 descritos no checklist)
- [ ] Secrets `SYNC_KEY` + `pdv-local/.env` — **obrigatório** só no piloto com **desktop**; web-only dispensa §2–§3 do P0
- [ ] **Ativação NFC-e/NFe real (Focus)** — operação: [CHECKLIST_ATIVACAO_FOCUS_1_DIA.md](./CHECKLIST_ATIVACAO_FOCUS_1_DIA.md); critérios e evidência de piloto: [DONE_DEFINITION_PILOTO.md](./DONE_DEFINITION_PILOTO.md) §4.3 e §7 em [CHECKLIST_P0_STAGING.md](./CHECKLIST_P0_STAGING.md)
- [x] CI: build + lint + Vitest em PR; job Playwright **opcional** (`vars.ENABLE_PLAYWRIGHT_E2E` + secrets — ver `ci-pdv-importados.yml`); E2E sem skip silencioso quando `CI=true`; **smoke migrations** Postgres (`ci-backend-supabase`); **CI pdv-local**
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
