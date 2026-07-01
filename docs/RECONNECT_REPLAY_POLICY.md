# Política formal: reconnect, replay e semântica operacional (PDV caixa / pipeline de bip)

Este documento fixa **semântica** e **limites** para evitar *retry implícito* e drift entre PRs. Complementa `docs/CONTRATO_PIPELINE_BIP.md` (fila/mutex), `docs/SCAN_PIPELINE_STATE_MACHINE.md` (transições `ScanState` / dupla finalização), `docs/SCAN_HANDLER_ASYNC_CONTRACT.md` (handlers cooperativos), `docs/VISUAL_TRANSACTION_STATES.md` (estados visuais) e o contrato de telemetria em `shared-core` (`schemaVersion`, `HumanTelemetryPayload`).

**Público:** implementação web (`pdv-importados`), runtime (`shared-core`), ingestão (`/api/caixa/scan-telemetry`), operações.

---

## 0. Documento vivo (não deixar ficar obsoleto)

Este documento é **contrato operacional**: quando divergir do código, o código está errado **ou** o documento está errado — nunca os dois em silêncio.

### 0.1 Quando **obrigatório** atualizar este doc (e o changelog no §11)

Qualquer PR que toque em **qualquer** dos seguintes **deve** incluir diff em `docs/RECONNECT_REPLAY_POLICY.md` (e, se aplicável, em `docs/VISUAL_TRANSACTION_STATES.md` ou `docs/CONTRATO_PIPELINE_BIP.md`):

- retry / replay / idempotência
- ACK visual ou orçamento perceptivo do bip
- `flush`, `shutdown`, `AbortSignal`, timeout por etapa
- `stale_cupom`, `aborted`, `cancelled`, novos `ScanFailureReason`
- telemetria que altere semântica (`HumanTelemetryScanEvent`, `schemaVersion`, sampling)
- `cupomSessionId` / `correlationId` / ownership de contexto
- transições de `ScanState` no motor (`shared-core/src/pdv/scan-pipeline-transitions.ts`) ou contrato de handler async (`docs/SCAN_HANDLER_ASYNC_CONTRACT.md`)

**Checklist de PR:** ver `.github/pull_request_template.md` (seção *Pipeline operacional / caixa*).

### 0.2 Cenários dourados (regressão semântica)

Testes automatizados mínimos:

- `shared-core/src/pdv/scan-pipeline-golden.spec.ts`
- `shared-core/src/pdv/scan-pipeline-invariants.spec.ts`
- `shared-core/src/pdv/scan-pipeline-transitions.spec.ts`
- `pdv-importados/app/caixa/scan-pipeline/webCaixaScanProcess.test.ts`

Cenários **suspend/resume de aba**, **reconnect de rede real** e **scanner HW + Enter** no mesmo instante: **Playwright** (fora do Vitest) — quando existirem, referenciar aqui e no `VISUAL_TRANSACTION_STATES.md`.

### 0.3 Limite operacional conhecido (ingestão OLTP atual)

| Faixa orientadora | Arquitetura atual (`POST` + Postgres) |
|-------------------|----------------------------------------|
| Até ~**50k–150k** eventos/dia/loja (com sampling agressivo e batches pequenos) | Típicamente sustentável com índices da migração `097` e retenção curta (§9). |
| Acima disso | Planear **agregação assíncrona**, **edge ingestion**, fila dedicada ou **time-series** (ver §9 e comentários na migração `096`). |

Valores são **ordens de grandeza** — medir no vosso ambiente e ajustar; o importante é **não** crescer volume sem política de custo.

### 0.4 Fronteira `shared-core` (protecção contra drift)

**Não** introduzir em `shared-core`: Supabase, toast, carrinho Zustand, pricing de domínio, auth de sessão. Mantêm-se no **adapter** (`pdv-importados`) e na **rota**. O runtime continua **infraestrutura reutilizável**.

### 0.5 Novos estados (disciplina)

Cada novo `ScanState`, estágio visual ou evento de telemetria deve justificar: impacto operacional, observabilidade, replay, UX e persistência — ver `VISUAL_TRANSACTION_STATES.md` §3.

