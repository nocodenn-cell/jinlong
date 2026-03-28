# Circuito operacional — PDV desktop → nuvem · caixa web vs desktop

Documento único para **deploy da Edge**, **secrets**, **teste ponta a ponta** e **papéis** dos dois caixas.

> **Sem projeto Supabase oficial ainda:** é válido **não** rodar agora a validação real da outbox, a prova venda desktop → nuvem nem o ajuste fino de secrets/Tauri — isso entra quando o P0 operacional for fechado no ambiente da loja. Detalhe: [P0_CHECKLIST_OPERACIONAL.md](./P0_CHECKLIST_OPERACIONAL.md) (bloco *Escopo adiado*).

---

## 1. Papel do caixa web (`pdv-importados` · `/caixa`) vs PDV desktop (`pdv-local`)

| | **Caixa web** (`/caixa`) | **PDV desktop** (Tauri) |
|---|---------------------------|---------------------------|
| **Quem usa** | OPERADOR logado no navegador (idealmente com internet). | Operador na frente de loja (Windows); funciona **offline-first** com cache SQLite. |
| **Catálogo e preços** | Lê **Supabase** ao vivo (`produtos`, `estoque`, `regras_preco`). Motor de preço no cliente (Zustand + `core`). | Cache local sincronizado (**Sincronizar catálogo**); mesmo tipo de regras em cache. |
| **Registro de venda** | **Finalizar venda** grava `vendas` / `itens_venda` e chama a RPC **`decrementar_estoque_idempotente`** (migrations **007** + **009** com `GRANT` a `authenticated`). Alternativa: fluxo desktop + outbox (abaixo). | **Grava venda em SQLite**, enfileira **outbox** e envia para a Edge **`sync-outbox`** (`SYNC_*`). |
| **Para relatórios / gerente** | Vendas gravadas pela web ou pelo desktop aparecem em `/gerente/*` após persistência no Postgres. | Após sync com sucesso, vendas e estoque refletem no Supabase. |

**Conclusão para operação:** o **desktop** continua indicado para **loja offline-first** e fila outbox. O **caixa web** passa a registrar venda direto no Postgres (com **009** aplicada). Exige **conexão** e o **mesmo modelo de dados** (`vendas`, itens, RPC de estoque).

---

## 2. Fechar o circuito: deploy da Edge `sync-outbox` e secrets

Pré-requisitos: **Docker não é obrigatório** para deploy remoto; projeto linkado (`npx supabase link --project-ref <ref>`) na pasta **`backend`**.

### 2.1 Publicar a function

```powershell
cd C:\Naturecode\fastproduct\backend
npx supabase functions deploy sync-outbox
```

### 2.2 Definir secrets da function (remoto)

A Edge precisa no mínimo (mesmos nomes que o código da function lê):

- `SUPABASE_URL` — URL `https://<ref>.supabase.co`
- `SUPABASE_SERVICE_ROLE_KEY` — **service_role** do projeto (painel → Settings → API)
- `SYNC_KEY` — segredo forte **compartilhado** com o PDV local (header `X-SYNC-KEY`)

Via CLI (a partir de **`backend`**, com `link` feito):

```powershell
npx supabase secrets set SUPABASE_URL="https://SEU_REF.supabase.co"
npx supabase secrets set SUPABASE_SERVICE_ROLE_KEY="(cole no terminal)"
npx supabase secrets set SYNC_KEY="(gere um segredo longo; guarde também no .env do PDV local)"
```

Ou use o painel: **Edge Functions → sync-outbox → Secrets**.

> Não commite `SYNC_KEY` nem `service_role` em arquivos versionados. Ver `pdv-importados/scripts/supabase-edge-secrets.example.ps1` como lembrete.

### 2.3 PDV local (`.env` na raiz de `pdv-local`)

| Variável | Valor |
|----------|--------|
| `SUPABASE_URL` | Igual ao projeto (REST para catálogo). |
| `SUPABASE_SERVICE_ROLE_KEY` | **Service role** (MVP do catálogo; máquina confiável). |
| `SYNC_ENDPOINT` | `https://<ref>.supabase.co/functions/v1/sync-outbox` |
| `SYNC_KEY` | **Exatamente** o mesmo `SYNC_KEY` dos secrets da Edge. |

Reinicie o app Tauri após alterar `.env`.

---

## 3. Teste ponta a ponta (checklist)

Lista numerada ampliada com caixas para marcar: [**P0_CHECKLIST_OPERACIONAL.md**](./P0_CHECKLIST_OPERACIONAL.md).  
Verificação SQL: [`backend/supabase/scripts/verify_p0_producao.sql`](../backend/supabase/scripts/verify_p0_producao.sql).

1. **Supabase:** migrations aplicadas (`db push`), inclusive **007** (estoque idempotente) e **008** (RLS `descontos_venda`).
2. **Edge:** `sync-outbox` deployada + secrets definidos.
3. **Desktop:** `.env` preenchido; **Sincronizar catálogo** com sucesso (sem 401).
4. **Desktop:** abrir caixa (ou deixar o fluxo de venda abrir automaticamente).
5. **Desktop:** realizar uma **venda de teste** e **Finalizar** (F5).
6. **Desktop:** aguardar sync automático (15 s com caixa aberto) ou conferir fila / **Repor na fila** se houver DLQ.
7. **Nuvem:** Supabase **Table Editor** — linhas em `vendas` / `itens_venda`; estoque alterado conforme regra **007**.
8. **Web gerente:** `/gerente/vendas` (ou `/gerente`) — venda aparece na lista.

Se o passo 7 falhar, ver logs da Edge (Dashboard) e coluna `last_error` na **outbox** local (SQLite) para eventos em DLQ.

---

## 4. Referências

- Contrato HTTP e outbox: `pdv-importados/core/sync/TAURI_SYNC.md`
- CLI migrations: `backend/supabase/README.md`
- Variáveis Next: `pdv-importados/docs/SUPABASE_ENV.md`
