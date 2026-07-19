# Catálogo Semântico — Column → Fact (Decision Intelligence)

| Campo | Valor |
|--------|--------|
| **Status** | Congelado para scaffold DI — **somente documentação** |
| **Data** | 2026-07-19 |
| **Missão** | Inventário Semântico (Column → Fact) antes de `shared-core/src/intelligence` |
| **ADRs** | [ADR-011](../adr/ADR-011-decision-intelligence.md) · [ADR-005](../adr/ADR-005-fronteiras-dominio-shared-core.md) · [ADR-007](../adr/ADR-007-products-domain-boundary.md) · [ADR-008](../adr/ADR-008-inventory-domain-boundary.md) · [ADR-009](../adr/ADR-009-cash-domain-boundary.md) · [ADR-010](../adr/ADR-010-financial-domain-boundary.md) |
| **Relacionados** | [FINANCIAL_INTELLIGENCE.md](./FINANCIAL_INTELLIGENCE.md) · inventários de autoridade |
| **Proibido nesta missão** | Código · interfaces · stubs · ports · SQL · migrations · telas |

---

## 1. Objetivo

Responder documentalmente:

> **De onde vem cada informação utilizada pela Decision Intelligence?**

Sem este catálogo há risco de KPIs duplicados, cálculos inconsistentes, múltiplas interpretações da mesma métrica e violação de Single Source of Truth (SSoT).

**Norma:** Decision Intelligence **nunca** é SSoT operacional. Todo Fact canônico aponta para um **dono de domínio**. Fora desse dono, o valor só pode ser **lido** (via port futuro), nunca recalculado com regra alternativa.

---

## 2. Árvore de derivação (única fonte → decisão)

```
Domínios operacionais (SSoT — writers)
  sales · financial · inventory · cash · customers · suppliers · products · audit
        ↓
Facts canônicos (semântica estável — este catálogo)
        ↓
Decision Intelligence (ADR-011)
        ↓
KPIs (catálogo analítico versionado)
        ↓
Analysis (fatias: Financial / Sales / Inventory / Customer / Supplier / Executive)
        ↓
Recommendations + Alerts (contratos únicos)
        ↓
Action Plan (“o que fazer hoje?”)
        ↓
Decision Memory (outcomes 30 / 60 / 90 dias)
```

Tudo o que DI publica **deriva** desta cadeia. Nenhum KPI nasce “na UI” nem “no React”.

---

## 3. Convenções do catálogo

| Termo | Significado |
|-------|-------------|
| **Fonte** | Tabela, view, RPC de leitura ou evento de ledger |
| **Colunas DI** | Subconjunto relevante à inteligência (não dump completo do schema) |
| **Fact canônico** | Conceito semântico estável consumido por DI |
| **Owner** | Domínio SSoT do fato bruto |
| **Derived?** | `No` = fato do dono; `Yes` = composição tipada na borda DI **sem** mudar a fórmula do dono |
| **Confidence** | Quando o dado pode ser incompleto (`HIGH` / `MEDIUM` / `LOW` / `UNSUPPORTED`) |

### Status de prontidão

| Tag | Significado |
|-----|-------------|
| `READY` | Fonte estável o bastante para Fact v1 |
| `PARTIAL` | Existe, mas com lacuna conhecida |
| `BLOCKED` | Dependência frágil — não usar como SSoT analítico ainda |
| `CONTEXT` | Só contexto; não alimentar KPI empresarial sozinho |

### Caveat de types

`pdv-importados/lib/supabase/database.types.ts` foi **regenerado** na sprint [Foundation Hardening](./FOUNDATION_HARDENING.md) a partir do schema **local** (migrations).  
`GATE_DATABASE_TYPES_STALE` = **SATISFIED**. Permanecem gates de **qualidade de dado** (cliente↔venda, custo/margem, capital/kardex).  
Drift remoto: `venda_finance_context` pode estar ausente em produção — ver hardening §2.3.

---

## 4. Índice de Facts canônicos

| Fact | Owner | Prontidão |
|------|-------|-----------|
| `SaleFact` | sales | READY |
| `SaleLineFact` | sales | READY |
| `SalePaymentFact` | sales | READY |
| `SaleDiscountFact` | sales | PARTIAL |
| `SaleReturnFact` | sales | READY |
| `SaleEventFact` | sales | READY |
| `SaleCustomerLinkFact` | sales (+ financial mirror) | PARTIAL |
| `MarginFact` | sales | PARTIAL |
| `ArTitleFact` | financial | READY |
| `ArLiquidationFact` | financial | READY |
| `ApTitleFact` | financial | READY |
| `ApPaymentFact` | financial | READY |
| `FinancialCategoryFact` | financial | PARTIAL |
| `StockPositionFact` | inventory | READY |
| `InventoryMovementFact` | inventory | READY |
| `StockCapitalFact` | inventory + products (custo) | PARTIAL |
| `CashSessionFact` | cash | READY |
| `CashExpectedFact` | cash | READY |
| `CashMovementFact` | cash | READY |
| `CustomerFact` | customers | READY |
| `CustomerCreditSnapshotFact` | customers + financial | PARTIAL |
| `CustomerPurchaseFact` | sales + customers | BLOCKED / PARTIAL |
| `SupplierFact` | suppliers | READY |
| `SupplierProductLinkFact` | suppliers (+ products) | READY |
| `SupplierPurchaseFact` | inventory/compras + financial | PARTIAL |
| `ProductFact` | products | READY |
| `ProductPriceFact` | products | READY |
| `ProductCostFact` | products | PARTIAL |
| `AuditSignalFact` | audit | READY |
| `OperationalTimelineFact` | audit (composição) | READY |

