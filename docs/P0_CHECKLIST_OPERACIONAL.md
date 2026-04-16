# P0 — Checklist operacional (antes de produção)

Use este arquivo como **lista de verificação** em **cada** projeto Supabase (ex.: dev, staging, produção) e na **máquina do PDV desktop**.

Referência ampla: [CIRCUITO_OPERACIONAL.md](./CIRCUITO_OPERACIONAL.md).  
**Ambientes (dev/staging/prod), credenciais do PDV local e gates de release:** [AMBIENTES_E_RELEASE.md](./AMBIENTES_E_RELEASE.md).
**Fonte única para fechamento de segurança:** [SECURANCA_CHECKLIST_FECHAMENTO.md](./SECURANCA_CHECKLIST_FECHAMENTO.md).
**Fechamento de governança (P2):** [P2_GOVERNANCA_RLS_E_PENTEST.md](./P2_GOVERNANCA_RLS_E_PENTEST.md).

## Ordem sugerida (fechar o P0 sem pular dependência)

1. **§1** — `backend`: `supabase link` (se ainda não) → `migration list` → `db push` se faltar algo → `verify_p0_producao.sql` no SQL Editor (P0 até **010**; **011–013** relatórios; **014–015** RPCs/sync; **016–017** estoque atômico + auth na RPC segura; **018** tokens de gerente; **022** rate-limit por escopo; **023** finalização transacional com token de gerente; **024** anti-replay por nonce; **025** RPC canônica v2 — ver §1b–§1f).

**Smoke adicional 023 (desconto gerente por token):**

- Rodar `[backend/supabase/scripts/smoke_023_finalizar_venda_token_gerente.sql](../backend/supabase/scripts/smoke_023_finalizar_venda_token_gerente.sql)` no SQL Editor.
- Alternativa operacional (copy/paste por ambiente): `[backend/supabase/scripts/smoke_023_finalizar_venda_token_gerente_env.sql](../backend/supabase/scripts/smoke_023_finalizar_venda_token_gerente_env.sql)`.
- Esperado: cenário **token válido** conclui e consome token; **expirado** e **já usado** falham com erro esperado.

1. **§2** — `npx supabase functions deploy sync-outbox` → três **secrets** da function conferidos (Dashboard ou CLI). **Depois** do `db push` que inclui **014+** e mudanças na Edge no repositório, redeploy alinha batch, HMAC/`SYNC_KEY` e chamada a `decrementar_estoque_seguro`.
2. **§5** — `pdv-importados/.env.local` com `NEXT_PUBLIC`_* do **mesmo** projeto; deploy (Vercel/host) quando for o ambiente oficial.
3. **Escolha um caminho de teste** (marque o §4 ou o §4b abaixo):
  - **§4b (mínimo, só web):** operador em `/caixa` → **Finalizar venda** de teste → gerente em `/gerente/vendas` vê a linha → abrir **detalhe** (`/gerente/vendas/[id]`) e conferir itens / baixas. Exige **009** (RPC legada) e **010** (leitura `estoque_baixas` para gerente); caixa web usa **016** `decrementar_estoque_seguro` quando aplicada.
  - **§4 (com desktop):** além disso, **§3** (`pdv-local/.env` + `SYNC_`*) → catálogo → venda no Tauri → sync → mesma checagem no Supabase e na web.
4. Marcar os checkboxes deste arquivo para o ambiente (piloto/produção) que você chama de **oficial**.

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

- Coluna **Remote** deve refletir **todas** as migrations do repositório aplicadas **sem lacunas** na sequência do projeto (no monorepo atual, arquivos `001` … `043` em `backend/supabase/migrations/`; confira com `migration list` após `supabase link`). **009** + **015**: `decrementar_estoque_idempotente` para `authenticated` exige venda do operador; **service_role** sem essa restrição. **010**: `SELECT` em `estoque_baixas` para **GERENTE/DONO**. **014**: `registrar_venda_com_itens` (sync desktop). **015**: essa RPC só **service_role**. **016**: `decrementar_estoque_seguro` (FOR UPDATE + retorno estruturado). **017**: mesma regra de operador/service_role na RPC segura. **018**: tabela `tokens_desconto_gerente` para auditoria/revogação da `validar-gerente`. **024**: tabela `sync_request_nonces` (anti-replay HMAC). **025**: `finalizar_venda_transacional_canonica_v2` (fluxo unificado). **026+**: evoluções (config gerente, catálogo atacado, fiado/fiscal, RLS por loja, etc.) — manter remoto alinhado ao que está versionado antes de produção.
- Se faltar algo: `npx supabase db push` (e revisar erros).

**No SQL Editor** (dupla checagem): rode o script  
`[backend/supabase/scripts/verify_p0_producao.sql](../backend/supabase/scripts/verify_p0_producao.sql)`

- `descontos_venda` com **RLS ativo** e policies `descontos_venda`_*.
- Função `decrementar_estoque_idempotente` existente (legado; caixa/Edge preferem **016**).
- Tabela `estoque_baixas` existente.
- **001–010** aplicadas no projeto **produção** (e demais migrations até a última versionada no repositório, sem lacunas — ver parágrafo acima)
- **001–010** aplicadas em **staging/dev** (e o mesmo critério de sequência completa até a última migration usada pelo time)