### 0.6 Dashboards (primeiros gráficos úteis)

Prioridade **operador**, não CPU: `scan_to_visual_ack_ms` (p95), `queue_depth_peak` por terminal, `scan_processing_aborted`, taxa `stale_cupom`, `pricing_rpc_duration_ms`, `scans_cancelled_on_new_cupom`, taxa `queue_full`. **Auth/refresh** e **RPC degradado** tendem a aparecer aqui antes de gargalos React.

---

## 1. Vocabulário já existente (não reinterpretar)

| Primitivo | Papel |
|-----------|--------|
| `sequenceNumber` | Ordem **monotónica por sessão de terminal** no pipeline de bip (não é ordem global multi-loja). |
| `cupomSessionId` | **Contexto operacional** do cupom (novo cupom ⇒ novo id). Autoridade para *ownership* de mutação de carrinho. |
| `correlationId` | **Fluxo observável** (trace, sub-fluxo, retry explícito). **Não** é sinónimo permanente de `cupomSessionId`. Hoje o caixa pode duplicar o valor por pragmatismo; isso **não** é contrato eterno. |
| `schemaVersion` | Revisão do formato `HumanTelemetryPayload` para compatibilidade de ingestão/agregação. |
| `scanId` | Identidade estável da **leitura** (UUID). |
| `AbortSignal` | Cancelamento **cooperativo** (flush, shutdown, novo cupom). |
| `stale_cupom` | Scan enfileirado para outro `cupomSessionId` que o ativo; **sem toast** (evita fantasmas UX). |
| `cancelled` / `aborted` | Ver seção 4 e taxonomia. |

---

## 2. ACK visual (definição oficial)

**ACK visual** = o operador recebeu feedback **perceptível** de resultado da leitura **nesse** `cupomSessionId`, **após** as etapas que alteram percepção (toast/banner de sucesso ou aviso pós-add).

- O evento de telemetria `scan_to_visual_ack_ms` mede **latência humana** até esse momento (`receivedAt` → instante do ACK).
- **ACK visual não implica** persistência remota de telemetria, nem sucesso de RPC de preço, nem commit fiscal.
- **Regra arquitetural:** a telemetria **não** participa do **orçamento perceptivo** do bip: nunca `await` ingestão remota no caminho crítico até o ACK visual; falha de `POST /api/caixa/scan-telemetry` **não** bloqueia bip nem UX (buffer + `keepalive` + fire-and-forget).

---

## 3. Retryável vs não-retryável (domínio caixa / bip)

Decisão por **tipo de operação**, não por “deu erro genérico”.

| Operação | Retryável? | Notas |
|----------|------------|--------|
| `buscarProdutoParaCaixa` (lookup) | Sim, com limite | Idempotente em termos de *leitura*; não muta cupom até decisão explícita. |
| `aplicarPrecoRpcParaLinha` | **Condicional** | Só se ainda for o mesmo `cupomSessionId`, mesma linha lógica e não houver `stale_cupom` / abort. |
| Mutação de carrinho (`adicionarItem` após validação) | **Não** “retry cego” | Segunda execução pode duplicar linha; repetir exige idempotência explícita (chave de negócio), fora do escopo do pipeline genérico. |
| Enfileirar telemetria | Sim (best-effort) | Pode perder eventos; não pode bloquear UX. |
| Flush / novo cupom | Não é “retry” | É **nova** autoridade de contexto; scans antigos devem falhar com `stale_cupom` ou `aborted`. |

---

## 4. Replay: permitido vs proibido

| Cenário | Replay? |
|---------|---------|
| Reenviar **o mesmo** `scanId` com o **mesmo** `cupomSessionId` após falha de rede **antes** de mutação de carrinho | Permitido **apenas** se o handler for puro até o ponto de mutação e a operação for declarada idempotente. |
| Reenviar leitura após **ACK visual** de sucesso | **Proibido** sem regra de negócio explícita (risco de duplicata). |
| “Replay” de evento de telemetria perdido no `POST` | **Não** altera domínio; pode enfileirar offline/buffer (futuro). |

