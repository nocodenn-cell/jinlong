# C2.1 — Venda offline (outbox) × suspensão de vendas

Status: **investigação + proposta mínima. Nada implementado.** Pendência aberta após o PR-1 (#437).
Data dos fatos: 2026-09-30 (código do repositório + SELECT read-only em produção).

## 1. Requisito
O servidor precisa distinguir:
- **A.** venda criada offline **antes** da suspensão e sincronizada depois → deve ser aceita;
- **B.** venda criada **durante** a suspensão → deve ser recusada.

Restrição do produto: **sem GUC, bypass ou qualquer mecanismo que fure o trigger** de suspensão
(`trg_fn_vendas_caixa_aberto`, migration `20260930090100`).

## 2. Fluxo real hoje (documentado)
| Etapa | Onde | Fato |
|---|---|---|
| Origem | `pdv-local/src-tauri/src/db.rs:440-472` | Só o pdv-local (SQLite) alimenta o outbox; a venda web usa `finalizar_venda_transacional_canonica_v4`. |
| Payload `VENDA_REGISTRADA` | `db.rs:452-466` | Contém `venda_id`, `caixa_id`, totais, itens. **Não contém a data da venda** nem chave de idempotência própria. |
| Timestamp do evento | `db.rs:221` | `outbox.created_at = datetime('now')` (relógio local, UTC, sem fuso); vai no envelope `events[]`, coberto pelo HMAC da requisição. |
| Servidor | `sync-outbox/index.ts:672-735` (`processVenda`) | `ensureCaixaPdv` → RPC `registrar_venda_com_itens` (`:694`) → `ensure_venda_evento_registrado` (`:723`) → `decrementar_estoque_seguro`. **`ev.created_at` nunca é lido.** |
| INSERT em `vendas` | `registrar_venda_com_itens` (`20260903140000`) | Sem parâmetro de data. `vendas.created_at = now()` do servidor = **momento do sync**, não da venda. |
| Falha de regra | `index.ts:901-930`; `db.rs:78-92, 1389-1436` | Qualquer exceção do trigger vira `ERRO_RPC_REGISTRAR_VENDA: <msg>`; HTTP 200; retry 15 s → 1 h; após 12 falhas (`OUTBOX_MAX_SYNC_FAILURES`) status `ERRO` (DLQ **local**). Nada é apagado; `outbox_reprocessar_dlq` volta a `PENDENTE`. |
| Erro de regra × transitório | — | Não há distinção: `VENDAS_SUSPENSAS` consome as 12 tentativas como qualquer falha. |
| Marco da suspensão | `configuracoes_gerais` | **Sem trigger, sem histórico.** `atualizado_em` de `vendas_suspensas` em produção = 2026-06-01. Não existe "quando a suspensão começou". |
| Tabelas de outbox/DLQ no Postgres | — | Não existem para vendas (só `sync_request_nonces` e `documentos_fiscais_dlq`, fiscal). Fila e DLQ vivem no SQLite do PDV. |

### Comportamento resultante do PR-1
- Caso B (durante): recusado — correto.
- Caso A (antes): **também recusado** enquanto durar a suspensão; a venda **não é perdida** (segue no SQLite), mas
  1. após ~12 tentativas vai para `ERRO` e exige reprocesso manual;
  2. quando aceita, entra com `vendas.created_at` = data do sync (relatórios e comissões no dia errado).

## 3. Por que hoje é impossível distinguir A de B
O servidor não recebe nenhum dado sobre **quando** a venda ocorreu, e não guarda **quando** a suspensão começou.
Qualquer regra "antes/depois" exige as duas informações.

## 4. Proposta mínima (uma regra, um lugar)
Princípio: **a decisão continua no trigger de `vendas`, baseada em dados da própria linha** — sem GUC nem exceção
de sessão. O trigger passa a comparar *quando a venda foi criada* com *quando a suspensão começou*.

1. **Histórico da suspensão (fonte de verdade server-side).**
   Trigger em `configuracoes_gerais` (AFTER INSERT/UPDATE quando `chave='vendas_suspensas'`) grava em
   `suspensao_vendas_historico(id, iniciada_em, encerrada_em, motivo, usuario_id)`. Também corrige P3-22
   (`atualizado_em/por` não mudavam). *Um ou nenhum registro aberto por vez.*
2. **Data de criação preservada na venda.**
   `vendas.criada_em_origem timestamptz NULL` — preenchida só por vendas vindas do outbox; `NULL` = venda online
   (usa `now()`). Passa a ser também a data correta para relatórios/comissões de venda offline.
3. **Cliente envia a data.** `db.rs`: acrescentar `"criada_em"` (ISO-8601 UTC, gerada na **mesma transação SQLite**
   da venda) ao payload; `sync-outbox` repassa a `registrar_venda_com_itens` (novo parâmetro `p_criada_em`
   `DEFAULT NULL`, compatível com chamadores atuais).
4. **Regra no trigger** (substitui o teste atual):
   ```
   suspenso  := existe linha aberta em suspensao_vendas_historico
   permitido := NOT suspenso
                OR (NEW.criada_em_origem IS NOT NULL AND NEW.criada_em_origem < historico.iniciada_em)
   ```
5. **Limites de confiança no relógio do device** (validados em `registrar_venda_com_itens`, antes do INSERT):
   - `criada_em <= now() + 5 min` (skew) e `criada_em >= now() − janela_offline` (padrão 72 h, configurável);
   - monotonicidade por `terminal_id/caixa_id`: `criada_em` ≥ `criada_em` da última venda aceita do mesmo caixa;
   - HMAC do envelope (já existente) garante autoria do device e anti-replay.
   Toda venda aceita **durante** suspensão por esse caminho recebe alerta em `system_alerts`
   (`venda_offline_pos_suspensao`) para auditoria.
6. **Outbox trata `VENDAS_SUSPENSAS` como bloqueio temporário.**
   `sync-outbox` devolve um status distinto (ex.: `retry_later: SUSPENSA`) e o cliente
   (`outbox_marcar_falha_item_sync`, `db.rs`) **não incrementa `falhas_consecutivas`** para esse código → o evento
   espera a reativação em vez de cair em `ERRO`.

### Risco residual (assumido, documentar na revisão)
Um device **comprometido** pode falsificar `criada_em` para o passado dentro da janela. Mitigações: janela curta,
monotonicidade, HMAC, alerta obrigatório, trilha em `vendas.criada_em_origem`. Não há como provar o instante de uma
venda offline sem um relógio confiável no device; a proposta minimiza a superfície e torna o abuso **detectável**.

## 5. Alternativas descartadas
| Alternativa | Motivo |
|---|---|
| GUC de sessão / role especial do `sync-outbox` | Furar o trigger — vedado pelo produto. |
| Recusar tudo e só reprocessar depois | Mantém a venda A parada e sem data correta; depende de operação manual. |
| Comparar com `outbox.created_at` sem persistir | Não fica no banco; sem auditoria; não corrige relatórios. |

## 6. Arquivos que seriam alterados (PR C2.1)
- migration: `suspensao_vendas_historico` + trigger em `configuracoes_gerais`; `vendas.criada_em_origem`;
  `trg_fn_vendas_caixa_aberto`; `registrar_venda_com_itens` (+`p_criada_em`).
- `backend/supabase/functions/sync-outbox/index.ts` (repasse de `criada_em`; status `SUSPENSA`).
- `pdv-local/src-tauri/src/db.rs` (payload; `outbox_marcar_falha_item_sync`).
- testes: SQL (antes/durante/depois, janela, monotonicidade), contrato do `sync-outbox`
  (`backend/scripts/sync-outbox-contract-smoke.mjs`), teste Rust do backoff.

## 7. Decisões pendentes
1. Janela offline máxima (proposta: 72 h).
2. Alerta apenas ou também bloqueio quando `criada_em` fora da monotonicidade?
3. Reativação: reprocessar automaticamente o que ficou em `SUSPENSA`? (proposta: sim, no próximo ciclo de sync).
