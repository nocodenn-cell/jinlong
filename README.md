# fastproduct — monorepo PDV

PDV para lojas de importados no Brasil, com interface em **português** e **普通话 (简体)**.

**Produção (go/no-go):** [docs/PRODUCAO_GO_NO_GO.md](docs/PRODUCAO_GO_NO_GO.md) — o que o CI cobre vs o que é manual (Supabase, Vercel, Edge).

## Status do projeto

> 🟢 **Go-Live autorizado em 2026-08-09** — piloto em produção na loja **Matriz**.
> Produção canônica: **https://pdv-importados.vercel.app** · Supabase: projeto `jinlong`.

O `go_autorizado = true` foi registrado em `/admin/implantacao` com SSRA verde e produção alinhada à
`main` (SHA `2afa14ca`). A certificação técnica completa, com evidências, está em
[`GO_LIVE_CERTIFICATION_REPORT.md`](GO_LIVE_CERTIFICATION_REPORT.md).

Mudanças com impacto em produção, schema ou governança são registradas no
[**CHANGELOG**](CHANGELOG.md).

### Riscos residuais monitorados

O Go-Live de 2026-08-09 foi autorizado **com riscos residuais conhecidos** — nenhum deles bloqueava
aquela decisão, e todos seguem sob acompanhamento:

