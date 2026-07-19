# Decision Intelligence (`@fastproduct/shared-core/src/intelligence`)

Camada **derivada, read-mostly** acima dos domínios operacionais (ADR-011).

Cycle 0 = fundação (contratos, registry, gates, ports).  
Cycle 1 = Engine Loop (`runEngineLoop` → Snapshot).  
Cycle 2 = KPI Derivation (`deriveKpis`) — weakest-link confidence.  
Cycle 3 = Analysis Engine (`runAnalysisEngine`) — Findings; **não** recomenda ações.  
Cycle 4 = Recommendation Engine (`runRecommendationEngine`) — opções de revisão.  
Cycle 5 = Alert Engine (`runAlertEngine`) — atenção priorizada.  
Cycle 6 = **Action Plan** (`runActionPlanEngine`) — trabalho agregado por objetivo.  
Cycle 7 = **Memory** (`runMemoryEngine`) — `MemorySnapshot` puro (sem DB).  
Cycle 8 = **Executive** (`runExecutiveEngine`) — composição read-model (sem Facts).  
Sem Action automática / SQL / `/admin` DI nesta camada.

## Propósito

Ajudar o empresário a decidir — com evidências e SSoT preservado.

```
Facts → KPIs → Analysis → Recommendations → Alerts
        → Action Plans → Memory → Executive
```

## Responsabilidades (esta pasta)

| Faz | Não faz |
|-----|---------|
| Contratos públicos (Recommendation, Alert, ActionPlan, Memory, Fact, KPI) | Escrever tabelas operacionais |
| Registry de FactIds alinhado a `DECISION_FACT_CATALOG.md` | Calcular margem / forecast / churn |
| Gates de lacunas de dados | Contornar gates com aproximações |
| Ports outbound tipados | Implementar Supabase / Next / React |
| Codes `INTEL_*` | Traduzir strings (borda i18n) |

## Proibido

- Importar `pdv-importados`, `pdv-local`, React, Next, Supabase
- Importar internals de `sales` / `financial` / `inventory` / …
- Domínios operacionais importarem `intelligence` (evita ciclo)
- Regras de negócio, engines, SQL, Server Actions neste Cycle 0
- Inventar custo/cliente/capital “temporário” para desbloquear KPI

## Gates canônicos (não contornar)

Ver `gates/data-readiness.ts`:

1. `GATE_CUSTOMER_SALE_LINK` — cliente↔venda (**OPEN**)  
2. `GATE_MARGIN_COST_RELIABLE` — `custo_unitario_snap` / costReliable (**OPEN**)  
3. `GATE_STOCK_CAPITAL_KARDEX_COST` — custo no kardex (**OPEN**)  
4. `GATE_DATABASE_TYPES_STALE` — types vs migrations (**SATISFIED** após Foundation Hardening)

Hardening: [`docs/architecture/FOUNDATION_HARDENING.md`](../../../docs/architecture/FOUNDATION_HARDENING.md).

## Cycle 1 — duas ondas

Ver [`DECISION_INTELLIGENCE_CYCLE_1.md`](../../../docs/architecture/DECISION_INTELLIGENCE_CYCLE_1.md).

| Onda | Conteúdo |
|------|----------|
| **A** | Só Facts `SUPPORTED` (`WAVE_A_SUPPORTED_FACT_IDS`) — validar infra |
| **B** | `PARTIAL` / `UNSUPPORTED` explícitos — sem completar dados |
| **CONTEXT** | Cash* — opcional; **não** alimenta Recommendation na Onda A |

`PaymentFact` não existe → use `SalePaymentFact`.  
`CashMovementFact` ≠ SUPPORTED de insight (é CONTEXT).

## Quality Level + Confidence

Todo `FactProviderPort.descriptor` declara:

| Campo | Significado |
|-------|-------------|
| `supportLevel` | Disponibilidade estrutural |
| `operationalConfidence` ∈ [0,1] | Qualidade prática dos dados |

Exemplos: StockPosition `SUPPORTED`/1.0 · Margin `PARTIAL`/0.72 · CustomerPurchase `UNSUPPORTED`/0.0.

