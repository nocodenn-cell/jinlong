# Missão — Observabilidade Decision Intelligence (Onda 3 / P1)

| Campo | Valor |
|--------|--------|
| **Status** | **Concluído** |
| **Checkpoint anterior** | tag `di-homologation-wave-2` |
| **Código** | `orchestrator/extract-observability.ts` + métricas do run |
| **Core** | `di-core-v1.0` — **intocado** |

---

## Princípio

Observabilidade na **borda** (orquestrador).  
Durações por engine interno do Core vêm de `DecisionSnapshot.metrics` (já emitidas pelo loop) — sem instrumentar o Core.

## Métricas

| Campo | Origem |
|-------|--------|
| `startedAt` / `finishedAt` / `durationMs` | Orquestrador |
| `engineLoopMs` / `persistMs` | Timings da borda |
| `factsLoaded/Used/Blocked` | `snapshot.metrics` |
| `kpisSupported/Partial/Blocked` + `blockedKpiIds` | snapshot |
| `analysisFindings`, `recommendations`, `alerts`, `actionPlans`, `memoryEntries` | snapshot |
| `coreVersion` | `di-core-v1.0` |
| `schemaVersion` | codec |
| `ruleVersion` | `memory.ruleVersion` |
| `snapshotVersion` | persist meta |
| `failuresByStage` | orquestrador |
| `traceId` | `runId` do ciclo |

Log JSON: `decision_intelligence.orchestrator.run`.

## Fora de escopo

- APM externo (Datadog) — integração futura  
- Alterar engines do Core para spans por etapa interna  
