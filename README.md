# fastproduct — monorepo PDV

PDV para lojas de importados no Brasil, com interface em **português**, **普通话 (简体)** e **廣東話 (繁體)**.

## Estrutura

| Pasta | Descrição |
|-------|-----------|
| `pdv-importados/` | Next.js 15 (App Router), Supabase Auth, painel web gerente + login |
| `pdv-local/` | Tauri 2 + React + Vite + SQLite (PDV desktop, outbox de sync) |
| `backend/` | **Backend Supabase** — migrations PostgreSQL, Edge Functions (ex.: `sync-outbox`) |
| `docs/` | Documentação do monorepo (deploy, E2E, release, prompts) |

## Como rodar

### Web (`pdv-importados`)

```bash
cd pdv-importados
npm install
cp .env.example .env.local   # preencher Supabase
npm run dev
```

Abre em [http://localhost:3000](http://localhost:3000). **Rota de login:** `/login`.

### Desktop (`pdv-local`)

```bash
cd pdv-local
npm install
npm run tauri
# ou: npx tauri dev
```

## Documentação

- [**P0 checklist** — migrations, deploy Edge, secrets, teste ponta a ponta](docs/P0_CHECKLIST_OPERACIONAL.md)
- [**Ambientes e release** — dev/staging/prod, credenciais PDV local, gates](docs/AMBIENTES_E_RELEASE.md)
- [**Circuito operacional** — deploy Edge, secrets, teste desktop → nuvem, caixa web vs desktop](docs/CIRCUITO_OPERACIONAL.md)
- [Roadmap](docs/ROADMAP.md)
- [Segurança — dependências](pdv-importados/docs/SECURITY.md)
- [Testes E2E (Playwright)](docs/E2E.md)
- [Deploy na Vercel](docs/DEPLOY_VERCEL.md)
- [Supabase — variáveis](pdv-importados/docs/SUPABASE_ENV.md)
- [Seed dev/E2E — Auth + usuarios](pdv-importados/docs/SEED_DEV_E2E.md)
- [Backend Supabase — visão geral](backend/README.md)
- [Supabase CLI / migrations](backend/supabase/README.md)

## Prompts / IA no repositório

- **Sessão autônoma (única fonte):** [`docs/CURSOR_PROMPT_SESSAO_AUTONOMA_CANONICO.md`](docs/CURSOR_PROMPT_SESSAO_AUTONOMA_CANONICO.md)
- **Regras ativas do Cursor (automáticas):** `.cursor/rules/governance.mdc` e `.cursor/rules/security.mdc`
- Referência de pastas no app web: `pdv-importados/.cursorrules` (contexto do módulo; não substitui as regras da raiz)
