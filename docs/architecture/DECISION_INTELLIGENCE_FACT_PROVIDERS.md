# Missão — FactProviders reais Wave A (Onda 1 / P0)

| Campo | Valor |
|--------|--------|
| **Status** | **Concluído** |
| **Checkpoint anterior** | tag `di-orchestrator-phase-5` |
| **Código** | `pdv-importados/lib/decision-intelligence/providers/` |
| **Core** | tag `di-core-v1.0` — **intocado** |

---

## Princípio

**Providers só fazem I/O → FactEnvelope.**  
Não conhecem KPIs, Findings, Recommendations, Alerts, Action Plans nem UI.

```
Supabase (domínios operacionais)
        ↓
FactProviderPort.load(query)
        ↓
FactEnvelope[] (canônicos)
        ↓
runEngineLoop (Core)
```

## Cobertura Wave A (12/12)

| Provider | Tabela(s) | FactId | Desbloqueia KPI Cycle 2 |
|----------|-----------|--------|-------------------------|
| `createSaleFactProvider` | `vendas` via `caixas.loja_id` | SaleFact | GrossRevenue, NetRevenue, AverageTicket |
| `createSaleLineFactProvider` | `itens_venda` | SaleLineFact | dimensão (margem via Wave B) |
| `createSalePaymentFactProvider` | `vendas_pagamentos` | SalePaymentFact | dimensão |
| `createSaleReturnFactProvider` | `devolucoes` | SaleReturnFact | dimensão |
| `createStockPositionFactProvider` | `estoque` | StockPositionFact | dimensão (capital via Wave B) |
| `createInventoryMovementFactProvider` | `movimentos_estoque_log` | InventoryMovementFact | dimensão |
| `createProductFactProvider` | `produtos` | ProductFact | dimensão |
| `createProductPriceFactProvider` | `produtos` (preços) | ProductPriceFact | dimensão |
| `createArTitleFactProvider` | `contas_receber` | ArTitleFact | ArAging + cash KPIs |
| `createApTitleFactProvider` | `contas_pagar` | ApTitleFact | ApAging + cash KPIs |
| `createCustomerFactProvider` | `clientes` | CustomerFact | dimensão (LTV via Wave B) |
| `createSupplierFactProvider` | `fornecedores` | SupplierFact | dimensão |

## Wiring

```ts
// app/api/cron/decision-intelligence/route.ts
providersFactory: () => createWaveAProviders(supabase)
```

`createEmptyWaveAProviders` permanece para testes offline.

## Janela e limites

- Default: últimos **90 dias** (`resolveFactWindow`)
- Limite: **5000** envelopes por provider (`FACT_LOAD_LIMIT`)
- Vendas: apenas `status = CONCLUIDA`

## Fora de escopo (ondas seguintes)

- Wave B: MarginFact, StockCapitalFact, CustomerPurchaseFact  
- Homologação E2E com dados de produção (Onda 2)

## Critério de conclusão

- ✅ Factory real no cron  
- ✅ Mappers cobertos por testes  
- ✅ Engine Loop com SaleFact+AR+AP → KPIs SUPPORTADOS (não BLOCKED)  
