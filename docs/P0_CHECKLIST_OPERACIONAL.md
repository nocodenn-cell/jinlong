# P0 — Checklist operacional (antes de produção)

Use este arquivo como **lista de verificação** em **cada** projeto Supabase (ex.: dev, staging, produção) e na **máquina do PDV desktop**.

Referência ampla: [CIRCUITO_OPERACIONAL.md](./CIRCUITO_OPERACIONAL.md).

## Ordem sugerida (fechar o P0 sem pular dependência)

1. **§1** — `backend`: `supabase link` (se ainda não) → `migration list` → `db push` se faltar algo → `verify_p0_producao.sql` no SQL Editor (P0 até **010**; **011–013** para relatórios, `p_tz` IANA e `relatorio_settings` / env `RELATORIO_TIMEZONE`).
2. **§2** — `npx supabase functions deploy sync-outbox` → três **secrets** da function conferidos (Dashboard ou CLI).
3. **§5** — `pdv-importados/.env.local` com `NEXT_PUBLIC_*` do **mesmo** projeto; deploy (Vercel/host) quando for o ambiente oficial.
4. **Escolha um caminho de teste** (marque o §4 ou o §4b abaixo):
   - **§4b (mínimo, só web):** operador em `/caixa` → **Finalizar venda** de teste → gerente em `/gerente/vendas` vê a linha → abrir **detalhe** (`/gerente/vendas/[id]`) e conferir itens / baixas. Exige **009** (RPC) e **010** (leitura `estoque_baixas` para gerente).
   - **§4 (com desktop):** além disso, **§3** (`pdv-local/.env` + `SYNC_*`) → catálogo → venda no Tauri → sync → mesma checagem no Supabase e na web.
5. Marcar os checkboxes deste arquivo para o ambiente (piloto/produção) que você chama de **oficial**.

### O que é obrigatório em qualquer piloto

- **§1** e **§5** sempre.  
- **§2 e §3** só se você for usar o **PDV desktop** e a **outbox** contra a Edge.

---

## 1. Migrations 001 → 010 no banco remoto

**No PC (pasta `backend`, com `supabase link` apontando para o ambiente certo):**

```powershell
cd C:\Naturecode\fastproduct\backend
npx supabase migration list
```

- Coluna **Remote** deve listar `001` … `010` sem lacunas. A **`009`** concede `GRANT EXECUTE` na RPC `decrementar_estoque_idempotente` para o papel **`authenticated`** (caixa web com Server Action). A **`010`** adiciona `SELECT` em **`estoque_baixas`** para **GERENTE/DONO** (detalhe da venda na web).
- Se faltar algo: `npx supabase db push` (e revisar erros).

**No SQL Editor** (dupla checagem): rode o script  
[`backend/supabase/scripts/verify_p0_producao.sql`](../backend/supabase/scripts/verify_p0_producao.sql)

- `descontos_venda` com **RLS ativo** e policies `descontos_venda_*`.
- Função **`decrementar_estoque_idempotente`** existente.
- Tabela **`estoque_baixas`** existente.

- [ ] **001–010** aplicadas no projeto **produção**
- [ ] **001–010** aplicadas em **staging/dev** (se existirem)

**Migrations 011–013 (relatórios na web):** RPCs `relatorio_*_periodo` com **`p_tz`** validado; tabela **`relatorio_settings`** (fusos IANA); env **`RELATORIO_TIMEZONE`** no servidor prevalece sobre a tabela. O `verify_p0_producao.sql` inclui checagem na seção **5**.

- [ ] **011**, **012** e **013** aplicadas onde o gerente usa relatórios com intervalo de datas

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

### 4b. Teste mínimo só com caixa web (sem desktop / sem outbox)

Use quando o piloto ainda **não** inclui Tauri ou quando §2–§3 ainda não estão prontos.

1. Login como **OPERADOR** → `/caixa` (regras de preço e produtos carregando).
2. Incluir 1 item e **Finalizar venda** (forma de pagamento à escolha).
3. No Supabase: linhas em `vendas`, `itens_venda`; estoque coerente com a **007**.
4. Login **GERENTE/DONO** → `/gerente/vendas` — mesma venda na lista.

- [ ] Passos 1–4 OK (piloto **web-only**)

---

## 5. Web (`pdv-importados`)

- [ ] `.env.local` na Vercel/host com `NEXT_PUBLIC_*` do **mesmo** `ref`
- [ ] Deploy da aplicação apontando para esse projeto

---

## Resumo

| Área | Ferramenta |
|------|------------|
| Migrations | `npx supabase migration list` + `verify_p0_producao.sql` (010 = P0; **011–013** = relatórios + `p_tz` / settings, seção 5) |
| Edge | `functions deploy` + secrets |
| Desktop | `.env` + teste de venda |
| Web | `.env.local` / Vercel + `/gerente/vendas` |

O P0 operacional está **fechado** para um ambiente quando: **§1** e **§5** estão OK e você marcou **§4** *ou* **§4b**; e, se usar desktop, **§2** e **§3** também estão OK.