**Migrations 011–013 (relatórios na web):** RPCs `relatorio_*_periodo` com `p_tz` validado; tabela `relatorio_settings` (fusos IANA); env `RELATORIO_TIMEZONE` no servidor prevalece sobre a tabela. O `verify_p0_producao.sql` inclui checagem na seção **5**.

- **011**, **012** e **013** aplicadas onde o gerente usa relatórios com intervalo de datas

### 1b. Migrations 014 e 015 (outbox + segurança)

Ordem: `db push` (aplica **014** depois **015**) → em seguida `functions deploy sync-outbox` (limite de 200 eventos por POST + `X-SYNC-KEY` em tempo constante).

- **014** — RPC `registrar_venda_com_itens` usada pela Edge no sync de vendas do PDV local.
- **015** — `registrar_venda_com_itens` **somente** `service_role`; `decrementar_estoque_idempotente` valida operador na venda para JWT `authenticated`.

Smoke rápido após **015**:

- **Web (§4b):** uma venda no `/caixa` deve concluir sem erro de RPC.
- **Desktop (§4):** sync da outbox após venda de teste; no Dashboard, `vendas` / `itens_venda` coerentes.

No SQL Editor, rode a seção **6** de `[verify_p0_producao.sql](../backend/supabase/scripts/verify_p0_producao.sql)` para confirmar privilégios.

- **014** e **015** aplicadas em **produção** (e staging/dev, se existirem)
- **sync-outbox** redeployada após **015**

### 1c. Migration 016 (estoque atômico - controle de concorrência)

A migration **016** cria a RPC `decrementar_estoque_seguro` que resolve **race conditions** no estoque quando dois caixas vendem o mesmo item simultaneamente.

**Mudanças principais:**

- Nova RPC `decrementar_estoque_seguro` com `SELECT FOR UPDATE` (bloqueio pessimista)
- Coluna `version` na tabela `estoque` (controle de concorrência otimista)
- Índice único em `estoque_baixas(venda_id, produto_id)` (garantia extra contra duplicatas)
- Retorno estruturado: `{ sucesso, mensagem, estoque_atual }`

**Mensagens de erro da nova RPC:**

- `ESTOQUE_INSUFICIENTE` — Quantidade solicitada maior que disponível
- `PRODUTO_NAO_ENCONTRADO_NO_ESTOQUE` — Produto não existe na tabela estoque
- `CONCORRENCIA_DETECTADA` — Outra transação modificou o estoque simultaneamente
- `BAIXA_JA_EXISTE` — Baixa já registrada (idempotente)

**Smoke test após 016:**

- **Web (§4b):** uma venda com múltiplos itens deve concluir sem erro de estoque
- **Desktop (§4):** sync de venda com vários itens; verificar se todas as baixas foram registradas
- Teste de concorrência: simular dois caixas tentando vender o último item (um deve receber erro de estoque insuficiente)

No SQL Editor, rode a seção **7** de `[verify_p0_producao.sql](../backend/supabase/scripts/verify_p0_producao.sql)` para confirmar a RPC e a coluna `version`.

- **016** aplicada em **produção** (e staging/dev, se existirem)
- **sync-outbox** redeployada após **016** (usa `decrementar_estoque_seguro`)

### 1d. Migration 017 (auth em `decrementar_estoque_seguro`)

A **017** reforça a RPC **016**: papel **authenticated** só decrementa se `p_venda_id` for de venda do **mesmo** `auth.uid()`; **service_role** (Edge) sem essa checagem.

- **017** aplicada após **016** em todos os ambientes
- **sync-outbox** redeployada se ainda estiver em versão anterior à que chama `decrementar_estoque_seguro`

### 1e. Migration 018 (tokens de desconto de gerente)

A **018** cria `tokens_desconto_gerente`, usada pela Edge `validar-gerente` para registrar tokens temporários com auditoria.

- **018** aplicada em todos os ambientes que usam `validar-gerente`

### 1f. Migrations 024 e 025 (anti-replay + fluxo unificado canônico)

- **024** cria `sync_request_nonces` (RLS ativo) para bloquear replay por `nonce`, com acesso apenas para `service_role`.
- **025** cria `finalizar_venda_transacional_canonica_v2` para rollout progressivo do fluxo unificado.

Valide no SQL Editor com `[verify_p0_producao.sql](../backend/supabase/scripts/verify_p0_producao.sql)` (seções 11+).

- **024** aplicada em todos os ambientes que usam `sync-outbox`
- **025** aplicada em todos os ambientes que usam rollout canário/unificado
- `verify_p0_producao.sql` executado e evidenciado (print/log) no ambiente oficial

---

## 2. Edge Function `sync-outbox`

**Deploy:**

```powershell
cd C:\Naturecode\fastproduct\backend
npx supabase functions deploy sync-outbox
```

**Secrets** (Dashboard → Edge Functions → `sync-outbox` → Secrets **ou** CLI):


