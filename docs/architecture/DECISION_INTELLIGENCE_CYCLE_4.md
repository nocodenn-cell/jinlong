# Missão — Decision Intelligence Cycle 4: Recommendation Engine

| Campo | Valor |
|--------|--------|
| **Status** | **Concluído** (core puro) |
| **Data** | 2026-07-19 |
| **Código** | `shared-core/src/intelligence/recommendation/` · `policy/` |
| **Fluxo** | Findings → Recommendations (opções) — **não** decisões operacionais |

---

## Separação obrigatória

| Camada | Faz | Não faz |
|--------|-----|---------|
| **analysis/** | Identifica problema (`LOW_MARGIN`) | Sugerir ação |
| **recommendation/** | Sugere **opção de revisão** (`REVIEW_MARGIN_DRIVERS`) | `"increase_product_price"` |
| **policy/** | Limites organizacionais (confidence mínima, actionCodes proibidos) | Analisar KPIs |

```
Finding (Analysis)
      ↓
Recommendation (opção explicável)
      ↓
(Action Plan Cycle 6 — humano / entity-ssot)
```

## Recommendation Determinism Gate

Toda Recommendation **deve** responder:

| Pergunta | Campo |
|----------|-------|
| Qual Finding originou? | `sourceFindingIds[]` (não vazio) |
| Qual KPI sustentou? | `kpisUsed[]` (não vazio) |
| Qual regra gerou? | `ruleId` + `ruleVersion` |
| Qual nível de confiança? | `operationalConfidence` ∈ [0,1] + `confidence` |

Se falhar `assertRecommendationDeterminism` → **não entra** no snapshot.

## Anti–piloto automático

**Proibido** embutir política comercial operacional:

```
se margem < 20% então subir preço 10%   ← NO-GO
```

**Permitido:**

```
REVIEW_MARGIN_DRIVERS / REVIEW_INVENTORY_CAPITAL / REVIEW_SALES_ACTIVITY
```

Apoio à decisão explicável ≠ piloto automático.

## Gates (além do Cycle 3)

| Gate | Norma |
|------|--------|
| Sem banco / Supabase / UI | **GO** |
| Analysis não cria Recommendations | **GO** (C3) |
| Evidência / Finding obrigatório | **GO** |
| Determinism gate | **GO** |
| Action codes operacionais banidos | **GO** (`policy/`) |
| `/admin` UI | **NO-GO** nesta missão |

## Auditoria pré–Cycle 5 (não bloqueante)

| Check | Resultado |
|-------|-----------|
| **1. Policy não decide** | **OK** — `policy/` só filtra (confidence ≥ 0.5, action codes banidos). Sem `if margin < X then Y`. |
| **2. ruleId/ruleVersion no snapshot** | **OK** — cada `Recommendation` no `DecisionSnapshot.recommendations` carrega `ruleId` + `ruleVersion` (rastreio “por que sugeriu há 3 meses?”). |
| **3. Confidence não sobe** | **OK** — `operationalConfidence` da Rec = `finding.confidence` (já min dos KPIs/Facts). Policy só **corta** emissão; nunca recalcula para cima. |

Política deve **limitar**, não decidir. Alert (C5) ≠ cópia da Recommendation.

## Ordem seguinte

Commit/checkpoint → Cycle 5 Alert → Cycle 6 Action Plan → read model/API → UI `/admin` DI (só após Analysis + Recommendation + Alert).