---

## 5. Sales

**Owner de domínio:** **sales** (ADR-005)  
**UI SSoT:** `/caixa` (criação), `/admin/vendas` (cancel/pós-venda)

### 5.1 Fontes

| Fonte | Tipo | Papel para DI |
|-------|------|---------------|
| `vendas` | tabela | Cabeçalho da venda |
| `itens_venda` | tabela | Linhas (qty, preço, custo snap) |
| `vendas_pagamentos` | tabela | SSoT do pagamento da venda |
| `descontos_venda` | tabela | Desconto gerente |
| `devolucoes` | tabela | Devolução / estorno parcial |
| `venda_eventos` | ledger | `SALE_REGISTERED` · `SALE_CANCELLED` · `SALE_PARTIAL_RETURN` |
| `venda_finance_context` | tabela | Espelho cliente / status pagamento / link CR |
| `vendas_canceladas_auditoria` | tabela | Motivo de cancelamento |
| `v_vendas_dia` · `v_top_produtos` | views | Atalhos analíticos (não SSoT) |
| `relatorio_margem_por_venda_periodo` | RPC leitura | Margem com flag `custo_confiavel` |

### 5.2 Colunas relevantes

#### `vendas`

| Coluna | Uso DI |
|--------|--------|
| `id` | `saleId` |
| `caixa_id` | vínculo turno |
| `operador_id` | dimensão operador |
| `data` · `created_at` | tempo |
| `status` | `CONCLUIDA` / `CANCELADA` |
| `tipo_venda` | `SEM_NF` / `COM_NF` |
| `total_bruto` · `total_desconto` · `total_liquido` | receita |
| `forma_pagamento` | legado single-pay (preferir `vendas_pagamentos`) |
| `idempotency_key` | dedupe |

#### `itens_venda`

| Coluna | Uso DI |
|--------|--------|
| `id` · `venda_id` · `produto_id` | identidade |
| `quantidade` | volume |
| `preco_unitario` · `preco_unitario_original` · `desconto_unitario` | preço/desconto |
| `custo_unitario_snap` | custo no momento da venda |
| `tipo_preco` · `tipo_preco_fonte` · `regra_aplicada_id` | explicabilidade de preço |

#### `vendas_pagamentos`

| Coluna | Uso DI |
|--------|--------|
| `id` · `venda_id` | identidade |
| `forma_pagamento` | `DINHEIRO` · `PIX` · `CARTAO_*` · `FIADO` |
| `valor` · `created_at` | valor / tempo |

#### `venda_eventos`

| Coluna | Uso DI |
|--------|--------|
| `event_type` | tipo de evento |
| `sale_id` · `loja_id` · `caixa_id` · `operador_id` | escopo |
| `total` · `total_bruto` · `items` (jsonb) | payload |
| `occurred_at` · `source` · `idempotency_key` | tempo / origem |

#### `venda_finance_context`

| Coluna | Uso DI |
|--------|--------|
| `venda_id` · `cliente_id` · `loja_id` | vínculo cliente |
| `status_pagamento` | `PAGO` · `PARCIAL` · `ABERTO` |
| `conta_referencia` | → `contas_receber` |

### 5.3 Facts

#### `SaleFact`

| Campo | Valor |
|-------|-------|
| **Owner** | **sales** |
| **Fontes** | `vendas` (+ filtro status) |
| **Campos canônicos** | `saleId`, `storeId?` (via caixa/loja), `operatorId`, `occurredAt`, `status`, `grossAmount`, `discountAmount`, `netAmount`, `saleType` |
| **Nunca recalcular fora** | Totais da venda concluída — autoridade = linha `vendas` / ledger de evento |
| **KPIs** | Receita, Receita líquida, Ticket médio, Frequência (agregado) |
| **Recommendations** | `REC_DISCOUNT_MARGIN_HIT` (com desconto), mix/receita |
| **Alerts** | `ALT_MARGIN_DROP` (agregado), desvio de receita vs baseline |
| **Prontidão** | READY |

#### `SaleLineFact`

| Campo | Valor |
|-------|-------|
| **Owner** | **sales** |
| **Fontes** | `itens_venda` |
| **Campos canônicos** | `saleLineId`, `saleId`, `productId`, `quantity`, `unitPrice`, `unitDiscount`, `unitCostSnap`, `priceType` |
| **KPIs** | Margem, Lucro bruto, Giro (demanda), Capital (demanda) |
| **Recommendations** | `REC_SKU_SLOW_CAPITAL` (com estoque), margem por SKU |
| **Alerts** | SKU com margem negativa (se custo confiável) |
| **Prontidão** | READY |

