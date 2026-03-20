# Supabase (migrations + Edge Functions)

As migrations ficam **neste app** (`pdv-importados/supabase/migrations`), não em `pdv-local`.

## `db push` (aplicar migrations no projeto remoto)

1. Abra o terminal na pasta **`pdv-importados`** (não em `pdv-local`).

2. **Uma vez por máquina**, vincule o projeto (o *project ref* aparece em  
   Supabase Dashboard → Project Settings → General → Reference ID):

```powershell
cd C:\Naturecode\fastproduct\pdv-importados
npx supabase link --project-ref SEU_PROJECT_REF
```

Informe a **senha do banco** quando o CLI pedir (Database password no dashboard).

3. Envie as migrations:

```powershell
npx supabase db push
```

## Erro: "Cannot find project ref. Have you run supabase link?"

- Você está na pasta errada → use `pdv-importados`, ou  
- Ainda não rodou `supabase link` → passo 2 acima.

## Edge Function `sync-outbox`

```powershell
cd C:\Naturecode\fastproduct\pdv-importados
npx supabase functions deploy sync-outbox
```

Configure os secrets da function (`SYNC_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`) no Dashboard ou via CLI (veja `scripts/supabase-edge-secrets.example.ps1`).

## Segurança (obrigatório)

- **Nunca** commite `.env.local`, `.env` com chaves reais, nem scripts com JWTs.
- `SUPABASE_SERVICE_ROLE_KEY` e `SYNC_KEY` vazaram se estiveram no Git: **gere nova service role** (Dashboard → Settings → API → *rotate*) e **troque o `SYNC_KEY`** nas secrets da Edge Function e no PDV local.
- Edge secrets ≠ variáveis do Next: use `npx supabase secrets set ...` ou o painel **Edge Functions → Secrets**, não misture com `.env.local` do Next.
