# Decision Memory Engine (Cycle 7)

Gera `MemorySnapshot` **puro** — preparado para persistência futura.

| Faz | Não faz |
|-----|---------|
| Registrar emissões / contexto / hints do ciclo | Escrever banco / SQL |
| Propagar confidence (weakest link) | Mutar Findings / Recs / Alerts / Plans |
| Fingerprint auditável do pipeline | Tomar decisão humana (ACCEPTED/DISMISSED) |

`DecisionRecord` (aceite humano + outcomes 30/60/90) permanece contrato futuro — fora deste engine in-memory.
