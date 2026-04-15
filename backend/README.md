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

### Fluxo único: stack local × projeto linkado × portas

- **Uma stack local por máquina (recomendado):** só um `npx supabase start` ativo usando este `config.toml`. Os containers Docker ficam com o prefixo `supabase_*_fastproduct` (`project_id` em `supabase/config.toml`). Subir **outro** Supabase CLI no padrão (outro repo ou outro `config`) costuma disputar as **mesmas portas** (54321–54327 etc.) e falha com *port is already allocated*.
- **`npx supabase link --project-ref <ref>`:** associa o CLI ao projeto **remoto** no Dashboard (para `db push`, deploy de Edge Functions, secrets). **Não inicia** Docker nem ocupa portas por si só. Combinar **link + start** local reduz avisos de versão de imagens diferentes entre CLI e projeto na nuvem.
- **Portas fixas** (não mudar sem motivo; ver comentário no topo de `supabase/config.toml`):

| Uso | Porta |
|-----|--------|
| API (URL base do PostgREST / Kong) | **54321** |
| PostgreSQL | **54322** |
| Supabase Studio | **54323** |
| Inbucket (e-mail de teste) | **54324** |
| Analytics (Logflare) | **54327** |
| Shadow DB (`db diff`) | **54320** |
| Pooler (desligado no `config`; reservado) | **54329** |

**Conflito de porta:** pare a stack deste repo e tente de novo:

```powershell
cd C:\Naturecode\fastproduct\backend
npx supabase stop --project-id fastproduct
```

Se ainda existir stack antiga com outro nome de projeto (ex.: `pdv-importados`):

```powershell
npx supabase stop --project-id pdv-importados
```

No Windows: `netstat -ano | findstr :54322` ajuda a ver o que está escutando.

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

Restart rápido (stop + start com `project_id` **fastproduct**): `powershell -File .\scripts\restart-supabase-local.ps1` (com `cwd` em **`backend`**).

Detalhes: [supabase/README.md](./supabase/README.md). **Deploy da Edge, secrets e teste desktop → nuvem:** [docs/CIRCUITO_OPERACIONAL.md](../docs/CIRCUITO_OPERACIONAL.md).

## CI

Em PRs que alterem `backend/`, o workflow [`.github/workflows/ci-backend-supabase.yml`](../.github/workflows/ci-backend-supabase.yml) executa **`deno check`** em `supabase/functions/sync-outbox/index.ts`. **Migrations SQL** não têm passo automático no CI — use revisão e `db push` / staging.
