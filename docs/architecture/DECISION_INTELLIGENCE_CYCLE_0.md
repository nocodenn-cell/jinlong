# Missão — Decision Intelligence Cycle 0 (Foundation)

| Campo | Valor |
|--------|--------|
| **Status** | **Concluído** — fundação em `shared-core/src/intelligence/` |
| **Data** | 2026-07-19 |
| **Pré-requisitos** | [ADR-011](../adr/ADR-011-decision-intelligence.md) · [DECISION_FACT_CATALOG.md](./DECISION_FACT_CATALOG.md) · [FINANCIAL_INTELLIGENCE.md](./FINANCIAL_INTELLIGENCE.md) |
| **Código** | `shared-core/src/intelligence/` |
| **Objetivo** | Fundação arquitetural definitiva — **sem implementar inteligência** |

---

## 1. Análise da missão original (o que foi melhorado)

| Problema na missão bruta | Melhoria Cycle 0 |
|--------------------------|------------------|
| Exemplo `InventoryFact` / nomes genéricos | Registry usa **somente** Facts do [DECISION_FACT_CATALOG](./DECISION_FACT_CATALOG.md) (`StockPositionFact`, `InventoryMovementFact`, …) |
| Pastas `engines/`, `analyzers/`, … vazias convidam lógica precoce | Pastas reservadas com `README.md` + **cycle lock** (proibido código até o ciclo correspondente) |
| Árvore divergia do ADR-011 (`actionPlan/` vs `action-plan`) | Contratos em `contracts/*`; ciclos futuros mapeados; umbrella ADR-011 preservado |
| Lacunas citadas só em prosa | Módulo `gates/` — dependências explícitas, **sem** cálculo alternativo |
| “DI conhece ports” sem port tipado | `ports/fact-provider.ts` — outbound port **sem** implementação |
| Sem `errorCodes` (padrão shared-core) | `errorCodes.ts` com codes de prontidão / contrato |
| Guard de domínio não listava `intelligence` | `intelligence` entra em `DOMAIN_DIRS` do boundary guard |

---

## 2. Escopo permitido (Cycle 0)

- Contratos TypeScript (Recommendation, Alert, Action Plan, Decision Memory, Fact, KPI)
- Fact Registry tipado (ids + owner + readiness + gates)
- Ports outbound tipados (sem adapter)
- Gates de dados (4 lacunas canônicas)
- `errorCodes`, barrel `index.ts`, `README.md`
- Pastas reservadas para Cycles 1–8 (somente README de lock)

## 3. Proibido (Cycle 0)

Regras de negócio · KPIs calculados · Recommendations emitidas · IA · previsões · SQL · adapters · React · Server Actions · imports de `sales`/`financial`/… · aproximações para “desbloquear” Facts gated.

---

## 4. Árvore implementada

```
shared-core/src/intelligence/
├── README.md
├── index.ts                 # barrel público único
├── errorCodes.ts
├── types/                   # Evidence, Confidence, EntityRef, …
├── contracts/               # Recommendation, Alert, ActionPlan, Memory, Fact, Kpi
├── facts/                   # registry + FactId (catálogo)
├── ports/                   # FactProviderPort (outbound, sem impl)
├── gates/                   # 4 lacunas como dependências explícitas
├── engines/                 # LOCK Cycle 2+
├── analyzers/               # LOCK Cycle 3+
├── recommendations/         # LOCK Cycle 4+
├── alerts/                  # LOCK Cycle 5+
└── memory/                  # LOCK Cycle 7+
```

---

## 5. Gates canônicos (não contornar)

| Gate ID | Lacuna | Bloqueia / degrada |
|---------|--------|---------------------|
| `GATE_CUSTOMER_SALE_LINK` | Relação cliente↔venda incompleta | `CustomerPurchaseFact`, churn/LTV |
| `GATE_MARGIN_COST_RELIABLE` | `custo_unitario_snap` / `costReliable` | `MarginFact` |
| `GATE_STOCK_CAPITAL_KARDEX_COST` | Sem custo unitário no kardex | `StockCapitalFact` / capital imobilizado |
| `GATE_DATABASE_TYPES_STALE` | `database.types.ts` vs migrations | Adapters I/O (Cycle 1+) |

**Norma:** Fact com gate aberto permanece `PARTIAL` / `BLOCKED` / `UNSUPPORTED`. Proibido inventar fonte temporária ou fórmula alternativa.

---

## 6. Sequência pós–Cycle 0

| Cycle | Foco |
|-------|------|
| 1 | Fact Providers (adapters read-only — fora do core ou atrás do port) |
| 2 | KPI Engine |
| 3 | Analysis Engine |
| 4 | Recommendation Engine |
| 5 | Alert Engine |
| 6 | Action Plan |
| 7 | Decision Memory |
| 8 | Executive Dashboard |

---

## 7. Critérios de aceite

| Critério | Como verificar |
|----------|----------------|
| Nenhum domínio operacional importa `intelligence` | boundary guard + revisão |
| DI não importa app / Supabase / Next / React | inspeção + R4 guard |
| DI não importa internals de sales/financial/… | sem imports cross-domain |
| Zero lógica de negócio / SQL | só types + registries + gates metadata |
| Contratos cobrem campos ADR-011 | `contracts/*` |
| Fact ids = catálogo | `facts/registry.ts` |
| Gates explícitos | `gates/data-readiness.ts` |
| `npm run typecheck` em shared-core | verde |

---

## 8. GO / NO-GO

| Decisão | Resultado |
|---------|-----------|
| Aceitar Cycle 0 foundation | **GO** |
| Contornar gates com aproximações | **NO-GO** |
| Implementar KPI/Recommendation/SQL neste cycle | **NO-GO** |
| Segundo pacote fora de shared-core | **NO-GO** (ADR-005) |
