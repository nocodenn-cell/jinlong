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

### Projeto remoto (nuvem — o mais comum)

Substitua **`<ref>`** pelo **Reference ID** real (Dashboard → Project Settings → General).  
**Não** use o texto literal `SEU_PROJECT_REF` dos exemplos.

```powershell
cd C:\Naturecode\fastproduct\backend
npx supabase link --project-ref <ref>
npx supabase db push
npx supabase functions deploy sync-outbox
```

- `npx supabase status` **sem** stack local pode falhar ao inspecionar containers Docker — isso é normal se você **não** rodou `supabase start`. Para nuvem, o que importa é `link` + `db push` / deploy.

### Stack local (Docker)

Requer **Docker Desktop** ativo.

```powershell
cd C:\Naturecode\fastproduct\backend
npx supabase start
npx supabase status
```

Útil para testar migrations e API localmente; variáveis (`API URL`, keys) aparecem no output do `status`.

Detalhes: [supabase/README.md](./supabase/README.md). **Deploy da Edge, secrets e teste desktop → nuvem:** [docs/CIRCUITO_OPERACIONAL.md](../docs/CIRCUITO_OPERACIONAL.md).

## CI

Em PRs que alterem `backend/`, o workflow [`.github/workflows/ci-backend-supabase.yml`](../.github/workflows/ci-backend-supabase.yml) executa **`deno check`** em `supabase/functions/sync-outbox/index.ts`. **Migrations SQL** não têm passo automático no CI — use revisão e `db push` / staging.