#### `SalePaymentFact`

| Campo | Valor |
|-------|-------|
| **Owner** | **sales** |
| **Fontes** | `vendas_pagamentos` |
| **Campos canônicos** | `paymentId`, `saleId`, `method`, `amount`, `paidAt` |
| **Nota** | **Não** confundir com `CashMovementFact` nem com liquidação AR |
| **KPIs** | Mix de meios; entrada para fluxo (FIADO → AR) |
| **Recommendations** | Pressão de caixa por mix FIADO |
| **Alerts** | — |
| **Prontidão** | READY |

#### `SaleDiscountFact`

| Campo | Valor |
|-------|-------|
| **Owner** | **sales** |
| **Fontes** | `descontos_venda` (+ `vendas.total_desconto`) |
| **Campos canônicos** | `saleId`, `managerId`, `percent`, `amount`, `appliedAt?` |
| **Lacuna** | `operador_id` / `aplicado_em` podem faltar em types/produção |
| **KPIs** | Receita líquida, Margem |
| **Recommendations** | `REC_DISCOUNT_MARGIN_HIT` |
| **Alerts** | Desconto acima de limiar |
| **Prontidão** | PARTIAL |

#### `SaleReturnFact`

| Campo | Valor |
|-------|-------|
| **Owner** | **sales** |
| **Fontes** | `devolucoes`, evento `SALE_PARTIAL_RETURN` |
| **Campos canônicos** | `returnId`, `saleId`, `amount`, `method`, `reason`, `returnedAt` |
| **KPIs** | Receita líquida |
| **Recommendations** | Qualidade / devolução elevada por SKU |
| **Alerts** | Pico de devoluções |
| **Prontidão** | READY |

#### `SaleEventFact`

| Campo | Valor |
|-------|-------|
| **Owner** | **sales** |
| **Fontes** | `venda_eventos` |
| **Campos canônicos** | `eventId`, `eventType`, `saleId`, `storeId`, `occurredAt`, `source`, `payload` |
| **KPIs** | Contagens / séries temporais (preferível a re-derivar de `vendas` quando o ledger for a trilha) |
| **Recommendations** / **Alerts** | Gatilho near-realtime |
| **Prontidão** | READY |

#### `SaleCustomerLinkFact`

| Campo | Valor |
|-------|-------|
| **Owner** | **sales** (contexto); identidade cliente = **customers** |
| **Fontes** | `venda_finance_context.cliente_id` (não há `vendas.cliente_id`) |
| **Campos canônicos** | `saleId`, `customerId`, `paymentStatus`, `arTitleId?` |
| **Lacuna** | Cobertura incompleta se venda sem contexto financeiro |
| **KPIs** | LTV, Frequência, Churn, Ticket por cliente |
| **Recommendations** | `REC_CUSTOMER_CHURN_RISK` |
| **Alerts** | `ALT_CUSTOMER_INACTIVE` |
| **Prontidão** | PARTIAL |

#### `MarginFact`

| Campo | Valor |
|-------|-------|
| **Owner** | **sales** (fato de margem da venda/linha) |
| **Fontes** | `itens_venda` (`preco` − `custo_unitario_snap`) · RPC `relatorio_margem_por_venda_periodo` |
| **Campos canônicos** | `saleId` / `saleLineId`, `netRevenue`, `estimatedCost`, `grossMargin`, `costReliable` |
| **Norma** | **Nunca recalcular margem fora de sales** com `produtos.preco_custo` atual como se fosse custo histórico da venda — isso muda o passado. Custo atual = `ProductCostFact` (outro Fact). |
| **Dependência de custo** | Snapshot em sales; cadastro em products |
| **KPIs** | Margem, Lucro bruto |
| **Recommendations** | `REC_DISCOUNT_MARGIN_HIT`, `REC_SUPPLIER_MARGIN_DRAG` (join) |
| **Alerts** | `ALT_MARGIN_DROP` |
| **Prontidão** | PARTIAL (`costReliable` / snap null → `confidence` ↓) |

### 5.4 Eventos sales

| event_type | Fact gerado |
|------------|-------------|
| `SALE_REGISTERED` | `SaleEventFact` + implica `SaleFact` |
| `SALE_CANCELLED` | `SaleEventFact` (+ auditoria cancel) |
| `SALE_PARTIAL_RETURN` | `SaleEventFact` + `SaleReturnFact` |

---

## 6. Financial

**Owner:** **financial** (ADR-010)  
**UI SSoT:** `/admin/financeiro`  
**Não owns:** caixa físico (cash)

### 6.1 Fontes

| Fonte | Tipo |
|-------|------|
| `contas_receber` | tabela |
| `liquidacoes_receber` | tabela |
| `contas_pagar` | tabela |
| `contas_pagar_pagamentos` | tabela |
| `categorias_financeiras` | tabela satélite (sem FK forte nos títulos) |

