# Contrato — pipeline de bip (scanner / leitura)

Este documento fixa **semântica e limites** do pipeline de leitura compartilhado entre runtimes.  
Implementação TypeScript: [`shared-core/src/pdv/scan-pipeline.ts`](../../shared-core/src/pdv/scan-pipeline.ts).

**ADR mestre:** [ADR-PDV-centro-de-gravidade.md](./adr/ADR-PDV-centro-de-gravidade.md).

**Reconnect, replay, ACK visual e telemetria vs UX:** [RECONNECT_REPLAY_POLICY.md](./RECONNECT_REPLAY_POLICY.md).

**Estados visuais (provisório / confirmado / reconciliado / falhado / cancelado):** [VISUAL_TRANSACTION_STATES.md](./VISUAL_TRANSACTION_STATES.md).

**Máquina de estados (`ScanState`), transições proibidas e invariantes de teste:** [SCAN_PIPELINE_STATE_MACHINE.md](./SCAN_PIPELINE_STATE_MACHINE.md).

**Handlers async (AbortSignal cooperativo):** [SCAN_HANDLER_ASYNC_CONTRACT.md](./SCAN_HANDLER_ASYNC_CONTRACT.md).

**PR 1.5:** tipos, `QueuedScan`, API do `ScanPipelineController` e backpressure **congelados**; runner serial e adapter web ainda **não** integrados.

---

## Objetivos

1. **Uma fila FIFO** por terminal: ordem de chegada preservada; **ordem lógica oficial** = `sequenceNumber` (monotónico no `enqueue`), não o timestamp.
2. **Um consumer único:** sem processamento concorrente invisível para leituras (implementação PR 2A).
3. **Entradas múltiplas** (detector HW, Enter no formulário, colar código) convergem para **o mesmo** `enqueue`.
4. **ACK perceptivo** conforme nível definido no ADR (A/B/C/D); não confundir com fiscal ou pagamento.

## Não objetivos (PR 1.5)

- Implementação do `while`/runner, adapter web ou alterações em `CaixaPageClient`.
- Virtualização da lista de itens ou otimização de store.

---

## Separação obrigatória: lifecycle humano × estágio técnico

| Conceito | Tipo | Uso |
|----------|------|-----|
| **Lifecycle operacional / UX** | `ScanState` | O que o operador e o overlay entendem: `queued` → `processing` → `pending_resolution` → `acknowledged` \| `failed` \| `cancelled` |
| **Detalhe do motor** | `ScanStage` | Passos internos: lookup, pricing, UI, foco, etc. |

**Erro clássico a evitar:** usar um único enum que mistura “operador espera” com “RPC X terminou”.

### `ScanState` (canónico)

| Estado | Significado |
|--------|-------------|
| `queued` | Aceite na fila, ainda não consumido pelo runner |
| `processing` | Runner a executar o handler (busca, RPC, atualização de carrinho, …) |
| `pending_resolution` | Efeito visível já aplicado mas preço/regras ainda reconciliam (política ADR) |
| `acknowledged` | ACK perceptivo oficial concluído (nível A/B/C/D no ADR) |
| `failed` | Falha tratada; motivo em `ScanFailureReason` / telemetria |
| `cancelled` | Removido ou abortado (shutdown, política de flush, etc.) |

### `ScanStage` (canónico)

Valores em código: `ingress`, `product_lookup_started`, `product_resolved`, `pricing_started`, `pricing_resolved`, `ui_ack`, `ui_cart_updated`, `focus_restored`, `failed`.  
São **subdivisões** reportáveis para telemetria e debug; não substituem `ScanState`.

---

## Entidade da fila: `QueuedScan`

Não enfileirar apenas `ScanEvent` cru. O item da fila é:

- `sequenceNumber` **obrigatório** (atribuído no `enqueue`) — suporte, burst tests, tracing humano, logs narrativos.
- `event` — `ScanEvent` (`id`, `codigo`, `receivedAt`, `meta`).
- `state`, `stage?`, `timestamps`, `attempts`.

### `ScanLifecycleTimestamps`

Marcos **serializáveis e observáveis** (não escondidos em closures):

- `enqueuedAt` — após aceite na fila (útil para medir atraso ingresso → fila).
- `processingStartedAt`, `processingFinishedAt`, `acknowledgedAt`, `failedAt`, `cancelledAt` — preenchidos pelo runner quando existir.

O instante de captura física continua em `event.receivedAt`.

---

## `ScanEvent` (ingresso)

Unidade **antes** da fila com número de sequência. `createScanEvent()` gera `id` e `receivedAt`; o **`sequenceNumber`** nasce apenas em `QueuedScan` no `enqueue`.