**Regra de ouro:** replay de **domínio** (carrinho/preço) exige **idempotência por chave de negócio** documentada por operação; o pipeline sozinho **não** assume replay seguro.

---

## 5. Comportamento explícito por cenário de risco

### 5.1 `POST` de telemetria falha

- **UX / bip:** sem impacto; nenhum await no caminho crítico.
- **Dados:** eventos podem ser perdidos; aceitável na fase atual com sampling.
- **Futuro:** fila local, `sendBeacon`/`keepalive`, edge ingestion, ou worker assíncrono (ver comentários na migração `096`).

### 5.2 Reconnect no meio do `pricing` RPC

- Se `AbortSignal` abortou: resultado **`aborted`**; não aplicar efeitos tardios.
- Se `cupomSessionId` mudou: **`stale_cupom`**; não aplicar preço ao carrinho atual.
- Retry de pricing só se política da seção 3 permitir **e** guards passarem.

### 5.3 ACK visual ocorreu mas o backend (telemetria) não recebeu

- **Domínio:** o operador já viu o feedback; o cupom já reflete a ação local (Zustand). Inconsistência é **só observabilidade**.
- **Ação:** não “desfazer” bip por falta de telemetria; opcionalmente reenviar batch falhado em background (futuro).

### 5.4 Browser suspende a aba

- Timers de flush de telemetria podem atrasar; `pagehide`/`visibilitychange` podem ser usados no futuro para flush best-effort.
- Pipeline: ao retomar, **`cupomSessionId` ativo** continua sendo a autoridade; scans antigos na fila devem ser tratados como **stale** ou **cancelled** conforme política de negócio (recomendação: após suspend prolongado, operador confirma cupom ou “novo cupom” regenera sessão).

### 5.5 Operador muda cupom durante retry implícito

- **Proibido** retry implícito que ignore `cupomSessionId`.
- Qualquer retry de rede deve revalidar `getActiveCupomSessionId()` vs `meta.cupomSessionId` do scan (como em `runWebCaixaScanProcess`).

### 5.6 `AbortError` / exceção no `fetch`

- Tratamento uniforme: **não** confundir com falha de domínio “produto não encontrado”.
- Telemetria: log silencioso / contador de falhas (futuro); **não** toast ao operador.

### 5.7 `shutdown()` do pipeline

O `shutdown()` deve **abortar** o handler em curso: `paused` + `flush({ discardPending: true })` **antes** de marcar `destroyed`, para `flush` não sair cedo por `if (this.destroyed) return` sem chamar `abort()`.

---

## 6. Timeouts operacionais por etapa (alvos; não hardcoded obrigatoriamente no motor)

Valores são **orientação** para SLAs e testes de carga; implementação concreta fica por PR.

| Etapa | Alvo orientador |
|-------|------------------|
| Fila até início de processamento | Depende de `maxQueueDepth` e carga; medir `queue_wait_duration_ms`. |
| Lookup (`buscar_produto`) | Ordem típica: poucos segundos em rede ruim; acima disso considerar cancelamento UX (futuro). |
| RPC preço | Idem; degradação medida por `pricing_rpc_duration_ms` (p95/p99). |
| ACK visual | Orçamento humano total: `scan_to_visual_ack_ms`. |

Timeouts reais devem ser **configuráveis** e alinhados a esta política quando introduzidos.

---

## 7. Ownership de telemetria (evitar drift em 4 camadas)

| Camada | Responsabilidade |
|--------|------------------|
| **Runtime** (`scan-pipeline-runtime`) | Fila, cancelamento, durações genéricas: `queue_wait_duration_ms`, `processing_duration_ms`, `scan_total_duration_ms`, `queue_depth_peak`, `scan_processing_aborted`, `scans_cancelled_on_new_cupom`, etc. |
| **Adapter de domínio** (`runWebCaixaScanProcess` e afins) | Efeitos de negócio do caixa: `buscar_produto_duration_ms`, `pricing_rpc_duration_ms`, `scan_to_visual_ack_ms`. |
| **Sink** | Composição (console, persistência, overlay); **não** reescrever semântica de eventos. |
| **Rota `/api/caixa/scan-telemetry`** | Auth, validação, `normalizeHumanTelemetryPayload`, persistência; **não** inferir negócio. |