### 6.2 Colunas relevantes

#### `contas_receber`

`id`, `loja_id`, `cliente_id`, `venda_id?`, `valor_total`, `valor_aberto`, `vencimento`, `status` (`ABERTO`\|`PARCIAL`\|`QUITADO`\|`CANCELADO`), `descricao`, `created_at`

#### `liquidacoes_receber`

`id`, `titulo_id`, `valor`, `forma_pagamento`, `created_by`, `created_at`, `observacao`

#### `contas_pagar`

`id`, `loja_id`, `fornecedor_id`, `valor_total`, `valor_pago`, `vencimento`, `status`, `nfe_importacao_id?`, `nfe_numero?`, timestamps / cancel

#### `contas_pagar_pagamentos`

`id`, `conta_id`, `valor`, `forma_pagamento`, `data_pagamento`, `usuario_id?`, `created_at`

### 6.3 Facts

#### `ArTitleFact`

| Campo | Valor |
|-------|-------|
| **Owner** | **financial** |
| **Campos** | `titleId`, `storeId`, `customerId`, `saleId?`, `total`, `openAmount`, `dueDate`, `status`, `createdAt` |
| **KPIs** | Aging AR, Fluxo projetado, Liquidez, Cobertura de caixa |
| **Recommendations** | `REC_AR_AGING_PRESSURE` |
| **Alerts** | `ALT_AR_BUCKET_90`, `ALT_CASH_COVERAGE_LOW` (via forecast) |
| **Prontidão** | READY |

#### `ArLiquidationFact`

| Campo | Valor |
|-------|-------|
| **Owner** | **financial** |
| **Campos** | `liquidationId`, `titleId`, `amount`, `method`, `liquidatedAt`, `actorId` |
| **KPIs** | Fluxo projetado (calibração histórica), Liquidez |
| **Recommendations** / **Alerts** | Atualização de cobertura |
| **Prontidão** | READY |

#### `ApTitleFact`

| Campo | Valor |
|-------|-------|
| **Owner** | **financial** |
| **Campos** | `titleId`, `storeId`, `supplierId`, `total`, `paidAmount`, `dueDate`, `status`, `nfeRef?` |
| **KPIs** | Aging AP, Fluxo projetado, Lucro líquido (despesas) |
| **Recommendations** | Priorizar pagamentos / renegociação |
| **Alerts** | AP vencido material |
| **Prontidão** | READY |

#### `ApPaymentFact`

| Campo | Valor |
|-------|-------|
| **Owner** | **financial** |
| **Campos** | `paymentId`, `titleId`, `amount`, `method`, `paidAt` |
| **KPIs** | Fluxo / liquidez |
| **Prontidão** | READY |

#### `FinancialCategoryFact`

| Campo | Valor |
|-------|-------|
| **Owner** | **financial** |
| **Fontes** | `categorias_financeiras` |
| **Lacuna** | Sem FK sistemática em AR/AP → taxonomia de despesa **fraca** para Lucro líquido |
| **KPIs** | Lucro líquido (só quando classificação existir) |
| **Prontidão** | PARTIAL |

### 6.4 Eventos financial

Não há ledger `*_eventos` dedicado. **Proxies:** INSERT em `liquidacoes_receber` / `contas_pagar_pagamentos`; criação de CR na venda parcial = **sales-led** (efeito financial na mesma orquestração).

---

## 7. Inventory

**Owner:** **inventory** (ADR-008)  
**UI SSoT:** `/admin/estoque/*`

### 7.1 Fontes

| Fonte | Tipo |
|-------|------|
| `estoque` | saldo |
| `movimentos_estoque_log` | kardex append-only |
| `tipos_movimento_estoque` | catálogo de tipos |
| `v_kardex_unificado` · `v_estoque_baixo` | views leitura |
| `estoque_baixas` / reposições | idempotência (não KPI direto) |
| Satélites compra | `importacoes_nfe`, remessas, `ordens_compra` |

### 7.2 Colunas relevantes

#### `estoque`

`id`, `loja_id`, `produto_id`, `quantidade_atual`, `estoque_minimo`, `version`, `updated_at`

#### `movimentos_estoque_log`

`id`, `loja_id`, `produto_id`, `tipo_codigo`, `quantidade_delta`, `usuario_id`, `venda_id?`, `remessa_id?`, `observacao`, `created_at`

Tipos típicos: `SAIDA_VENDA`, `ENTRADA_CANCELAMENTO_VENDA`, `ENTRADA_DEVOLUCAO_CLIENTE`, `ENTRADA_AJUSTE`, `SAIDA_AJUSTE`, `ENTRADA_NFE`, transferências, etc.

### 7.3 Facts

#### `StockPositionFact`

