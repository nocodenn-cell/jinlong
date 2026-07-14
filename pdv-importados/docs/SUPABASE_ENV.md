# Configuração Supabase + `.env.local` (referência permanente)

Este arquivo **não contém segredos** — só o que colocar em cada variável e onde achar no painel.

## Variáveis obrigatórias no Next (`pdv-importados/.env.local`)

| Variável | O que é | Formato correto (exemplo de forma, não copie valores reais) |
|----------|---------|--------------------------------------------------------------|
| `NEXT_PUBLIC_SUPABASE_URL` | **URL do projeto** | Sempre começa com **`https://`** e termina com **`.supabase.co`** |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Chave **pública** (anon) | JWT longo começando com **`eyJ`** **ou**, no painel novo, chave **`sb_publishable_...`** (se a versão do `@supabase/supabase-js` / dashboard indicar uso dessa chave) |
| `SUPABASE_SERVICE_ROLE_KEY` | Chave **privada** (server only) | JWT `service_role` do Dashboard → API. **Obrigatória na Vercel (Production)** para estoque inicial no cadastro (`ajustar_estoque_manual` só com GRANT `service_role`). Nunca prefixo `NEXT_PUBLIC_`. |

### Erro comum (evite)

- Colocar o **JWT da anon key** ou **service_role** na linha `NEXT_PUBLIC_SUPABASE_URL`.
- Deixar **as duas linhas** com o **mesmo** valor — URL e key são **coisas diferentes**.

**Onde copiar a URL:** Supabase Dashboard → **Project Settings** → **API** → seção **Project URL** (ou **Data API** / URL base do projeto).

**Onde copiar a anon key:**

- Aba **Legacy anon, service_role API keys** → copiar **anon public** (JWT `eyJ...`), **ou**
- Aba de chaves novas → **Publishable key** (`sb_publishable_...`), conforme documentação da sua versão do cliente.

## Login do app (`/login`)

- O usuário precisa existir em **Authentication → Users** com o e-mail e senha que você usa.
- Precisa existir linha em **`public.usuarios`** com `id` = UUID do usuário do Auth (e `perfil` adequado).

### Seed automático (dev / E2E)

Com **`SUPABASE_SERVICE_ROLE_KEY`** no `.env.local`, rode `npm run seed:dev-users` para criar **GERENTE** e **OPERADOR** de teste e as linhas em `usuarios`. Detalhes: [SEED_DEV_E2E.md](./SEED_DEV_E2E.md).

## Edge Function `sync-outbox` (PDV local)

- Secrets **não** vão no `.env.local` do Next: use `npx supabase secrets set ...` ou o painel **Edge Functions → Secrets**.
- Ver [backend/supabase/README.md](../../backend/supabase/README.md).

## Módulo fiscal (caixa web → fila → `fiscal-worker`)

Variáveis no **`.env.local`** (ver também `.env.example` secção 4):

| Variável | Uso |
|----------|-----|
| `FISCAL_WORKER_ENDPOINT` | URL `https://<ref>.supabase.co/functions/v1/fiscal-worker` |
| `FISCAL_WORKER_KEY` | Mesmo valor do secret **`FISCAL_WORKER_KEY`** da Edge (header `X-FISCAL-WORKER-KEY`) |
| `AUTO_ENQUEUE_FISCAL_ON_SALE` | `true` para chamar a RPC `fiscal_enfileirar_documento_venda` após finalizar venda no `/caixa` |
| `FISCAL_DEFAULT_DOC_TYPE` | `NFC_E_STUB` (homologação sem provedor real), `NFCE` ou `NFE` quando a integração estiver pronta |

Com `AUTO_ENQUEUE_FISCAL_ON_SALE=true`, o comando **`npm run env:check`** exige `FISCAL_WORKER_ENDPOINT` e `FISCAL_WORKER_KEY` válidos (URL deve conter `fiscal-worker`).

**Ativação em produção com provedor real (ex.: Focus):** ordem de deploy, secrets `FISCAL_PROVIDER_*` na Edge e rollback — [docs/CHECKLIST_ATIVACAO_FOCUS_1_DIA.md](../../docs/CHECKLIST_ATIVACAO_FOCUS_1_DIA.md). Deploy geral: [docs/CHECKLIST_DEPLOY_SUPABASE.md](../../docs/CHECKLIST_DEPLOY_SUPABASE.md).

## Segurança

- **Nunca** commite `.env.local`, **service_role** nem `sb_secret_...`.
- **Não** cole senhas de usuário em arquivos do repositório nem no chat de IA.

## Depois de editar `.env.local`

Reinicie o servidor: `Ctrl+C` → `npm run dev`.
