# Missão — Decision Intelligence Cycle 7: Memory Engine

| Campo | Valor |
|--------|--------|
| **Status** | **Concluído** (core puro) |
| **Código** | `shared-core/src/intelligence/memory/` |
| **Fluxo** | Pipeline artifacts → `MemorySnapshot` (sem I/O) |

## Princípio

Memory **registra** emissões/contexto/hints do ciclo para futura persistência.  
**Não** escreve banco. **Não** altera Findings, Recommendations, Alerts ou Action Plans.

`DecisionRecord` (aceite humano + outcomes 30/60/90) permanece contrato futuro — fora deste ciclo in-memory.

## Guards

| Gate | Norma |
|------|--------|
| Sem SQL / Supabase | **GO** |
| Não muta artefatos anteriores | **GO** |
| Confidence não sobe | **GO** |
| `ruleId` / `ruleVersion` / fingerprint | **GO** |
