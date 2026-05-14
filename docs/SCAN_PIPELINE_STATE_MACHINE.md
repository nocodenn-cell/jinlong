# Máquina de estados — `ScanState` (pipeline de bip)

Contrato de **transições válidas e proibidas** para o motor serial. **Enforcement** em código: [`shared-core/src/pdv/scan-pipeline-transitions.ts`](../shared-core/src/pdv/scan-pipeline-transitions.ts) (`transitionQueuedScanToProcessing`, `applyScanProcessingCompletion`, `transitionDiscardedQueuedScanToCancelled`).  
O arquivo `scan-pipeline-runtime.ts` orquestra fila/abort; **não** deve atribuir estados terminais nem `processingFinishedAt` fora do módulo de transições.

Complementa [`CONTRATO_PIPELINE_BIP.md`](./CONTRATO_PIPELINE_BIP.md) (tipos e fila), [`VISUAL_TRANSACTION_STATES.md`](./VISUAL_TRANSACTION_STATES.md) (camadas de UX) e [`SCAN_HANDLER_ASYNC_CONTRACT.md`](./SCAN_HANDLER_ASYNC_CONTRACT.md) (handlers cooperativos).

---

## 1. Estados terminais vs não terminais

| Estado | Terminal? |
|--------|-----------|
| `queued` | Não |
| `processing` | Não |
| `pending_resolution` | Não — **congelado** | Ver §1.1 |

### 1.1 `pending_resolution` (política anti-apodrecimento)

O valor existe no tipo partilhado `ScanState` por compatibilidade com o ADR / ecossistema. **Não** introduzir ramos no motor nem em `isAllowedScanStateTransition` até existir, no mesmo PR ou épico:

1. Evento de entrada e de saída na telemetria (nomes estáveis).  
2. Painel / dashboard mínimo.  
3. Cenário dourado + invariante.

Até lá, tratar como **vocabulário reservado** — a tabela “futuro” abaixo é desenho, não comportamento ativo.

---
| `acknowledged` | **Sim** |
| `failed` | **Sim** |
| `cancelled` | **Sim** |

Um `QueuedScan` **não** deve receber mais de uma atribuição de estado terminal (sem “segundo término”).

---

## 2. Transições válidas (motor PR 2A)

Hoje o runtime encaminha transições **apenas** via `scan-pipeline-transitions.ts` (o `runLoop` não escreve estados terminais inline):

| De | Para | Gatilho |
|----|------|---------|
| `queued` | `processing` | `transitionQueuedScanToProcessing` — runner inicia o handler |
| `queued` | `cancelled` | `transitionDiscardedQueuedScanToCancelled` — `flush({ discardPending: true })` |
| `processing` | `acknowledged` | `applyScanProcessingCompletion` + `{ ok: true }` |
| `processing` | `failed` | `applyScanProcessingCompletion` + falha ≠ `aborted` |
| `processing` | `cancelled` | `applyScanProcessingCompletion` + `aborted` cooperativo |

**Futuro (adapter / reconciliação de preço):** quando existir `pending_resolution` no runner:

| De | Para | Gatilho (orientador) |
|----|------|------------------------|
| `processing` | `pending_resolution` | Efeito visível aplicado; RPC/regras ainda em voo |
| `pending_resolution` | `acknowledged` | ACK perceptivo + reconciliação OK |
| `pending_resolution` | `failed` | Falha reconciliável |
| `pending_resolution` | `cancelled` | Novo cupom / flush / shutdown conforme política |

---

## 3. Transições **proibidas** (bugs típicos)

| Transição | Porquê é grave |
|-----------|------------------|
| Qualquer terminal → qualquer (exceto novo scan) | Dupla finalização, métricas duplicadas, UX incoerente |
| `acknowledged` → `failed` / `cancelled` | “Apagou” sucesso já mostrado ao operador |
| `failed` → `acknowledged` | Efeito tardio fantasma |
| `cancelled` → `processing` | Scan morto a “voltar” |
| `queued` → `acknowledged` / `failed` | Saltou o handler (mutex/telemetria mentem) |

O módulo `applyScanProcessingCompletion` valida origem `processing`, emite telemetria de término e aplica o estado terminal; se o estado já não for `processing`, emite **`double_finalize_attempt`** e devolve falha (defesa reativa + **único** escritor de marcos de conclusão).

---

## 4. Janela de inicialização (`currentRunAbort`)

Entre “item tornou-se `currentScan`” e “`AbortController` ativo + handler no primeiro `await`” o código é **síncrono** no mesmo tick em condições normais, mas **testes não devem** depender de “N microtasks”: devem esperar `getCurrentScan()?.state === 'processing'` (ou equivalente) antes de `shutdown`/`flush` que abortam o atual.

Invariante operacional: **`shutdown` + `flush(discardPending)` não deixam item em `processing` sem conclusão** — o handler em curso é abortado cooperativamente (`AbortSignal`) ou o item nunca chegou a `processing` (cancelado na fila). Handlers que **ignoram** o `signal` podem bloquear o runner (comportamento esperado; adapter deve cooperar).

---

## 5. Testes

- Cenários dourados: `shared-core/src/pdv/scan-pipeline-golden.spec.ts`
- Invariantes (sem órfão, telemetria de término única): `shared-core/src/pdv/scan-pipeline-invariants.spec.ts`
- Transições unitárias (`isAllowed…`, double finalize, `buildScanTimeline`): `shared-core/src/pdv/scan-pipeline-transitions.spec.ts`

---

## 6. Timeline mental (“event sourcing” leve)

Para debug e testes, [`buildScanTimeline`](../shared-core/src/pdv/scan-pipeline-timeline.ts) reconstrói a ordem dos eventos por `scanId` a partir de payloads já recolhidos (ex.: spy de `emitTelemetry`). Revela gaps e efeitos tardios sem UI.

---

## 7. Diagnóstico operacional (frente futura, não UI)

Métricas / alertas úteis quando a telemetria estiver agregada:

- Scan **preso** em `processing` > X ms (p95/p99 por terminal).
- `processing` sem `scan_processing_finished` correlacionado.
- Profundidade de fila a crescer de forma sustentada.
- Taxa de `abort` + `double_finalize_attempt`.
- Rajadas de `stale_cupom` e `scans_cancelled_on_new_cupom`.

Objetivo: responder **“qual invariante degradou?”** em vez de só “CPU subiu”.

---

## 8. `currentRunAbort` (ownership)

Referência explícita ao cancelamento do **run atual** é saudável. Se a lógica de abort se espalhar por vários donos ou múltiplos controllers, considerar extrair uma entidade de “run token” no runtime — **não urgente**, mas sinal a acompanhar com o crescimento do pipeline.

---
