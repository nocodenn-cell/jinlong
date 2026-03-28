# Sincronização PDV local (Tauri) ↔ Supabase

**Operação completa (deploy Edge, secrets, checklist de teste, caixa web vs desktop):** [`docs/CIRCUITO_OPERACIONAL.md`](../../../docs/CIRCUITO_OPERACIONAL.md) (raiz do monorepo).

## Fluxo

```
pdv-local (SQLite `outbox`) → POST sync-outbox (Edge, header X-SYNC-KEY) → PostgreSQL
```

Implementação Rust: `pdv-local/src-tauri/src/db.rs` (`sync_outbox_real`, `outbox_listar_pendentes`, …).

## Contrato HTTP

- **URL:** `SYNC_ENDPOINT` (ex.: `https://<ref>.supabase.co/functions/v1/sync-outbox`)
- **Header:** `X-SYNC-KEY: <SYNC_KEY>` (mesmo valor configurado com `supabase secrets set SYNC_KEY=...`)
- **Body:** `{ "events": [ { "id", "tipo", "payload_json", "created_at" } ] }`
- **Resposta:** `{ "ok": true, "processed": ["..."], "failed": [ { "id", "error" } ] }`

## Matriz evento → destino (nuvem)

| `tipo` (outbox)   | Tabelas / ação |
|-------------------|----------------|
| `VENDA_REGISTRADA` | `caixas` (ensure), `vendas`, `descontos_venda` (opcional), `itens_venda`, RPC `decrementar_estoque_idempotente` por item |
| `CAIXA_ABERTO`    | `caixas` (insert idempotente / ensure) |
| `CAIXA_FECHADO`   | `caixas` (UPDATE `status = FECHADO` se ainda `ABERTO`) |
| `MOVIMENTO_CAIXA` | `movimentos_caixa` (INSERT; `tipo` `SANGRIA` ou `SUPRIMENTO`) |

## Payloads gerados no PDV local (Rust)

- **CAIXA_ABERTO:** `{ id, operador_id, data_abertura, valor_inicial, status }`
- **CAIXA_FECHADO:** `{ id, data_fechamento, valor_fechamento }`
- **MOVIMENTO_CAIXA:** `{ id, caixa_id, tipo, valor, observacao, created_at }`
- **VENDA_REGISTRADA:** ver `registrar_venda_local` em `db.rs` (`venda_id`, `itens`, totais, …)

## Estoque

- Migration `007_estoque_baixa_idempotente.sql`: tabela `estoque_baixas` + função `decrementar_estoque_idempotente`.
- Reenvio do mesmo evento de venda não duplica baixa para o par `(venda_id, produto_id)`.

## Retentativas (outbox)

Colunas em `outbox` (SQLite): `falhas_consecutivas`, `next_retry_at`, `last_error`, `tentativas`, `status`.

- Resposta **`failed`** por item na Edge: incrementa `falhas_consecutivas`. Se **abaixo** de `OUTBOX_MAX_SYNC_FAILURES` (padrão **12**, configurável no `.env`), o item permanece **`PENDENTE`** com **`next_retry_at`** = `datetime('now', '+Δs')` (backoff **15s → 30s → … até 1h**). Só entra na lista enviada quando `next_retry_at` já passou (`outbox_listar_pendentes`).
- Ao atingir o máximo: **`ERRO`** (DLQ); não reenvia até **`outbox_reprocessar_dlq`** (comando Tauri + botão **Repor na fila** no PDV).
- Sucesso na Edge: `ENVIADO`, zera `falhas_consecutivas` e `next_retry_at`.
- Falha **HTTP de todo o lote** (timeout, 5xx, corpo inválido): os itens **não** são atualizados → seguem **`PENDENTE`** e serão tentados no próximo ciclo (timer 15s com caixa aberto).
