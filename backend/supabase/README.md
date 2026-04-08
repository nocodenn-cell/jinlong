# Supabase (migrations + Edge Functions)

As migrations e Edge Functions do projeto ficam em `**backend/supabase/**` (pasta central de backend do monorepo), não em `pdv-local`.

## `db push` (aplicar migrations no projeto remoto)

1. Abra o terminal na pasta `**backend**` (raiz do repositório: `fastproduct/backend`).
2. **Uma vez por máquina**, vincule o projeto. O *project ref* aparece em
  Supabase Dashboard → Project Settings → General → Reference ID (~20 caracteres).  
   **Não** use o texto `SEU_PROJECT_REF` — substitua pelo valor real.

```powershell
cd C:\Naturecode\fastproduct\backend
npx supabase link --project-ref abcdefghijklmnopqrst
```

Informe a **senha do banco** quando o CLI pedir (Database password no dashboard).

1. Envie as migrations:

```powershell
npx supabase db push
```

## Erro: "Cannot find project ref. Have you run supabase link?"

- Você está na pasta errada → use `**backend**`, ou  
- Ainda não rodou `supabase link` → passo 2 acima.

## Edge Function `sync-outbox`

```powershell
cd C:\Naturecode\fastproduct\backend
npx supabase functions deploy sync-outbox
```

Configure os secrets da function (`SYNC_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`) no Dashboard ou via CLI (veja `../pdv-importados/scripts/supabase-edge-secrets.example.ps1` a partir da pasta `backend`).

## CI — smoke de migrations

No GitHub Actions, o workflow **CI backend Supabase** aplica todas as migrations em ordem sobre PostgreSQL 15 com um stub mínimo de `auth` (`backend/supabase/scripts/ci_stub_supabase_auth.sql`). Isso **não** substitui `supabase db push` no projeto real; só pega erros de SQL/ordem cedo.

## Segurança (obrigatório)

- **Nunca** commite `.env.local`, `.env` com chaves reais, nem scripts com JWTs.
- `SUPABASE_SERVICE_ROLE_KEY` e `SYNC_KEY` vazaram se estiveram no Git: **gere nova service role** (Dashboard → Settings → API → *rotate*) e **troque o `SYNC_KEY`** nas secrets da Edge Function e no PDV local.
- Edge secrets ≠ variáveis do Next: use `npx supabase secrets set ...` ou o painel **Edge Functions → Secrets**, não misture com `.env.local` do Next.

