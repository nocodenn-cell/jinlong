# P0 — Checklist operacional (antes de produção)

Use este arquivo como **lista de verificação** em **cada** projeto Supabase (ex.: dev, staging, produção) e na **máquina do PDV desktop**.

Referência ampla: [CIRCUITO_OPERACIONAL.md](./CIRCUITO_OPERACIONAL.md).

### Escopo adiado até o P0 “de verdade” (projeto Supabase real)

Pode-se continuar desenvolvendo no repositório **sem** executar agora:

- **Validar sync real da outbox** (eventos saindo do SQLite e sendo processados pela Edge em ambiente oficial).
- **Provar venda desktop → nuvem** (uma venda fechada no Tauri aparecendo em `vendas` / `itens_venda` no Postgres do projeto de loja).
- **Ajustar secrets e `.env` do Tauri com o projeto real** (`SYNC_KEY`, `SYNC_ENDPOINT`, service role, mesmo `ref` da web).

Esses três itens **são o núcleo** das seções **2–4** abaixo quando o ambiente já for o **oficial** (piloto/produção). Até lá, deixe os checkboxes em aberto por decisão consciente — não são falha do código local.

---

## 1. Migrations 001 → 009 no banco remoto

**No PC (pasta `backend`, com `supabase link` apontando para o ambiente certo):**

```powershell
cd C:\Naturecode\fastproduct\backend
npx supabase migration list
```

- Coluna **Remote** deve listar `001` … `009` sem lacunas. A **`009`** concede `GRANT EXECUTE` na RPC `decrementar_estoque_idempotente` para o papel **`authenticated`** (caixa web com Server Action).
- Se faltar algo: `npx supabase db push` (e revisar erros).

**No SQL Editor** (dupla checagem): rode o script  
[`backend/supabase/scripts/verify_p0_producao.sql`](../backend/supabase/scripts/verify_p0_producao.sql)

- `descontos_venda` com **RLS ativo** e policies `descontos_venda_*`.
- Função **`decrementar_estoque_idempotente`** existente.
- Tabela **`estoque_baixas`** existente.

- [ ] **001–009** aplicadas no projeto **produção**
- [ ] **001–009** aplicadas em **staging/dev** (se existirem)

---

## 2. Edge Function `sync-outbox`

**Deploy:**

```powershell
cd C:\Naturecode\fastproduct\backend
npx supabase functions deploy sync-outbox
```

**Secrets** (Dashboard → Edge Functions → `sync-outbox` → Secrets **ou** CLI):

| Secret | Conteúdo |
|--------|----------|
| `SUPABASE_URL` | `https://<ref>.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role do **mesmo** projeto |
| `SYNC_KEY` | Segredo forte (guarde também no PDV local) |

```powershell
npx supabase secrets set SUPABASE_URL="https://SEU_REF.supabase.co"
npx supabase secrets set SUPABASE_SERVICE_ROLE_KEY="(valor do painel)"
npx supabase secrets set SYNC_KEY="(segredo forte)"
```

- [ ] Function **deployada** na versão atual do repositório
- [ ] **Três** secrets definidos e iguais à intenção do `.env` local (item 3)

**Painel:** Edge Functions → `sync-outbox` → confirmar **Deployed** e URL típica  
`https://<ref>.supabase.co/functions/v1/sync-outbox`

---

## 3. PDV local (`pdv-local/.env`)

Arquivo **não versionado**; copie de `.env.example` e preencha com valores **reais**.

| Variável | Deve ser |
|----------|----------|
| `SUPABASE_URL` | Mesmo host que `NEXT_PUBLIC_SUPABASE_URL` do Next (projeto oficial). |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role desse projeto (MVP; máquina confiável). |
| `SYNC_ENDPOINT` | `https://<ref>.supabase.co/functions/v1/sync-outbox` |
| `SYNC_KEY` | **Idêntico** ao `SYNC_KEY` dos secrets da Edge. |

- [ ] `.env` presente na raiz de `pdv-local`
- [ ] Reinício do app Tauri após alteração
- [ ] **Sincronizar catálogo** sem erro 401

---

## 4. Teste ponta a ponta (mínimo)

1. Desktop: **Sincronizar catálogo** → cache com produtos.
2. Desktop: **Abrir caixa** (ou fluxo que abre sessão).
3. Desktop: **Uma venda de teste** + **Finalizar**.
4. Aguardar sync (ou intervalo ~15 s com caixa aberto) / verificar fila e **DLQ** se necessário.
5. Supabase: tabelas `vendas`, `itens_venda` (e movimento de estoque conforme **007**).
6. Web: login gerente → **`/gerente/vendas`** — venda visível.

- [ ] Passos 1–6 OK no ambiente **oficial** de loja/piloto

---

## 5. Web (`pdv-importados`)

- [ ] `.env.local` na Vercel/host com `NEXT_PUBLIC_*` do **mesmo** `ref`
- [ ] Deploy da aplicação apontando para esse projeto

---

## Resumo

| Área | Ferramenta |
|------|------------|
| Migrations | `npx supabase migration list` + `verify_p0_producao.sql` (inclui checagens até 009 — caixa web / RPC) |
| Edge | `functions deploy` + secrets |
| Desktop | `.env` + teste de venda |
| Web | `.env.local` / Vercel + `/gerente/vendas` |

Quando **todos** os itens `[ ]` estiverem marcados para o ambiente de **produção**, o P0 operacional está fechado para esse projeto.
