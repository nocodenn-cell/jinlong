# Missão — Feedback Governado (Onda 4 / P1)

| Campo | Valor |
|--------|--------|
| **Status** | **Concluído** |
| **Checkpoint anterior** | tag `di-observability-wave-3` |
| **Código** | `governed-feedback.ts` + `decision_governed_memory` |
| **Migration** | `274_decision_governed_memory.sql` |
| **Core** | `di-core-v1.0` — **intocado** |

---

## Princípio

```
DecisionRecord (humano)
        ↓
recordGovernedMemoryFromDecision
        ↓
decision_governed_memory (append-only)
        ↓
Read Model.governedMemory
        ↓
Cockpit panel
```

| Faz | Não faz |
|-----|---------|
| Registrar status/motivo/outcomes | Alterar regras do Core |
| Codes estáveis (`intel.governed.*`) | IA / embeddings / auto-tune |
| Projetar no Read Model | Recalcular KPIs |

## API

```ts
await recordGovernedMemoryFromDecision(memoryRepo, record, 'DECISION_RECORDED')
await recordGovernedMemoryFromDecision(memoryRepo, record, 'OUTCOME_RECORDED')
```

## Segurança

RLS espelha `decision_records` (DONO/ADMIN ou mesma loja).  
Somente SELECT + INSERT (append-only).
