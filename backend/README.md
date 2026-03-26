# Backend (fastproduct)

Pasta **única** do monorepo para o **backend hospedado no Supabase**:

- **PostgreSQL** — schema, RLS e evolução via migrations em `supabase/migrations/`
- **Edge Functions** (Deno) — ex.: `supabase/functions/sync-outbox`

## O que não está aqui (e por quê)

| Local | Papel |
|-------|--------|
| `pdv-importados/app/**/actions.ts` | Server Actions do Next.js (precisam ficar no App Router) |
| `pdv-importados/lib/supabase/` | Clientes browser/server do Supabase (camada de app) |
| `pdv-importados/lib/adapters/supabase/` | Repositórios que falam com o Postgres via cliente |
| `pdv-importados/core/` | Domínio puro (sem framework) |
| `pdv-local/src-tauri/` | SQLite local + sync — **não** é o servidor na nuvem |

## CLI Supabase

Sempre rode `npx supabase …` com o diretório de trabalho em **`backend`** (onde está `supabase/config.toml`).

```powershell
cd C:\Naturecode\fastproduct\backend
npx supabase link --project-ref SEU_PROJECT_REF
npx supabase db push
npx supabase functions deploy sync-outbox
```

Detalhes: [supabase/README.md](./supabase/README.md).
