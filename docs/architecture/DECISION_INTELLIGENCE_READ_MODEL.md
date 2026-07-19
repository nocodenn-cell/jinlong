# Missão — Decision Intelligence Read Model (Fase 3 / P0)

| Campo | Valor |
|--------|--------|
| **Status** | **Concluído** |
| **Checkpoint anterior** | tag `di-decision-record-phase-2` |
| **Código** | `pdv-importados/lib/decision-intelligence/read-model/` |
| **Core** | tag `di-core-v1.0` — **intocado** |

---

## Princípio (obrigatório)

**O Read Model nunca calcula. Apenas projeta.**

| Faz | Não faz |
|-----|---------|
| Organiza campos já produzidos pelo Core / DecisionRecord | Recalcular KPIs, Findings, severity, urgency |
| Filtra / ordena / agrupa valores existentes | Inferir margem, preço, estoque |
| Junta Recommendation ↔ DecisionRecord por id | Duplicar regras de Analysis/Recommendation |

Toda inferência permanece no Engine Loop (Core).  
Esta camada só disponibiliza resultados para consumo eficiente (futuro `/admin`).

## Entradas

```
DecisionSnapshot  (persistido)
DecisionRecord[]  (persistido)
        ↓
buildDecisionIntelligenceReadModel(...)
        ↓
Projeções tipadas
```

## Projeções

| Projeção | Fonte principal |
|----------|-----------------|
| `ExecutiveDashboard` | `snapshot.executive` + contagens de records |
| `RecommendationQueue` | `snapshot.recommendations` + status de decisão |
| `CriticalAlerts` | `snapshot.alerts` onde `severity === 'CRITICAL'` (campo do Core) |
| `DailyActionPlan` | `snapshot.actionPlans` |
| `DecisionHistory` | `DecisionRecord[]` |
| `DecisionPerformance` | records com expected/actual **já gravados** |
| `PendingReviews` | Recs sem record · deferred com `reviewDate` |

## Restrições

- Sem UI / `/admin`  
- Sem alterar Engine Loop  
- Adapter só carrega Snapshot + Records e chama o builder puro  

## Ordem

1. ✅ Core · Persistência · DecisionRecord  
2. ✅ Este Read Model  
3. `/admin/intelligence` (consome **apenas** estas projeções)  