| Secret                      | Conteúdo                                   |
| --------------------------- | ------------------------------------------ |
| `SUPABASE_URL`              | `https://<ref>.supabase.co`                |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role do **mesmo** projeto          |
| `SYNC_KEY`                  | Segredo forte (guarde também no PDV local) |


```powershell
npx supabase secrets set SUPABASE_URL="https://SEU_REF.supabase.co"
npx supabase secrets set SUPABASE_SERVICE_ROLE_KEY="(valor do painel)"
npx supabase secrets set SYNC_KEY="(segredo forte)"
```

- Function **deployada** na versão atual do repositório
- **Três** secrets definidos e iguais à intenção do `.env` local (item 3)
- Diagnóstico anti-replay executado com sucesso (`backend/scripts/sync-outbox-anti-replay-diagnostic.ps1`)
- Se o diagnóstico falhar com **`REPLAY_OR_DB_ERROR`** (HMAC válido) ou **`401`** em todas as chamadas: conferir **§2.6** em [CIRCUITO_OPERACIONAL.md](./CIRCUITO_OPERACIONAL.md) — migrations **024** (`sync_request_nonces`), **GRANT** a `service_role`, `SYNC_KEY` idêntico no cliente e na Edge, redeploy após alinhar o banco.

**Painel:** Edge Functions → `sync-outbox` → confirmar **Deployed** e URL típica  
`https://<ref>.supabase.co/functions/v1/sync-outbox`

---

## 3. PDV local (`pdv-local/.env`)

Arquivo **não versionado**; copie de `.env.example` e preencha com valores **reais**.


| Variável        | Deve ser                                             |
| --------------- | ---------------------------------------------------- |
| `SYNC_ENDPOINT` | `https://<ref>.supabase.co/functions/v1/sync-outbox` |
| `SYNC_KEY`      | **Idêntico** ao `SYNC_KEY` dos secrets da Edge.      |


- `.env` presente na raiz de `pdv-local`
- Reinício do app Tauri após alteração
- **Sincronizar catálogo** sem erro 401

---

## 4. Teste ponta a ponta (mínimo)

1. Desktop: **Sincronizar catálogo** → cache com produtos.
2. Desktop: **Abrir caixa** (ou fluxo que abre sessão).
3. Desktop: **Uma venda de teste** + **Finalizar**.
4. Aguardar sync (ou intervalo ~15 s com caixa aberto) / verificar fila e **DLQ** se necessário.
5. Supabase: tabelas `vendas`, `itens_venda` (e movimento de estoque conforme **007**).
6. Web: login gerente → `**/gerente/vendas`** — venda visível.

- Passos 1–6 OK no ambiente **oficial** de loja/piloto

### 4b. Teste mínimo só com caixa web (sem desktop / sem outbox)

Use quando o piloto ainda **não** inclui Tauri ou quando §2–§3 ainda não estão prontos.

1. Login como **OPERADOR** → `/caixa` (regras de preço e produtos carregando).
2. Incluir 1 item e **Finalizar venda** (forma de pagamento à escolha).
3. No Supabase: linhas em `vendas`, `itens_venda`; estoque coerente com a **007**.
4. Login **GERENTE/DONO** → `/gerente/vendas` — mesma venda na lista.

- Passos 1–4 OK (piloto **web-only**)

---

## 5. Web (`pdv-importados`)

- `.env.local` na Vercel/host com `NEXT_PUBLIC_*` do **mesmo** `ref`
- Deploy da aplicação apontando para esse projeto

---

## 6. CI / gate em PR (backend)

- Workflow **CI backend Supabase** (`.github/workflows/ci-backend-supabase.yml`) executa smoke de migrations + `deno check` da Edge.
- No GitHub do repositório: secrets `**SYNC_ENDPOINT`** (URL completa `.../functions/v1/sync-outbox`) e `**SYNC_KEY`** (igual ao secret da Edge) — usados pelo job `anti-replay-diagnostic-gate`.
- Com secrets preenchidos: o job roda `backend/scripts/sync-outbox-anti-replay-diagnostic.ps1` contra o ambiente apontado (validação ponta a ponta).
- **PR interno** que altera `sync-outbox` ou o script de diagnóstico **sem** esses secrets deve falhar no passo de validação (gate explícito).
- PRs de **fork**: o gate não exige secrets no fork; o diagnóstico só roda se o repositório base tiver secrets (comportamento esperado para não vazar `SYNC_KEY`).

---

## Resumo


| Área       | Ferramenta                                                                                                                                                                |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Migrations | `npx supabase migration list` + `verify_p0_producao.sql` (010 = P0; **011–013** relatórios; **014–017** sync + estoque seguro; **024–025** anti-replay + fluxo unificado) |
| Edge       | `functions deploy` + secrets                                                                                                                                              |
| Desktop    | `.env` + teste de venda                                                                                                                                                   |
| Web        | `.env.local` / Vercel + `/gerente/vendas`                                                                                                                                 |


O P0 operacional está **fechado** para um ambiente quando: **§1** e **§5** estão OK e você marcou **§4** *ou* **§4b**; e, se usar desktop, **§2** e **§3** também estão OK.