# Missão — Decision Intelligence Cycle 2: KPI Derivation Engine

| Campo | Valor |
|--------|--------|
| **Status** | **Concluído** — `deriveKpis` + registry + snapshot expandido |
| **Data** | 2026-07-19 |
| **Código** | `shared-core/src/intelligence/kpi/` + `engines/kpi-derivation-engine.ts` |
| **Pré-requisitos** | Engine Loop v1 · Fact Aggregator · Wave plan |

---

## Objetivo

Facts → KPIs derivados, sem recomendações, IA, telas ou adapters.

## Confiança — estratégia escolhida: **Weakest Link (mínimo)**

Para um KPI com Facts dependentes \(F_1…F_n\) elegíveis:

\[
confidence_{KPI} = \min(operationalConfidence_{F_i})
\]

| Motivo | Detalhe |
|--------|---------|
| Conservador | Decisão não deve parecer mais certa que o pior input |
| Explicável | “Limitado pelo Fact X com 0.82” |
| Alinhado a gates | PARTIAL/UNSUPPORTED já degradam antes da média |

**Não usamos** média aritmética neste cycle (evitar mascarar um Fact frágil).

### Propagação de supportLevel / status

| Condição | Status do KPI |
|----------|---------------|
| Algum Fact requerido ausente no input | `UNAVAILABLE` (value = null) |
| Algum Fact requerido UNSUPPORTED / confidence 0 | `BLOCKED` (value = null) |
| Todos presentes; algum PARTIAL / readiness PARTIAL | `PARTIAL` (value só se payload suficiente) |
| Todos SUPPORTED + payloads OK | `SUPPORTED` |
| Payload insuficiente para fórmula | `UNAVAILABLE` — **nunca inventar** |

## Escopo

Implementado: registry, derivation engine, snapshot expandido, testes.  
Proibido: Rec/Analysis/Alert reais, SQL, adapters app.