---

## Backpressure

Tipo `BackpressureStrategy`: `reject_new` | `drop_oldest` | `drop_newest`.

- **PR 2A:** implementação mínima esperada: `reject_new` alinhado à config.
- Estratégias `drop_*` devem estar **documentadas** (o que acontece ao item descartado, telemetria `scan_dropped`) antes de implementar.

`ScanPipelineConfig.maxQueueDepth` define o limite relevante para política de fila cheia.

---

## Política de pausa

`ScanPipelineConfig.enqueueWhilePaused` (padrão `false`):

- Se `false`: com `pause()` activo, `enqueue` falha com razão `pipeline_paused`.
- Se `true`: itens podem entrar na fila mas o consumer não avança até `resume()`.

`pause` / `resume` preparam reconnect, degradado e manutenção sem flags globais no React.

---

## `flush(options)`

Semântica tipada em `ScanPipelineFlushOptions`:

- `discardPending?: boolean` — se itens não processados são descartados vs processados até vazio (exactamente como o runner fará = PR 2A).
- `reason?: 'shutdown' | 'test' | 'manual'` — auditoria e testes.

**Nunca** assumir que “flush” = só “drain” sem ler estas opções.

---

## API do runtime: `ScanPipelineController`

Contrato **observável** (não “helper async”):

| Método | Papel |
|--------|--------|
| `enqueue` | Entrada única; devolve `sequenceNumber` em sucesso |
| `pause` / `resume` | Controlo do scheduler |
| `shutdown` | Encerramento do runner |
| `flush` | Ver secção acima |
| `isProcessing` | Há trabalho activo no item corrente |
| `getQueueDepth` | Apenas fila de **espera**; não inclui `currentScan`. |
| `getCurrentScan` | Item em **processamento** (cópia superficial para o observador). |
| `getSnapshot` | Estado síncrono |
| `subscribe` | `listener` + retorno `unsubscribe`; evita callbacks espalhados (DevTools, degradado, métricas) |

**Implementação:** `createScanPipelineController` em [`shared-core/src/pdv/scan-pipeline-runtime.ts`](../../shared-core/src/pdv/scan-pipeline-runtime.ts). Testes: [`scan-pipeline-runtime.spec.ts`](../../shared-core/src/pdv/scan-pipeline-runtime.spec.ts).

- `backpressureStrategy` != `reject_new`: erro na fábrica (ainda não suportado).
- `flush({ discardPending: false })` com `paused`: no-op.
- `shutdown`: descarta pendentes como `cancelled`, limpa listeners, `enqueue` falha com `pipeline_shutdown`; item em voo termina o handler sem AbortSignal.

---

## Handler e contexto

`ScanPipelineHandler` recebe `ScanProcessContext` com `scan: Readonly<QueuedScan>` (acesso a `sequenceNumber`, `event`, estado).  
O core **não** importa Supabase nem Tauri.

---

## Telemetria humana

Tipo `HumanTelemetryScanEvent` + `HumanTelemetryPayload` (inclui `sequenceNumber?` para correlacionar com logs operacionais).

Separar sempre **latência perceptiva** vs **latência de backend** (campos `*_duration_ms`).

---

## Adapters por runtime (PR 2B)

| Runtime | Responsabilidade |
|---------|------------------|
| `pdv-importados` | **`useCaixaScanPipeline`** + **`runWebCaixaScanProcess`** em [`app/caixa/scan-pipeline/`](../pdv-importados/app/caixa/scan-pipeline/) — detector e formulário chamam só `enqueue`; handler replica busca/preço/carrinho. |

---

## Adapters por runtime (evolução)

| Runtime | Responsabilidade |
|---------|------------------|
| `pdv-local` | Mesmos tipos; handler com SQLite / invoke |

---

## Referências legado (até integração)

- [CaixaPageClient.tsx](../pdv-importados/app/caixa/CaixaPageClient.tsx)
- [useScannerDetector.ts](../pdv-importados/hooks/useScannerDetector.ts)

---

## Changelog

| Data | Nota |
|------|------|
| 2026-05-12 | Versão inicial (PR1 — contrato + interfaces). |
| 2026-05-12 | **PR 1.5:** `ScanState` estendido (`pending_resolution`, `cancelled`), `ScanStage` técnico, `QueuedScan`, `sequenceNumber`, timestamps, `BackpressureStrategy`, `ScanPipelineFlushOptions`, API completa do controller, `subscribe`, `ScanProcessContext.scan`. |
| 2026-05-12 | **PR 2B:** caixa web — `useCaixaScanPipeline`, `runWebCaixaScanProcess`, `enqueue` a partir do scanner e do formulário. |
