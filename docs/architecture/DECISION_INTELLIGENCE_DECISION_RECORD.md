# Missão — Decision Intelligence DecisionRecord (Fase 2 / P0)

| Campo | Valor |
|--------|--------|
| **Status** | **Concluído** (camada de integração; Core intocado) |
| **Checkpoint anterior** | tag `di-persist-phase-1` |
| **Código** | `pdv-importados/lib/decision-intelligence/` |
| **Schema** | `backend/supabase/migrations/273_decision_records.sql` |

---

## Objetivo

Registrar o **ciclo de vida pós-recomendação** — o que o humano/sistema decidiu e o que aconteceu depois.  
**Não** é uma segunda Recommendation.

```
Recommendation (Core — emissão)
        ↓
DecisionRecord (integração — o que aconteceu depois)
        ↓
Outcome 30d / 60d / 90d
```

## Princípio

| DecisionRecord | Recommendation |
|----------------|----------------|
| Registra decisão humana / estado | Sugere opção de revisão |
| Tem status + motivo + outcomes | Tem evidência + regra versionada |
| Não recalcula KPIs | Produzida só pelo Engine Loop |

## Modelo

### Status

`accepted` · `rejected` · `deferred` · `executed`

### decisionReason (obrigatório)

`HUMAN_OVERRIDE` · `OUT_OF_STOCK` · `BUSINESS_POLICY` · `SEASONAL` · `OTHER`

### Outcomes mensuráveis

- `expectedOutcome` — meta no momento da decisão (ex.: margem +4%)  
- `actualOutcome` — resultado observado (ex.: +3.6%)  
- slots `outcomes.d30` / `d60` / `d90` — PENDING ou RECORDED  

### Demais

- `recommendationId` (obrigatório)  
- `snapshotId` (opcional — liga ao `decision_snapshots`)  
- `reviewDate`  
- `actorId` · `lojaId`  

## Fluxo de dados

```
DecisionSnapshot  →  DecisionRecord  →  Read Model (Fase 3)
```

## Restrições

- Core v1.0 intocado · Engine Loop intocado  
- Adapter = I/O apenas  
- Sem UI · Sem Read Model nesta fase  

## Ordem

1. ✅ Persistência Snapshot  
2. ✅ Este DecisionRecord  
3. ✅ Read Model (`DECISION_INTELLIGENCE_READ_MODEL.md`)  
4. ✅ `/admin/intelligence` (`DECISION_INTELLIGENCE_ADMIN_SURFACE.md`)  
5. ✅ Orchestrator (`DECISION_INTELLIGENCE_ORCHESTRATOR.md`)  