| Campo | Valor |
|-------|-------|
| **Owner** | **inventory** |
| **Campos** | `storeId`, `productId`, `quantityOnHand`, `minQuantity`, `updatedAt` |
| **Norma** | UI/cache **nunca** SSoT de saldo |
| **KPIs** | Capital imobilizado, Giro, cobertura |
| **Recommendations** | `REC_SKU_SLOW_CAPITAL` |
| **Alerts** | `ALT_SKU_OVERSTOCK`, estoque baixo (`v_estoque_baixo`) |
| **Prontidão** | READY |

#### `InventoryMovementFact`

| Campo | Valor |
|-------|-------|
| **Owner** | **inventory** |
| **Campos** | `movementId`, `storeId`, `productId`, `typeCode`, `quantityDelta`, `occurredAt`, `saleId?`, `actorId` |
| **KPIs** | Giro, auditoria de capital |
| **Recommendations** / **Alerts** | Anomalias de ajuste / perda |
| **Prontidão** | READY |

#### `StockCapitalFact` (derivado controlado)

| Campo | Valor |
|-------|-------|
| **Owner qty** | **inventory** |
| **Owner unit cost** | **products** (`ProductCostFact`) |
| **Fórmula conceitual** | `Σ qty × unitCostAdopted` |
| **Norma** | DI publica o derivado; **não** inventa custo no inventory ledger (kardex sem custo unitário hoje) |
| **KPIs** | Capital imobilizado |
| **Recommendations** | `REC_SKU_SLOW_CAPITAL` |
| **Alerts** | `ALT_SKU_OVERSTOCK` |
| **Prontidão** | PARTIAL |
| **Confidence** | ↓ se `preco_custo` null / zerado |

---

## 8. Cash

**Owner:** **cash** (ADR-009, ADR-CAIXA-002)  
**Não owns:** `vendas_pagamentos` (sales), AR/AP (financial)

### 8.1 Fontes

| Fonte | Tipo |
|-------|------|
| `caixas` | sessão |
| `movimentacoes_caixa` | sangria/suprimento |
| `calcular_valor_sistema_dinheiro_caixa` | RPC — **autoridade de \(E(c)\)** |

### 8.2 Colunas relevantes

#### `caixas`

`id`, `loja_id`, `operador_id`, `status`, `data_abertura`, `data_fechamento`, `valor_inicial`, `saldo_atual`, `valor_fechamento`, `fechamento_diferenca`, …

#### `movimentacoes_caixa`

`id`, `caixa_id`, `tipo` (`SANGRIA`\|`SUPRIMENTO`), `valor`, `status`, `forma_pagamento`, `motivo` / `motivo_codigo`, `saldo_antes` / `saldo_depois`, `operador_id`, `gerente_id?`, `idempotency_key`, timestamps

### 8.3 Facts

#### `CashSessionFact`

| Campo | Valor |
|-------|-------|
| **Owner** | **cash** |
| **Campos** | `sessionId`, `storeId`, `operatorId`, `status`, `openedAt`, `closedAt?`, `openingFloat`, `physicalBalance` (`saldo_atual`) |
| **Norma** | `saldo_atual` = contador físico (**não** fluxo empresarial 30d) |
| **KPIs** | Contextuais de operação; **não** Cobertura de caixa empresarial |
| **Prontidão** | READY · tag **CONTEXT** para forecast DI |

#### `CashExpectedFact`

| Campo | Valor |
|-------|-------|
| **Owner** | **cash** |
| **Fontes** | RPC `calcular_valor_sistema_dinheiro_caixa` |
| **Campos** | `sessionId`, `expectedCashE`, `computedAt` |
| **Norma** | Única autoridade de esperado do turno — **não** reimplementar em DI |
| **KPIs** | Divergência de fechamento (ops); não substituir `kpi.cash_flow_forecast` |
| **Prontidão** | READY · **CONTEXT** |

#### `CashMovementFact`

| Campo | Valor |
|-------|-------|
| **Owner** | **cash** |
| **Campos** | `movementId`, `sessionId`, `type`, `amount`, `status`, `reasonCode`, `occurredAt` |
| **KPIs** | Contexto de liquidez física do turno |
| **Prontidão** | READY · **CONTEXT** |

**Separação explícita (ADR-011 / FI):**

| Conceito | Fact | Dono |
|----------|------|------|
| Esperado do turno \(E(c)\) | `CashExpectedFact` | cash |
| Fluxo de caixa 30 dias | derivado de `Ar*` / `Ap*` / sales crédito | financial + sales → KPI FI |

---

## 9. Customer

**Owner:** **customers**  
**UI SSoT:** `/admin/clientes`

### 9.1 Fontes

| Fonte | Tipo |
|-------|------|
| `clientes` | tabela |
| `v_clientes_gerente` | view (`saldo_crediario`, `ultima_compra` — esta última **NULL/stub** hoje) |

### 9.2 Colunas relevantes

`id`, `loja_id`, `nome`, `documento`, `email`, `telefone`, `limite_credito`, `ativo`, `created_at`, (+ `tipo`, `endereco` em migrations)

View: `saldo_crediario` (soma AR aberto/parcial), `ultima_compra` (**não confiável hoje**)

