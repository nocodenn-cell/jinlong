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

### 2.1 Migrations (anti-replay + RPC canônica v2)

Antes ou logo após o deploy da function, aplique as migrations remotas que incluem **024** (`sync_request_nonces`) e **025** (`finalizar_venda_transacional_canonica_v2`), por exemplo:

```powershell
cd C:\Naturecode\fastproduct\backend
npx supabase db push --linked
```

### 2.2 Publicar a function

O repositório define `verify_jwt = false` em `backend/supabase/functions/sync-outbox/config.toml` (autenticação via HMAC + `SYNC_KEY`). Na CLI:

```powershell
cd C:\Naturecode\fastproduct\backend
npx supabase functions deploy sync-outbox --no-verify-jwt
```

### 2.3 Definir secrets da function (remoto)

A Edge precisa no mínimo (mesmos nomes que o código da function lê):

- `SUPABASE_URL` — URL `https://<ref>.supabase.co`
- `SUPABASE_SERVICE_ROLE_KEY` — **service_role** do projeto (painel → Settings → API); fica **somente** nos secrets da Edge, nunca no desktop nem no bundle web.
- `SYNC_KEY` — segredo forte **compartilhado** com o PDV local (HMAC + header `X-SYNC-KEY`)

Via CLI (a partir de **`backend`**, com `link` feito):

```powershell
npx supabase secrets set SUPABASE_URL="https://SEU_REF.supabase.co"
npx supabase secrets set SUPABASE_SERVICE_ROLE_KEY="(cole no terminal)"
npx supabase secrets set SYNC_KEY="(gere um segredo longo; guarde também no .env do PDV local)"
```

Ou use o painel: **Edge Functions → sync-outbox → Secrets**.

> Não commite `SYNC_KEY` nem `service_role` em arquivos versionados. Ver `pdv-importados/scripts/supabase-edge-secrets.example.ps1` como lembrete.

### 2.4 Secrets opcionais (rollout fluxo unificado + gerente estrito)

Defina conforme a fase de rollout (ver também [AMBIENTES_E_RELEASE.md](./AMBIENTES_E_RELEASE.md) §4):

| Secret / env na Edge | Efeito |
|----------------------|--------|
| `USE_UNIFIED_SALES_FLOW` = `true` | Todas as vendas do outbox usam a RPC `finalizar_venda_transacional_canonica_v2`. |
| `CANARY_DEVICE_FINGERPRINTS` | Lista CSV (case-insensitive): só esses `x-device-fingerprint` usam o fluxo unificado; combine com `USE_UNIFIED_SALES_FLOW` desligado para canário. |
| `STRICT_MANAGER_DISCOUNT_AUTH` = `true` | Exige `desconto_gerente_token` na venda quando há desconto de gerente; o desktop obtém token via `POST ?op=validar_gerente` na mesma Edge (HMAC). |

### 2.5 PDV local (`.env` na raiz de `pdv-local`)

O catálogo, `pdv_config` e a outbox usam **apenas** a Edge `sync-outbox` com assinatura HMAC. **Não** coloque `SUPABASE_SERVICE_ROLE_KEY` no `.env` do desktop (ver `pdv-local/.env.example`).

| Variável | Valor |
|----------|--------|
| `SYNC_ENDPOINT` | `https://<ref>.supabase.co/functions/v1/sync-outbox` |
| `SYNC_KEY` | **Exatamente** o mesmo `SYNC_KEY` dos secrets da Edge. |
| `DEVICE_FINGERPRINT` | (Opcional, recomendado) Valor estável; deve coincidir com a canary list se usar `CANARY_DEVICE_FINGERPRINTS`. |

Reinicie o app Tauri após alterar `.env`.

---

## 3. Teste ponta a ponta (checklist)

Lista numerada ampliada com caixas para marcar: [**P0_CHECKLIST_OPERACIONAL.md**](./P0_CHECKLIST_OPERACIONAL.md).  
Verificação SQL: [`backend/supabase/scripts/verify_p0_producao.sql`](../backend/supabase/scripts/verify_p0_producao.sql).

1. **Supabase:** migrations aplicadas (`db push`), inclusive **007** (estoque idempotente), **008** (RLS `descontos_venda`), **024** (nonces anti-replay) e **025** (RPC canônica v2).
2. **Edge:** `sync-outbox` deployada + secrets obrigatórios (§2.3); opcionalmente flags §2.4 conforme rollout.
3. **Diagnóstico (recomendado):** a partir de `backend`, com `SYNC_ENDPOINT` e `SYNC_KEY` no ambiente:  
   `.\scripts\sync-outbox-anti-replay-diagnostic.ps1`  
   Para incluir `validar_gerente`: defina `SYNC_DIAG_GERENTE_SENHA` ou `-ValidarGerenteSenha` (não versionar a senha).
4. **Desktop:** `.env` só com `SYNC_*` (+ opcionais do exemplo); **Sincronizar catálogo** e **sincronizar pdv_config** com sucesso (sem 401).
5. **Desktop:** abrir caixa (ou deixar o fluxo de venda abrir automaticamente).
6. **Desktop:** realizar uma **venda de teste** simples e **Finalizar** (F5); confirmar sync da outbox.
7. **Smoke desconto gerente (com fluxo unificado / estrito):** com rede, aplicar **Desconto especial (gerente)** (o app chama `validar_gerente` na Edge e grava o token na venda). Com `STRICT_MANAGER_DISCOUNT_AUTH=true`, uma venda com desconto **sem** token deve falhar na Edge; com token, deve concluir. Com canário, use o mesmo `DEVICE_FINGERPRINT` no `.env` que está em `CANARY_DEVICE_FINGERPRINTS`.
8. **Desktop:** aguardar sync automático ou conferir fila / DLQ.
9. **Nuvem:** **Table Editor** — `vendas` / `itens_venda`; estoque coerente com a RPC em uso (legada ou v2).
10. **Web gerente:** `/gerente/vendas` (ou `/gerente`) — venda aparece na lista.

Se a persistência na nuvem falhar, ver logs da Edge (Dashboard) e coluna `last_error` na **outbox** local (SQLite) para eventos em DLQ.

---

## 4. Referências

- Contrato HTTP e outbox: `pdv-importados/core/sync/TAURI_SYNC.md`
- CLI migrations: `backend/supabase/README.md`
- Variáveis Next: `pdv-importados/docs/SUPABASE_ENV.md`
