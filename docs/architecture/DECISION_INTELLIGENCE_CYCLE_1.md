# Missão — Decision Intelligence Cycle 1 (Fact Providers)

| Campo | Valor |
|--------|--------|
| **Status** | **Engine Loop v1 (core)** entregue — Onda A executável via providers injetáveis; Onda B identificada/bloqueada sem completar dados |
| **Data** | 2026-07-19 |
| **Pré-requisitos** | Cycle 0 · [Foundation Hardening](./FOUNDATION_HARDENING.md) · `GATE_DATABASE_TYPES_STALE` SATISFIED |
| **Código** | Descriptors/waves em `shared-core/src/intelligence/`; adapters I/O na **app** (não no core) |

---

## 1. Análise da proposta (melhorias)

| Proposta bruta | Correção / melhoria |
|----------------|---------------------|
| `PaymentFact` | Não existe no catálogo → **`SalePaymentFact`** |
| `CashMovementFact` como SUPPORTED Wave A | Registry = **CONTEXT** (turno físico ≠ fluxo empresarial). Wave A pode ter loader de contexto, mas **não** alimenta Recommendation/KPI empresarial |
| Uma onda só | **Onda A** (SUPPORTED) → **Onda B** (PARTIAL/UNSUPPORTED explícitos) |
| Só `supportLevel` | + **`operationalConfidence` ∈ [0, 1]** (qualidade prática) |
| Rec pode “chegar no banco” sob pressão | Política: Recommendation **só recebe Facts** |

---

## 2. Duas ondas

### Onda A — Facts maduros (somente SUPPORTED)

**Objetivo:** validar infraestrutura, ports, registry, providers tipados e contratos — **zero** PARTIAL/UNSUPPORTED na emissão de insights.

| FactId | supportLevel | confidence (default estrutural) | Owner |
|--------|--------------|----------------------------------|-------|
| `SaleFact` | SUPPORTED | 1.0 | sales |
| `SaleLineFact` | SUPPORTED | 1.0 | sales |
| `SalePaymentFact` | SUPPORTED | 1.0 | sales |
| `SaleReturnFact` | SUPPORTED | 1.0 | sales |
| `StockPositionFact` | SUPPORTED | 1.0 | inventory |
| `InventoryMovementFact` | SUPPORTED | 1.0 | inventory |
| `ProductFact` | SUPPORTED | 1.0 | products |
| `ProductPriceFact` | SUPPORTED | 1.0 | products |
| `ArTitleFact` | SUPPORTED | 1.0 | financial |
| `ApTitleFact` | SUPPORTED | 1.0 | financial |
| `CustomerFact` | SUPPORTED | 1.0 | customers |
| `SupplierFact` | SUPPORTED | 1.0 | suppliers |

**Fora da Onda A (não implementar provider de insight):** tudo PARTIAL/UNSUPPORTED/CONTEXT.

**Contexto operacional (opcional, separado):** `CashSessionFact` / `CashMovementFact` / `CashExpectedFact` podem ter loaders CONTEXT — nunca como input de Recommendation na Onda A.

### Onda B — Facts condicionais

Providers que **declaram** qualidade e **não completam** dados:

| FactId | supportLevel | confidence | Gate |
|--------|--------------|------------|------|
| `MarginFact` | PARTIAL | ≤ 0.72 (ex.) | `GATE_MARGIN_COST_RELIABLE` |
| `StockCapitalFact` | PARTIAL | ≤ 0.72 | `GATE_STOCK_CAPITAL_KARDEX_COST` |
| `CustomerPurchaseFact` | UNSUPPORTED | **0.0** | `GATE_CUSTOMER_SALE_LINK` |
| `SaleCustomerLinkFact` | PARTIAL | baixo | `GATE_CUSTOMER_SALE_LINK` |

`load()` na Onda B pode retornar envelopes vazios ou parciais, mas o **`descriptor`** continua a fonte de verdade do status.

---

## 3. supportLevel × operationalConfidence

| Dimensão | Pergunta que responde |
|----------|----------------------|
| **supportLevel** | O Fact está estruturalmente disponível para o pipeline? |
| **operationalConfidence** | Quão boa é a qualidade prática dos dados **nesta** carga? (0.0–1.0) |

Exemplos:

| Fact | supportLevel | confidence |
|------|--------------|------------|
| StockPositionFact | SUPPORTED | 1.0 |
| MarginFact | PARTIAL | 0.72 |
| CustomerPurchaseFact | UNSUPPORTED | 0.0 |

Mensagens futuras (Cycle 4):

- *"Recomendação gerada com 94% de confiança, baseada em 6 Facts suportados."*
- *"Não foi possível estimar churn: relacionamento cliente↔venda abaixo do nível mínimo de confiança."*

---

## 4. Pureza do Recommendation Engine (política arquitetural)

```
Provider (app adapter) → Facts
        ↓
      KPIs
        ↓
    Analysis
        ↓
 Recommendation  ← só Facts (+ KPIs derivados de Facts)
        ↓
   Action Plan
```

**Nenhuma Recommendation pode:**

- consultar banco / Supabase  
- consultar adapters  
- importar React / Next  

**Só pode receber** uma coleção de `FactEnvelope` (e, depois, KPI values já calculados no core a partir desses Facts).

Contrato: `RecommendationEngineInput` / `RecommendationEnginePort` em `contracts/recommendation-purity.ts`.

---

## 5. Governança (inalterada + reforço)

1. Fact novo → primeiro `DECISION_FACT_CATALOG.md`.  
2. Recommendation só consome Fact catalogado + `supportLevel` + `operationalConfidence`.  
3. Onda A: proibido emitir insight de Fact não-SUPPORTED.  
4. Onda B: proibido “completar” Margin/Customer/Capital com aproximação.  
5. Manter disciplina sob pressão de feature (auditoria: risco arquitetural baixo se estas regras segurarem).

---

## 6. Entregáveis por onda

| Onda | Core (`shared-core`) | App (adapters) |
|------|----------------------|----------------|
| **A** | wave plan + descriptors SUPPORTED + purity + confidence | providers I/O só Wave A |
| **B** | descriptors PARTIAL/UNSUPPORTED | providers que expõem status; sem fake-complete |

---

## 7. GO / NO-GO

| Decisão | Resultado |
|---------|-----------|
| Cycle 1 em duas ondas | **GO** |
| Onda A só SUPPORTED (catálogo real) | **GO** |
| `CashMovementFact` como SUPPORTED de insight | **NO-GO** (CONTEXT) |
| Confidence score no descriptor + envelope | **GO** |
| Recommendation só Facts | **GO** |
| Contornar gates na Onda B | **NO-GO** |