### 9.3 Facts

#### `CustomerFact`

| Campo | Valor |
|-------|-------|
| **Owner** | **customers** |
| **Campos** | `customerId`, `storeId`, `name`, `document`, `active`, `creditLimit`, `createdAt` |
| **KPIs** | dimensão de LTV/Churn/Frequência |
| **Prontidão** | READY |

#### `CustomerCreditSnapshotFact`

| Campo | Valor |
|-------|-------|
| **Owner leitura composta** | customers (identidade) + **financial** (AR) |
| **Fontes** | `v_clientes_gerente.saldo_crediario` **ou** agregação de `ArTitleFact` |
| **Norma** | Saldo em aberto = **financial**; view é conveniência |
| **KPIs** | Aging por cliente, risco de crédito |
| **Prontidão** | PARTIAL |

#### `CustomerPurchaseFact`

| Campo | Valor |
|-------|-------|
| **Owner dos fatos de compra** | **sales** |
| **Owner da identidade** | **customers** |
| **Fontes** | `SaleFact` + `SaleCustomerLinkFact` |
| **Campos** | `customerId`, `saleId`, `netAmount`, `occurredAt` |
| **Lacuna crítica** | Sem vínculo cliente estável em 100% das vendas → recência/frequência **BLOCKED/PARTIAL** |
| **KPIs** | Ticket médio (cliente), Frequência, LTV, Churn |
| **Recommendations** | `REC_CUSTOMER_CHURN_RISK` |
| **Alerts** | `ALT_CUSTOMER_INACTIVE` |
| **Prontidão** | BLOCKED até cobertura de link; PARTIAL com `venda_finance_context` |

**Norma:** DI **não** usa `v_clientes_gerente.ultima_compra` como SSoT enquanto for stub.

---

## 10. Supplier

**Owner identidade:** **suppliers** (`/admin/fornecedores`)  
**Vínculo SKU:** `vinculos_fornecedor_produto` + `produtos.fornecedor_id` (products)

### 10.1 Fontes

| Fonte | Tipo |
|-------|------|
| `fornecedores` | master (`id`, `cnpj`, `nome`, timestamps) — sem `loja_id` |
| `vinculos_fornecedor_produto` | De-Para loja/SKU |
| `importacoes_nfe` | compra / entrada |
| `contas_pagar` | obrigação |
| `ordens_compra` (+ itens) | intenção de compra (se usado) |

### 10.2 Facts

#### `SupplierFact`

| Campo | Valor |
|-------|-------|
| **Owner** | **suppliers** |
| **Campos** | `supplierId`, `taxId` (CNPJ), `name` |
| **Lacuna** | Sem lead time / prazo / rating no master |
| **Prontidão** | READY (master fino) |

#### `SupplierProductLinkFact`

| Campo | Valor |
|-------|-------|
| **Owner** | **suppliers** (vínculo); produto = **products** |
| **Fontes** | `vinculos_fornecedor_produto`, `produtos.fornecedor_id` |
| **Campos** | `storeId`, `supplierId`, `productId`, `supplierSkuRef?` |
| **KPIs** | Margem / capital por fornecedor (join) |
| **Prontidão** | READY |

#### `SupplierPurchaseFact`

| Campo | Valor |
|-------|-------|
| **Owner efeitos** | inventory (entrada) + financial (AP) + fiscal context |
| **Fontes** | `importacoes_nfe`, `ApTitleFact`, movimentos `ENTRADA_NFE` |
| **Campos** | `supplierId`, `storeId`, `documentRef?`, `amount?`, `receivedAt`, `apTitleId?` |
| **KPIs** | tendência de custo; Aging AP por fornecedor |
| **Recommendations** | `REC_SUPPLIER_MARGIN_DRAG` |
| **Alerts** | Custo ↑ + margem ↓ |
| **Prontidão** | PARTIAL |

---

## 11. Product

**Owner:** **products** (ADR-007)  
**UI SSoT:** `/admin/catalogo`  
**Preço efetivo de venda:** RPC `calcular_preco_produto` (não a UI)

### 11.1 Fontes

| Fonte | Tipo |
|-------|------|
| `produtos` | catálogo |
| `precos_atacado` | faixas |
| `categorias` · `marcas` | taxonomia |
| `calcular_preco_produto` | preço efetivo |

### 11.2 Colunas relevantes (`produtos`)

| Coluna | Fact |
|--------|------|
| `id`, `loja_id`, `nome`, `codigo_barras`, `codigo_interno` | identidade |
| `categoria_id`, `marca_id`, `fornecedor_id` | dimensões |
| `preco_varejo`, `preco_atacado` | `ProductPriceFact` (cadastro) |
| `preco_custo`, `preco_custo_medio` | `ProductCostFact` |
| `ativo`, `status_publicacao` | elegibilidade |
| Campos fiscais (`ncm`, `cfop_produto`, …) | **CONTEXT fiscal** — não KPI DI |

### 11.3 Facts

#### `ProductFact`

