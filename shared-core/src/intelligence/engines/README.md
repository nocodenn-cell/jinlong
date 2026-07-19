# Engines — Decision Intelligence

Cycle 1 **Engine Loop v1** (core only):

| Módulo | Papel |
|--------|-------|
| `fact-aggregator.ts` | SUPPORTED → use; PARTIAL → identify; UNSUPPORTED → block |
| `kpi-derivation-engine.ts` | Cycle 2 — Facts → DerivedKPIs (weakest-link confidence) |
| `kpi-deriver-stub.ts` | @deprecated → `deriveKpis` |
| `analysis-stub.ts` | Analysis vazio (Cycle 3) |
| `recommendation-engine-stub.ts` | Recommendations `[]` (Cycle 4) |
| `engine-loop.ts` | Pipeline puro via `FactProviderPort` |

**Proibido:** SQL, Supabase, React, Next, Server Actions, adapters concretos.

Entrada do loop: `providers: FactProviderPort[]` (in-memory nos testes; I/O real na app).
