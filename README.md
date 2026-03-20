# fastproduct — monorepo PDV

PDV para lojas de importados no Brasil, com interface em **português**, **普通话 (简体)** e **廣東話 (繁體)**.

## Estrutura

| Pasta | Descrição |
|-------|-----------|
| `pdv-importados/` | Next.js 15 (App Router), Supabase Auth, painel web gerente + login |
| `pdv-local/` | Tauri 2 + React + Vite + SQLite (PDV desktop, outbox de sync) |
| `pdv-importados/supabase/` | Migrations PostgreSQL e Edge Functions (ex.: `sync-outbox`) |
| `docs/` | Documentação do monorepo (prompts Cursor, E2E, deploy) |

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

- [Testes E2E (Playwright)](docs/E2E.md)
- [Deploy na Vercel](docs/DEPLOY_VERCEL.md)
- [Supabase — variáveis](pdv-importados/docs/SUPABASE_ENV.md)
- [Supabase CLI / migrations](pdv-importados/supabase/README.md)

## Prompts para o Cursor

Ver `docs/CURSOR_PROMPT_SESSAO_AUTONOMA_V3.md` (sessão autônoma recomendada).