| Campo | Valor |
|-------|-------|
| **Owner** | **products** |
| **Campos** | `productId`, `storeId`, `name`, `skuCodes`, `categoryId`, `brandId`, `supplierId?`, `active`, `publishStatus` |
| **KPIs** | dimensão de todos os KPIs por SKU |
| **Prontidão** | READY |

#### `ProductPriceFact`

| Campo | Valor |
|-------|-------|
| **Owner** | **products** |
| **Campos** | `productId`, `listRetail`, `listWholesale`, `effectivePrice?` (via RPC no momento da consulta) |
| **Norma** | Preço cobrado na venda passada = `SaleLineFact`, não o preço atual do cadastro |
| **Prontidão** | READY |

#### `ProductCostFact`

| Campo | Valor |
|-------|-------|
| **Owner** | **products** |
| **Campos** | `productId`, `cost`, `averageCost`, `asOf` |
| **Norma** | Custo **atual** de catálogo; margem histórica da venda usa `SaleLineFact.unitCostSnap` |
| **KPIs** | Capital imobilizado (com estoque), tendência de custo fornecedor |
| **Prontidão** | PARTIAL (qualidade / preenchimento variável) |

---

## 12. Audit

**Owner timeline operacional:** **auditoria** (UI `/admin/auditoria`) — composição read-only  
**Não é** o inbox de Alert DI (ADR-011)

### 12.1 Fontes

| Fonte | Papel |
|-------|-------|
| `venda_eventos` | vendas |
| `vendas_canceladas_auditoria` | cancel + motivo |
| `movimentos_estoque_log` | ajustes |
| `descontos_venda` | desconto gerente |
| `system_alerts` | anomalias leves (`margem_negativa`, `preco_fora_padrao`, `estoque_inconsistente`) |

Tipos de UI (`AuditoriaTipo`): `VENDA` · `CANCELAMENTO` · `AJUSTE_ESTOQUE` · `ALERTA` · `DESCONTO` — **não** enums de banco únicos.

### 12.2 Facts

#### `AuditSignalFact`

| Campo | Valor |
|-------|-------|
| **Owner** | **audit** (sinal); fatos subjacentes nos donos |
| **Fontes** | `system_alerts` |
| **Campos** | `signalId`, `tipo`, `storeId?`, `productId?`, `saleId?`, `detail`, `createdAt` |
| **KPIs** | nenhum próprio — input de evidência |
| **Recommendations** / **Alerts DI** | pode **correlacionar**; não substitui `Alert` ADR-011 |
| **Prontidão** | READY |

#### `OperationalTimelineFact`

| Campo | Valor |
|-------|-------|
| **Owner** | **audit** (composição); cada item aponta ao dono |
| **Campos** | `entryId`, `kind`, `occurredAt`, `actorId`, `refs[]`, `summaryCodes` |
| **Uso DI** | Evidência / rastreio; Decision Memory correlaciona ids |
| **Futuro DI** | eventos `INTEL_ALERT_*` em store DI — **não** misturar com SSoT operacional |
| **Prontidão** | READY |

---

## 13. Matriz Fact → KPI → Recommendation → Alert

| Fact | KPIs (catálogo FI / ADR-011) | Recommendations (exemplos) | Alerts (exemplos) |
|------|------------------------------|----------------------------|-------------------|
| `SaleFact` | Receita, Receita líquida, Ticket médio | mix / meta | desvio receita |
| `SaleLineFact` | Margem, Lucro bruto, Giro | SKU / margem | margem negativa |
| `SalePaymentFact` | (mix meios); input fluxo se FIADO | pressão FIADO | — |
| `SaleDiscountFact` | Receita líquida, Margem | `REC_DISCOUNT_MARGIN_HIT` | desconto alto |
| `SaleReturnFact` | Receita líquida | qualidade SKU | pico devolução |
| `SaleEventFact` | séries / contagens | gatilhos | near-realtime |
| `SaleCustomerLinkFact` | LTV, Frequência, Churn | `REC_CUSTOMER_CHURN_RISK` | `ALT_CUSTOMER_INACTIVE` |
| `MarginFact` | Margem, Lucro bruto | margem / desconto / fornecedor | `ALT_MARGIN_DROP` |
| `ArTitleFact` · `ArLiquidationFact` | Aging, Fluxo, Liquidez, Cobertura | `REC_AR_AGING_PRESSURE` | `ALT_AR_BUCKET_90`, cobertura |
| `ApTitleFact` · `ApPaymentFact` | Aging AP, Fluxo, Lucro líquido | pagar / renegociar | AP vencido |
| `StockPositionFact` · `InventoryMovementFact` | Giro, Capital | `REC_SKU_SLOW_CAPITAL` | `ALT_SKU_OVERSTOCK` |
| `StockCapitalFact` | Capital imobilizado | idem | idem |
| `CashSessionFact` · `CashExpectedFact` · `CashMovementFact` | ops turno (**CONTEXT**) | — | divergência fechamento (ops) |
| `CustomerFact` · `CustomerPurchaseFact` | LTV, Frequência, Churn, Ticket | churn | inativo |
| `SupplierFact` · `SupplierPurchaseFact` · links | margem fornecedor, Aging AP | `REC_SUPPLIER_MARGIN_DRAG` | custo↑ |
| `ProductFact` · `ProductCostFact` · `ProductPriceFact` | dimensões custo/preço | capital / margem | — |
| `AuditSignalFact` | — | evidência | correlaciona |

