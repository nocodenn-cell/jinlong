# fastproduct — monorepo PDV

PDV para lojas de importados no Brasil, com interface em **português**, **普通话 (简体)** e **廣東話 (繁體)**.

**Produção (go/no-go):** [docs/PRODUCAO_GO_NO_GO.md](docs/PRODUCAO_GO_NO_GO.md) — o que o CI cobre vs o que é manual (Supabase, Vercel, Edge).

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
| `npm run build` | Build de produção dos pacotes que definem `build` |
| `npm run check` | `deno check` das Edge Functions (`backend`) |
| `npm run check:all` | `check` + `lint` + `test` |
| `npm run ci` | `check` + `lint` + `test` + `build` (pipeline local próximo ao CI) |
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

- [**Produção — go / no-go**](docs/PRODUCAO_GO_NO_GO.md) — CI pós-deploy + checklist manual (P0 / segurança)
- [**P0 checklist** — migrations, deploy Edge, secrets, teste ponta a ponta](docs/P0_CHECKLIST_OPERACIONAL.md)
- [**P0 staging** — checklist com data/responsável + comando de status de migrations](docs/CHECKLIST_P0_STAGING.md)
- [**Ambientes e release** — dev/staging/prod, credenciais PDV local, gates](docs/AMBIENTES_E_RELEASE.md)
- [**Circuito operacional** — deploy Edge, secrets, teste desktop → nuvem, caixa web vs desktop](docs/CIRCUITO_OPERACIONAL.md)
- [Roadmap](docs/ROADMAP.md)
- [Segurança — dependências](pdv-importados/docs/SECURITY.md)
- [Testes E2E (Playwright)](docs/E2E.md)
- [Deploy na Vercel](docs/DEPLOY_VERCEL.md)
- [Supabase — variáveis](pdv-importados/docs/SUPABASE_ENV.md)
- [Seed dev/E2E — Auth + usuarios](pdv-importados/docs/SEED_DEV_E2E.md)
- [Backend Supabase — visão geral](backend/README.md) — na pasta `backend`, `npm run check` / `npm run check:edge` valida as três Edge Functions (Deno) como no CI: `sync-outbox`, `validar-gerente`, `fiscal-worker`
- [Supabase CLI / migrations](backend/supabase/README.md)

## Prompts / IA no repositório

- **Sessão autônoma (única fonte):** [`docs/CURSOR_PROMPT_SESSAO_AUTONOMA_CANONICO.md`](docs/CURSOR_PROMPT_SESSAO_AUTONOMA_CANONICO.md)
- **Regras ativas do Cursor (automáticas):** `.cursor/rules/governance.mdc` e `.cursor/rules/security.mdc`
- Referência de pastas no app web: `pdv-importados/.cursorrules` (contexto do módulo; não substitui as regras da raiz)