| Item | Classificação | Estado |
|---|---|---|
| Cadeia financeira AR/AP (Issue #298) | **P0 — em remediação** | Auditoria de 2026-08-13 concluiu **NÃO CERTIFICADO**: recebimentos e pagamentos não fecham com caixa/fluxo. Bloco AR/AP remediado e **apto para reauditoria** (§11), que ainda não foi executada. |
| Comissões — bloco DB-05 A→F | ✅ **Certificado** | Backend e frontend certificados (§12). **Fase 3A permanece não liberada**, pois depende também da reauditoria do bloco AR/AP. |
| E2E crítico (Playwright `sync-fluxo`) | Sistema de risco | Não é gate SSRA; monitorar pós-piloto. |
| `GL-DENO-LOCK` | Go-Live separado | `sync-outbox` e `validar-gerente --frozen` falham; passam com `--no-lock`. Corrigir em tarefa separada. |
| `venda_finance_context` (P1-01) | ✅ **Encerrado** | Reaplicação aposentada; tombstone `20260810222702` é a convergência oficial. **Não reaplicar manualmente.** Ver [ADR-012](docs/adr/ADR-012-aposentadoria-venda-finance-context.md) e a [reconciliação](docs/RECONCILIACAO_venda_finance_context_2026-08-13.md). |
| Branches/PRs legados | Higiene P2 | Passo 8 do plano de fechamento. |
| Cancelamento pós-devolução (reembolso/estoque duplicados) | ✅ **Corrigido, aguarda apply em produção** | Encontrado e corrigido em 2026-08-20 (migration `20260820150000`). Testado localmente; aplicação em produção é decisão separada. Ver [docs/DECISAO_CANCELAMENTO_REEMBOLSO_DUPLICADO.md](docs/DECISAO_CANCELAMENTO_REEMBOLSO_DUPLICADO.md). |
| Promoções automáticas | Funcionalidade futura (BL-2) | Não implementadas — nem online nem offline. Não é bug. Ver [docs/COMUNICADO_PROMOCOES_AUTOMATICAS.md](docs/COMUNICADO_PROMOCOES_AUTOMATICAS.md). |

As seções §§ referenciadas são do `GO_LIVE_CERTIFICATION_REPORT.md`. Status consolidado pré-treinamento do cliente #1 (2026-08-21): [docs/STATUS_PROJETO_PRE_TREINAMENTO.md](docs/STATUS_PROJETO_PRE_TREINAMENTO.md).

## Estrutura

| Pasta | Descrição |
|-------|-----------|
| `pdv-importados/` | Next.js (App Router), React 19, Supabase Auth, painel web gerente + login |
| `pdv-local/` | Tauri 2 + **React 19** + Vite + SQLite (PDV desktop, outbox de sync) — mesma geração do web |
| `backend/` | **Backend Supabase** — migrations PostgreSQL, Edge Functions (ex.: `sync-outbox`) |
| `shared/` | Trechos mínimos compartilhados entre pacotes (ex.: polyfill Vitest, `env-check-lib`) |
| `docs/` | Documentação do monorepo (deploy, E2E, release, prompts) |

## Monorepo (npm workspaces + Turborepo)

Na **raiz** do repositório (`fastproduct/`):

```bash
npm ci
```

Scripts úteis (executar na raiz):

| Script | Efeito |
|--------|--------|
| `npm run lint` | ESLint em todos os pacotes que definem `lint` |
| `npm run test` | Vitest em `pdv-importados` e `pdv-local` |
| `npm run build` | Build de produção só do **Next** (`pdv-importados`) — alinhado ao deploy Vercel |
| `npm run build:all` | Build de todos os pacotes que definem `build` (inclui `pdv-local`/Vite) |
| `npm run check` | `deno check` das Edge Functions (`backend`) |
| `npm run check:all` | `check` + `lint` + `test` |
| `npm run ci` | `check` + `lint` + `test` + build só do **Next** (igual Vercel / `npm run build` na raiz) |
| `npm run dev:web` | `next dev` só no workspace web |
| `npm run dev:desktop` | `vite` só no workspace desktop |

**Cache remoto do Turborepo (opcional):** defina `TURBO_TOKEN` e `TURBO_TEAM` no ambiente ou no CI para [Remote Caching](https://turbo.build/repo/docs/core-concepts/remote-caching).

## Como rodar

### Web (`pdv-importados`)

```bash
cd fastproduct   # raiz do monorepo
npm ci
cp pdv-importados/.env.example pdv-importados/.env.local   # preencher Supabase
npm run dev:web
```

Abre em [http://localhost:3000](http://localhost:3000). **Rota de login:** `/login`.

### Desktop (`pdv-local`)

```bash
cd fastproduct
npm ci
cp pdv-local/.env.example pdv-local/.env   # preencher SYNC_ENDPOINT e SYNC_KEY do mesmo projeto Supabase
npm run dev:desktop    # apenas Vite (UI)
npm run dev:tauri      # Tauri + Vite (raiz: delega ao workspace pdv-local)
```

## Git hooks (opcional)

Na raiz do repositório, para bloquear commit acidental de `.env` / `.env.local`:

```bash
git config core.hooksPath .githooks
```

O hook executa `scripts/git-pre-commit-check.mjs` (resolve o `git` em caminhos padrão do Git for Windows / Linux; se necessário, defina **`GIT_EXE`** com o caminho absoluto do executável). PRs também exibem checklist em [`.github/pull_request_template.md`](.github/pull_request_template.md).

## Documentação

- [**Índice da documentação**](docs/INDEX.md) — mapa completo de `docs/`
- [**CHANGELOG**](CHANGELOG.md) — decisões e mudanças com impacto em produção, schema ou governança
- [**Certificação de Go-Live**](GO_LIVE_CERTIFICATION_REPORT.md) — evidências, auditoria #298 e plano de remediação
- [**ADRs**](docs/adr/) — decisões de arquitetura ([ADR-011](docs/adr/ADR-011-ssot-unico-migrations.md) SSOT de migrations · [ADR-012](docs/adr/ADR-012-aposentadoria-venda-finance-context.md) aposentadoria do espelho financeiro)
- [**Produção — go / no-go**](docs/PRODUCAO_GO_NO_GO.md) — CI pós-deploy + checklist manual (P0 / segurança)
- [**P0 checklist** — migrations, deploy Edge, secrets, teste ponta a ponta](docs/P0_CHECKLIST_OPERACIONAL.md)
- [**P0 staging** — checklist com data/responsável + comando de status de migrations](docs/CHECKLIST_P0_STAGING.md)
- [**Ambientes e release** — dev/staging/prod, credenciais PDV local, gates](docs/AMBIENTES_E_RELEASE.md)
- [**Guia de implantação (Web vs Desktop)** — quando usar cada módulo por cenário de loja](docs/GUIA_IMPLANTACAO_WEB_VS_DESKTOP.md)
- [**Circuito operacional** — deploy Edge, secrets, teste desktop → nuvem, caixa web vs desktop](docs/CIRCUITO_OPERACIONAL.md)
- [Roadmap](docs/ROADMAP.md)
- [Segurança — dependências](pdv-importados/docs/SECURITY.md)
- [Testes E2E (Playwright)](docs/E2E.md)
- [Deploy na Vercel](docs/DEPLOY_VERCEL.md)
- [Supabase — variáveis](pdv-importados/docs/SUPABASE_ENV.md)
- [Seed dev/E2E — Auth + usuarios](pdv-importados/docs/SEED_DEV_E2E.md)
- [Backend Supabase — visão geral](backend/README.md) — na pasta `backend`, `npm run check` / `npm run check:edge` valida as três Edge Functions (Deno) como no CI: `sync-outbox`, `validar-gerente`, `fiscal-worker`
- [Supabase CLI / migrations](backend/supabase/README.md)

### Go-Live — Primeiro Cliente Pagante

- **[Plano completo de Go-Live](./docs/go-live/00-README.md)** — 12 documentos com passo a passo, checklists e troubleshooting
- **CHECKLIST FINAL** — [versão para imprimir](./docs/go-live/CHECKLIST-FINAL.md)

## Prompts / IA no repositório

- **Sessão autônoma (única fonte):** [`docs/CURSOR_PROMPT_SESSAO_AUTONOMA_CANONICO.md`](docs/CURSOR_PROMPT_SESSAO_AUTONOMA_CANONICO.md)
- **Regras ativas do Cursor (automáticas):** `.cursor/rules/governance.mdc` e `.cursor/rules/security.mdc`
- Referência de pastas no app web: `pdv-importados/.cursorrules` (contexto do módulo; não substitui as regras da raiz)
