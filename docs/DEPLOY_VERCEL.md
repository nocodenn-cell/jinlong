# Deploy na Vercel — `pdv-importados`

## Monorepo

O lockfile único fica na **raiz** do repositório (`npm ci` a partir da raiz). Ao importar o repositório na Vercel, use uma destas abordagens:

### Opção A — raiz do repositório (recomendada)

Na raiz existe [`vercel.json`](../vercel.json) com `installCommand`, `buildCommand` e `outputDirectory` alinhados ao monorepo. No painel da Vercel pode deixar os overrides vazios **ou** confirmar os mesmos valores:

| Campo                 | Valor |
| --------------------- | ----- |
| **Root Directory**    | `.` (raiz do repo) |
| **Framework**         | Next.js (ou “Other”; o output é fixado no `vercel.json`) |
| **Install Command**   | `npm ci` (padrão via `vercel.json`) |
| **Build Command**     | `npm run build` (= Turbo só em `pdv-importados`) |
| **Output Directory**  | `pdv-importados/.next` (via `vercel.json`) |

O ficheiro [`.nvmrc`](../.nvmrc) na raiz fixa **Node 20** quando o Root Directory do projeto é a raiz do repositório.

### Opção B — Root Directory só em `pdv-importados` (legado)

Se o projeto na Vercel já estiver fixo em `pdv-importados`, ajuste para instalar a partir da raiz:

| Campo                 | Valor |
| --------------------- | ----- |
| **Root Directory**    | `pdv-importados` |
| **Install Command**   | `cd .. && npm ci` |
| **Build Command**     | `cd .. && npx turbo run build --filter=pdv-importados` |
| **Output**            | `.next` (relativo a `pdv-importados`) |


## Variáveis de ambiente

### Públicas (Production, Preview e Development)


| Variável                        | Descrição                                           |
| ------------------------------- | --------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`      | URL do projeto Supabase (`https://xxx.supabase.co`) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Chave **anon** — segura para o client               |


### Somente servidor


| Variável                    | Descrição                                                                                                    |
| --------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `SUPABASE_SERVICE_ROLE_KEY` | **Nunca** prefixar com `NEXT_PUBLIC_`. Usar apenas em Server Actions / rotas server-side que você adicionar. |


Não colocar `SYNC_KEY` na Vercel: o segredo da sincronização PDV local → Supabase pertence à **Edge Function** (`sync-outbox`), via Supabase CLI:

```bash
supabase secrets set SYNC_KEY=seu-valor-secreto --project-ref <ref>
```

Detalhes: `backend/supabase/README.md` e `pdv-importados/docs/SUPABASE_ENV.md`.

### Banco (migrations)

Após alterações em `backend/supabase/migrations/`, aplicar no projeto Supabase (CLI `db push` a partir da pasta `**backend**` / migrações linkadas ou **SQL Editor**). Para baixa de estoque coerente com o código atual da Edge `sync-outbox` e do caixa web, o remoto deve incluir pelo menos **007** (`estoque_baixas`) e a cadeia **016**/**038** (**`decrementar_estoque_seguro`**, `FOR UPDATE` + `version`), **070**/**071** (RPC legada delega a `seguro`; sem `EXECUTE` para `authenticated`), além das RPCs de finalização (**025** canónica v2, etc.). A RPC legada `decrementar_estoque_idempotente` permanece só para **`service_role`** / compatibilidade; **não** é o caminho da outbox nem da finalização web.

## Verificação pós-deploy

1. Abrir a URL de produção e acessar `**/login`**.
2. Acessar `**/gerente/produtos**` sem sessão → deve redirecionar para `**/login?next=/gerente/produtos**` (`middleware.ts`).
3. Login com usuário válido (perfil conforme fluxo: gerente/dono → `/gerente/produtos`, operador → `/caixa`; query `next` respeitada quando segura).
4. Logs da Vercel: build sem erros de TypeScript.

### CI em `main` (SSRA — gate de release)

No workflow [`.github/workflows/ci-pdv-importados.yml`](../.github/workflows/ci-pdv-importados.yml), após `deploy` com `--prod`, o job **`validate-production`** compara o **Deployment ID** da API Vercel com `GET https://pdv-importados.vercel.app/api/health`. Ver [SSRA_RELEASE.md](./SSRA_RELEASE.md).

E2E (incluindo `test:e2e:critical` e smoke pós-deploy) é **sistema de risco**, não decisão de release — ver [SSRA_RELEASE.md](./SSRA_RELEASE.md) e [E2E.md](./E2E.md).


## Ambientes sugeridos


| Ambiente   | Branch      | Banco                         |
| ---------- | ----------- | ----------------------------- |
| Production | `main`      | Projeto Supabase de produção  |
| Preview    | `feature/*` | Projeto de staging (opcional) |


