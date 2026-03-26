# Roadmap — fastproduct

Estado atual: MVP com web (Next + Supabase), desktop (Tauri + SQLite), sync outbox, i18n trilingue, middleware por sessao e perfil.

## Feito (referencia)

- Auth Supabase, `/login` com `next` seguro
- Rotas `/gerente/*` e `/caixa` protegidas; **middleware por perfil** (OPERADOR apenas `/caixa`; GERENTE/DONO apenas area `/gerente` na URL)
- Edge `sync-outbox` (venda, caixa, movimento) + migration estoque idempotente (`007`)
- Playwright (porta dedicada) + Vitest
- Documentacao: E2E, Vercel, Supabase env, TAURI_SYNC
- Migrations e Edge Functions em **`backend/supabase/`** (pasta única de backend Supabase no monorepo)

## Curto prazo

- [ ] Aplicar todas as migrations no projeto Supabase de producao (incl. `007`)
- [ ] Secrets `SYNC_KEY` + envs PDV local (`SYNC_ENDPOINT`, `SYNC_KEY`)
- [ ] CI: opcional job Playwright com secrets de teste
- [ ] `npm audit` / atualizacao de dependencias criticas

## Medio prazo

- [ ] Painel gerente: mais telas (estoque, vendas, caixas) consumindo Supabase
- [ ] Politica de retry da outbox (limite, DLQ, metricas)
- [ ] Reuso explicito de `core/` no `pdv-local` (pricing, tipos)
- [ ] Observabilidade: logs estruturados na Edge

## Longo prazo

- [ ] Multi-loja / filiais
- [ ] Relatorios e exportacao
- [ ] Atualizacoes automaticas do app Tauri