---

## 14. Regras anti-duplicação (obrigatórias no scaffold futuro)

1. **Um conceito → um Fact owner.** Ex.: pagamento da venda = `SalePaymentFact` (sales), nunca “recriado” a partir de `movimentacoes_caixa`.  
2. **Margem histórica da venda** = `MarginFact` / `SaleLineFact` (sales). **Custo de catálogo atual** = `ProductCostFact` (products). Não misturar.  
3. **Saldo** = `StockPositionFact` (inventory). Quantidade vendida = `SaleLineFact` (sales).  
4. **\(E(c)\)** = `CashExpectedFact` (cash). **Fluxo 30d** = KPIs a partir de AR/AP/sales — outro conceito.  
5. **Cliente na venda** só via `SaleCustomerLinkFact`; não inventar `vendas.cliente_id` analiticamente.  
6. **Views/RPCs analíticos** (`v_vendas_dia`, `relatorio_*`) são **atalhos de leitura**, não segunda SSoT — Facts canônicos preferem tabelas/ledgers dos donos.  
7. **Fiscal** enriquece compra/documento; não define Fact de KPI DI.  
8. DI **não escreve** nenhuma tabela listada como fonte operacional.

---

## 15. Lacunas que bloqueiam ou degradam DI

| ID | Lacuna | Impacto | Facts afetados | Mitigação analítica |
|----|--------|---------|----------------|---------------------|
| G1 | Link cliente↔venda incompleto; `ultima_compra` stub | Churn/LTV fracos | `CustomerPurchaseFact` | `confidence: LOW/UNSUPPORTED`; priorizar cobertura de `venda_finance_context` |
| G2 | `custo_unitario_snap` null / não confiável | Margem distorcida | `MarginFact` | usar `costReliable`; não inventar |
| G3 | Kardex sem custo unitário | Capital aproximado | `StockCapitalFact` | qty × `ProductCostFact` + limitations |
| G4 | `categorias_financeiras` sem FK em títulos | Lucro líquido incompleto | despesas | escopo tenant / PARTIAL |
| G5 | `database.types.ts` stale | ~~Risco~~ | vários | **Mitigado** (Foundation Hardening — regen local). Reabrir se migrations novas sem regen |
| G6 | Sem ledger de eventos financial | Near-realtime AR/AP | `Ar*` / `Ap*` | poll/CDC futuro; Fase 1 on-read ok |
| G7 | Master fornecedor fino | Supplier Intelligence limitada | `SupplierFact` | começar por join custo/AP |

---

## 16. Ordem sugerida de Facts no scaffold futuro

> Ainda **sem código** nesta missão. Ordem apenas para a próxima etapa.

1. `SaleFact`, `SaleLineFact`, `SalePaymentFact`, `SaleEventFact`  
2. `ArTitleFact`, `ArLiquidationFact`, `ApTitleFact`, `ApPaymentFact`  
3. `StockPositionFact`, `InventoryMovementFact`  
4. `ProductFact`, `ProductCostFact`  
5. `MarginFact`, `StockCapitalFact` (com `confidence`)  
6. `CustomerFact` + `SaleCustomerLinkFact` (degradar se parcial)  
7. `SupplierFact`, `SupplierProductLinkFact`  
8. Cash Facts como **CONTEXT** apenas  
9. Audit Facts para evidência / correlação  

Contratos TypeScript nascerão **nomeados a partir deste catálogo**, não o contrário.

---

## 17. Critérios de aceite desta missão

| Critério | Status |
|----------|--------|
| Catálogo em `docs/architecture/DECISION_FACT_CATALOG.md` | **Sim** |
| Domínios Sales…Audit mapeados com fonte / colunas / Fact / owner | **Sim** |
| Árvore Facts → KPIs → Analysis → Recommendations → Action Plan → Memory | **Sim** |
| Dependências KPI / Recommendation / Alert por Fact | **Sim** (§13) |
| Sem código / interfaces / stubs / ports | **Sim** |
| Lacunas explícitas (anti surpresa no scaffold) | **Sim** (§15) |

---

## 18. Próximo passo

Somente após este catálogo:

1. Scaffold mínimo `shared-core/src/intelligence` com **nomes de Fact alinhados a este documento**.  
2. Stubs de contrato / types sem I/O.  
3. Depois: um `*FactsReader` read-only para um único Fact (`SaleFact` ou `ArTitleFact`).

**GO scaffold de código:** desbloqueado do ponto de vista semântico.  
**NO-GO ainda:** UI, SQL novo, migrations, escrita operacional.
`)