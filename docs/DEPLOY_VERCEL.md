# Deploy na Vercel — `pdv-importados`

## Monorepo

O lockfile único fica na **raiz** do repositório (`npm ci` a partir da raiz). Ao importar o repositório na Vercel, use uma destas abordagens:

### Opção A — raiz do repositório (recomendada)

| Campo                 | Valor |
| --------------------- | ----- |
| **Root Directory**    | `.` (raiz do repo) |
| **Framework**         | Next.js (ou “Other” + override abaixo) |
| **Install Command**   | `npm ci` |
| **Build Command**     | `npx turbo run build --filter=pdv-importados` |
| **Output Directory**  | `pdv-importados/.next` |

Confirme no painel da Vercel que o diretório de saída do Next aponta para `pdv-importados/.next` quando a raiz não é a pasta do app.

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

Após alterações em `backend/supabase/migrations/`, aplicar no projeto Supabase (CLI `db push` a partir da pasta `**backend**` / migrações linkadas ou **SQL Editor**). Ex.: `007_estoque_baixa_idempotente.sql` (RPC `decrementar_estoque_idempotente`) é necessária para baixa de estoque na Edge `sync-outbox`.

## Verificação pós-deploy

1. Abrir a URL de produção e acessar `**/login`**.
2. Acessar `**/gerente/produtos**` sem sessão → deve redirecionar para `**/login?next=/gerente/produtos**` (`middleware.ts`).
3. Login com usuário válido (perfil conforme fluxo: gerente/dono → `/gerente/produtos`, operador → `/caixa`; query `next` respeitada quando segura).
4. Logs da Vercel: build sem erros de TypeScript.

### CI em `main` (smoke automático)

No workflow [`.github/workflows/ci-pdv-importados.yml`](../.github/workflows/ci-pdv-importados.yml), após o deploy, o job `smoke-test` exporta a URL do passo **Deploy to Vercel** (`outputs.vercel_url` ← `steps.vercel.outputs.preview-url` da `amondnet/vercel-action`) e corre:

`npm run test:e2e:post-deploy-smoke -w pdv-importados`

Isto executa apenas `e2e/login.spec.ts` e `e2e/caixa.spec.ts` contra `PLAYWRIGHT_BASE_URL`, com `PLAYWRIGHT_E2E_WITH_DEV=0` (sem subir `next dev`). **Não** substitui o pipeline `test:e2e:critical` (sync + vendas), que continua a ser usado em homologação / Actions opcionais — ver [E2E.md](./E2E.md).

## Ambientes sugeridos


| Ambiente   | Branch      | Banco                         |
| ---------- | ----------- | ----------------------------- |
| Production | `main`      | Projeto Supabase de produção  |
| Preview    | `feature/*` | Projeto de staging (opcional) |


