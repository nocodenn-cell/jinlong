# Missão — Decision Intelligence Cycle 3: Analysis Engine

| Campo | Valor |
|--------|--------|
| **Status** | **Concluído** (core puro) |
| **Data** | 2026-07-19 |
| **Código** | `shared-core/src/intelligence/analysis/` |
| **Fluxo** | DerivedKPIs → Analysis Findings → (Cycle 4) Recommendations |

---

## Princípio

A Analysis **interpreta padrões**. **Não decide** e **não recomenda ações**.

```
DerivedKPIs
      ↓
Analysis Engine
      ↓
Analysis Findings   ← "existe um desvio de margem"
      ↓
Recommendation Engine (Cycle 4)
      ↓
Actions
```

Proibido neste cycle: “aumente o preço”, chatbot de gestão, SQL, UI, `/admin`.

## Confiança

Continua **weakest link**: `finding.confidence = min(operationalConfidence dos KPIs em evidence)`.

KPIs `BLOCKED` / `UNAVAILABLE` / `value === null` **não** geram findings de desvio (dados insuficientes).

## Gate obrigatório antes do Cycle 4

| Regra | Status |
|-------|--------|
| Analysis não acessa banco / Supabase | **GO** |
| Analysis não conhece UI / React / Next | **GO** |
| Analysis não cria Recommendations | **GO** |
| Toda conclusão tem `evidence[]` não vazia | **GO** |
| Confidence propagada (mínimo) | **GO** |
| Testes de dados insuficientes | **GO** |

## Superfície Admin (futuro — não nesta missão)

```
/admin/... → Decision Intelligence (Insights · Alerts · Recommendations · Executive)
```

Consome domínios via DI. **Não** é CRUD entity-ssot nem ERP paralelo.
