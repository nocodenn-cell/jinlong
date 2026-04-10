# Deploy na Vercel — `pdv-importados`

## Monorepo

Ao importar o repositório na Vercel:


| Campo               | Valor                         |
| ------------------- | ----------------------------- |
| **Root Directory**  | `pdv-importados`              |
| **Framework**       | Next.js (detecção automática) |
| **Build Command**   | `npm run build`               |
| **Install Command** | `npm install`                 |
| **Output**          | `.next` (padrão Next.js)      |


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

## Ambientes sugeridos


| Ambiente   | Branch      | Banco                         |
| ---------- | ----------- | ----------------------------- |
| Production | `main`      | Projeto Supabase de produção  |
| Preview    | `feature/*` | Projeto de staging (opcional) |