Recommendation Engine: `evaluateProviderForRecommendation` + `summarizeFactConfidence`.

## Pureza da Recommendation

**Proibido** no engine: banco, Supabase, adapters, React.  
**Permitido:** Facts + DerivedKPIs + Analysis Findings (já materializados).  
**Determinism gate:** `sourceFindingIds`, `kpisUsed`, `ruleId`/`ruleVersion`, `operationalConfidence`.  
**Proibido:** action codes operacionais (`increase_product_price` → ver `policy/`).

```
Provider → Facts → KPIs → Analysis → Recommendation → Action Plan
```

Separação: `analysis/` identifica · `recommendation/` sugere opções · `policy/` limita.

## Governança

1. Fact novo → primeiro `DECISION_FACT_CATALOG.md`.  
2. Recommendation só Fact catalogado + `supportLevel` + `operationalConfidence`.  
3. Onda A: sem PARTIAL/UNSUPPORTED.  
4. Proibido contornar gates.

## Como adicionar um novo Fact

1. Documentar em `docs/architecture/DECISION_FACT_CATALOG.md` (fonte, colunas, owner, KPIs).  
2. Incluir o id em `facts/definitions.ts` (`FACT_IDS`).  
3. Registrar metadados em `facts/registry.ts` (owner, readiness, gateIds).  
4. Se houver lacuna: novo gate em `gates/data-readiness.ts` — **sem** fórmula alternativa.  
5. Provider (Cycle 1) implementa `FactProviderPort` na **app**, não aqui.

## Como adicionar um novo KPI

1. Definir no catálogo de KPIs (`FINANCIAL_INTELLIGENCE.md` / ADR-011).  
2. Declarar `KpiDefinition` (kpiId, formulaVersion, `dependsOnFacts`, `dependsOnGates`).  
3. Engine (Cycle 2) consome Facts via ports; se `evaluateFactConsumption` falhar → `UNSUPPORTED` / não emitir.  
4. **Nunca** calcular KPI em React.

## Como adicionar uma nova Recommendation

1. Contrato = tipo `Recommendation` + `recommendationCode` + `sourceFindingIds`.  
2. Regra em `recommendation/rules/` com `ruleId` + `ruleVersion`.  
3. Mapear Finding → opção de **revisão** (ex.: `REVIEW_MARGIN_DRIVERS`), nunca decisão operacional.  
4. Passar `assertRecommendationDeterminism` e limites em `policy/`.  
5. Sem caixa-preta / sem IA inventando fato.

## Como adicionar um novo Alert

1. Contrato = `Alert` / `DecisionAlert` (`sourceRecommendationIds`, urgency, confidence).  
2. Regra em `alerts/rules/` com `detectorId` + `detectorVersion`.  
3. Sempre a partir de Recommendation; urgency ≠ inflar confidence.  
4. Passar `assertAlertDeterminism`. Sem Action / sem mutar Rec.

## Pastas reservadas (cycle lock)

| Pasta | Cycle | Conteúdo permitido agora |
|-------|-------|---------------------------|
| `analysis/` | 3 | SSoT Analysis (não usar pasta `analyzers`) |
| `recommendation/` · `policy/` | 4 | SSoT Recommendation |
| `alerts/` | 5 | Alert Engine |
| `action-plan/` | 6 | Action Plan Engine |
| `memory/` | 7 | Memory Engine |
| `executive/` | 8 | Executive Engine |
| `testing/` | — | fixtures de contrato (só testes) |
| `immutability.ts` | — | clone Facts + deepFreeze do Snapshot |

**v1.0 hardening:** Finding.`operationalConfidence` + `sourceFactIds`; Alert.`sourceFindingIds`; ActionPlanItem rastreável; Memory entries granulares; Snapshot deep-frozen.

## Docs

- [ADR-011](../../../docs/adr/ADR-011-decision-intelligence.md)
- [DECISION_FACT_CATALOG](../../../docs/architecture/DECISION_FACT_CATALOG.md)
- [Cycle 0 mission](../../../docs/architecture/DECISION_INTELLIGENCE_CYCLE_0.md)
