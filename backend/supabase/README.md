# Supabase (migrations + Edge Functions)

As migrations e Edge Functions do projeto ficam em `**backend/supabase/**` (pasta central de backend do monorepo), não em `pdv-local`.

## Stack local vs projeto linkado (uma máquina)

- **`npx supabase link`:** liga o CLI ao projeto **remoto** (Reference ID). Use na pasta **`backend`** para `db push` e deploy de functions. Não substitui o Docker local.
- **`npx supabase start`:** sobe **uma** stack local (portas fixas no `config.toml`; `project_id` = `fastproduct`). Não rode dois stacks no mesmo mapa de portas — pare com `npx supabase stop --project-id fastproduct` antes de subir outro projeto, ou altere portas em **um** dos `config.toml` (incomum).
- Detalhes, tabela de portas e troubleshooting de conflito: [../README.md](../README.md) (seção *Fluxo único: stack local × projeto linkado × portas*).

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

## CI — diagnóstico anti-replay (opcional, contra ambiente real)

No mesmo workflow há o job `anti-replay-diagnostic-gate` (runner Windows + PowerShell). Configure **somente no GitHub** (Settings → Secrets and variables → Actions) os secrets **``** (URL da função `sync-outbox`) e **`SYNC_KEY`** (igual ao secret da Edge). Com eles definidos, o CI executa `scripts/sync-outbox-anti-replay-diagnostic.ps1`; em **PR interno** que altera `sync-outbox` ou esse script, a ausência dos secrets faz o gate falhar (forks não recebem esses secrets — comportamento esperado).

## Smoke operacional completo (SQL)

Para simular o ciclo de operação (compra/entrada de estoque, vendas por forma de pagamento, desconto, cancelamento, sangria/suprimento e fechamento de caixa), execute no SQL Editor:

- `backend/supabase/scripts/smoke_operacao_fluxo_completo.sql`

O script é de teste, cria dados fictícios e valida automaticamente os resultados (lança erro se algum passo falhar).

## Segurança (obrigatório)

- **Nunca** commite `.env.local`, `.env` com chaves reais, nem scripts com JWTs.
- `SUPABASE_SERVICE_ROLE_KEY` e `SYNC_KEY` vazaram se estiveram no Git: **gere nova service role** (Dashboard → Settings → API → *rotate*) e **troque o `SYNC_KEY`** nas secrets da Edge Function e no PDV local.
- Edge secrets ≠ variáveis do Next: use `npx supabase secrets set ...` ou o painel **Edge Functions → Secrets**, não misture com `.env.local` do Next.

