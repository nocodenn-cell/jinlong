# Missão — Decision Intelligence Cycle 8: Executive Engine

| Campo | Valor |
|--------|--------|
| **Status** | **Concluído** (core puro) |
| **Código** | `shared-core/src/intelligence/executive/` |
| **Fluxo** | Snapshots anteriores → `ExecutiveSnapshot` |

## Princípio

Executive **compõe** visão consolidada (KPIs, Findings, Recs, Alerts, Plans, Memory).  
**Não** consulta Facts. **Não** recalcula fórmulas. **Não** executa ações.

## Guards

| Gate | Norma |
|------|--------|
| Sem Facts no input | **GO** |
| Confidence = weakest link dos snapshots | **GO** |
| Sem mutação operacional | **GO** |
| `ruleId` / `ruleVersion` | **GO** |