**Naming:** prefixos estáveis já listados no contrato de eventos; novos eventos de domínio devem ter nome explícito (`fiscal_*`, `tef_*`, etc.) e PR deve declarar em qual camada vivem.

---

## 8. Taxonomia de falhas (roadmap; alinhar antes de explodir `ScanFailureReason`)

Hoje existem `failed`, `cancelled`, `stale_cupom`, `aborted`, etc. Para dashboards operáveis, evoluir para **categoria** ortogonal ao motivo fino:

```text
ScanFailureCategory (futuro, conceitual)
  | 'network'
  | 'pricing'
  | 'catalog'
  | 'auth'
  | 'timeout'
  | 'abort'
  | 'stale_context'
  | 'validation'
  | 'unknown'
```

- Mapear `ScanFailureReason` atual → categoria em agregação ou em `ctx` de telemetria antes de alterar tipos em massa.
- **Dashboard sem taxonomia vira ruído** — priorizar agregados por categoria antes de novas métricas finas.

---

## 9. Retenção e volume (`caixa_scan_telemetry_events`)

**Recomendação operacional inicial (ajustar por custo/compliance):**

| Camada | Retenção sugerida | Uso |
|--------|-------------------|-----|
| Raw events | **7–15 dias** (hot) | Debug, incidentes recentes. |
| Rollup / agregados horários | **30 dias** (warm) | p95/p99, bursts, saturação de fila. |
| Arquivo / cold | Política de compliance | Opcional. |

**Implementação:** partição por `created_at`, job diário (`pg_cron` ou worker), **materialized view** ou tabela de agregados para p95/p99 por `event_name` + janela — ver migração `097` (índices + coluna `correlation_id`). **Não** esperar dashboard para definir TTL; crescimento por loja é rápido com múltiplos eventos por scan.

### 9.1 Esboço de agregação (não aplicado automaticamente)

```sql
-- Exemplo: agregado horário por evento (executar via cron após definir colunas agregadas).
-- CREATE TABLE caixa_scan_telemetry_hourly (...);
-- INSERT ... SELECT date_trunc('hour', created_at), event_name, percentile_disc(0.95) ...
```

---

## 10. Próximos passos explícitos (fora deste documento)

1. Implementar job de **purge** + **agregados** conforme seção 9.  
2. Decidir política **reconnect**: o que sobrevive a desconexão (estado local vs servidor) — escrever subseção quando o produto offline/web unificar.  
3. Playwright para cenários de aba/rede/scanner duplo (§0.2).

---

## 11. Changelog deste documento

| Data | Alteração |
|------|-----------|
| (versão inicial) | Política formal reconnect/replay, ACK visual, telemetria vs UX, taxonomia roadmap, retenção. |
| (atual) | Seção 0 (documento vivo, checklist, golden tests, limite operacional, fronteira shared-core, dashboards); §5.7 `shutdown` + ordem `destroyed`; renumerado §6–11; referência a `VISUAL_TRANSACTION_STATES.md`. |
| 2026-05 | `SCAN_PIPELINE_STATE_MACHINE.md`; testes dourados com espera semântica (`waitUntil` / `waitForCurrentScanState`); `scan-pipeline-invariants.spec.ts`; guarda `double_finalize_attempt` no runtime; link cruzado neste doc. |
| 2026-05 | Enforcement central em `scan-pipeline-transitions.ts`; `buildScanTimeline`; `SCAN_HANDLER_ASYNC_CONTRACT.md`; `pending_resolution` congelado na doc de estado. |
| 2026-07 | Fase 1 caixa: contrato de consistência do `sync-outbox` (ACK vs retry, idempotência de fechamento `o_ja_fechado`, ordenação causal por caixa) formalizado em [`OUTBOX_CAIXA_CONSISTENCY_CONTRACT.md`](./OUTBOX_CAIXA_CONSISTENCY_CONTRACT.md). |
