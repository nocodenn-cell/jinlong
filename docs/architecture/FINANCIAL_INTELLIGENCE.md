# Arquitetura — Inteligência Financeira (Business Intelligence)

| Campo | Valor |
|--------|--------|
| **Status** | Fatia sob [ADR-011 Decision Intelligence](../adr/ADR-011-decision-intelligence.md) — **sem implementação de código** |
| **Data** | 2026-07-19 (atualizado com ADR-011) |
| **Produto** | Jinlong (ERP orientado à decisão) |
| **Escopo** | Desenho da fatia Financial Intelligence (FI) dentro de Decision Intelligence (DI) |
| **ADRs relacionados** | [ADR-011](../adr/ADR-011-decision-intelligence.md) · [ADR-005](../adr/ADR-005-fronteiras-dominio-shared-core.md) · [ADR-006](../adr/ADR-006-frontend-domain-boundaries.md) · [ADR-008](../adr/ADR-008-inventory-domain-boundary.md) · [ADR-009](../adr/ADR-009-cash-domain-boundary.md) · [ADR-010](../adr/ADR-010-financial-domain-boundary.md) |
| **Inventários** | [Financial](./inventario_financial_autoridade.md) · [Inventory](./inventario_inventory_autoridade.md) · [Cash](./inventario_cash_autoridade.md) · [Template domínio](./template_dominio_internacionalizado.md) |
| **Proibido nesta fase** | Telas · gráficos · SQL · migrations · APIs · alteração de domínio/banco/regras do Financeiro |

---

## 1. Visão geral

O Jinlong já opera o ciclo comercial (venda → estoque → pagamento → caixa → AR/AP). A Inteligência Financeira **não substitui** esses domínios: ela é a **fatia financeira** da camada [Decision Intelligence (ADR-011)](../adr/ADR-011-decision-intelligence.md), que interpreta fatos para apoiar decisões.

```
Perguntas do empresário
        ↓
Decision Intelligence (umbrella — ADR-011)
├── Financial Intelligence   ← este documento
├── Sales / Inventory / Customer / Supplier Intelligence
└── Executive Intelligence + Recommendation / Alert / Action Plan / Decision Memory
        ↓
Ports de leitura dos donos operacionais (SSoT)
        ↓
sales · financial · inventory · cash · products · customers · suppliers · fiscal*
```

\* Fiscal alimenta apenas contextos locais (documentos, obrigações). **Nunca** define KPI de inteligência nem regra de recomendação.

### Princípio central

> FI é uma **fatia derivada** de Decision Intelligence. Não cria verdade operacional. Não liquida título, não baixa estoque, não registra venda. Consome SSoT dos donos e produz indicadores, alertas e recomendações **explicáveis** sob os contratos únicos do ADR-011.

### Perguntas-alvo (capability map)

| Pergunta | Capability primária |
|----------|---------------------|
| Onde estou perdendo dinheiro? | Margin Analysis + Profit Opportunities |
| Qual cliente está prestes a deixar de comprar? | Customer Health |
| Quais produtos imobilizam capital? | Inventory Capital |
| Quanto caixa terei em 30 dias? | Cash Forecast |
| Qual fornecedor reduz minha margem? | Supplier Analysis |
| O que fazer hoje para aumentar lucro? | Action Plan (ADR-011) ← Recommendation + Alert Engines |

---

## 2. Objetivos

| # | Objetivo | Critério de sucesso arquitetural |
|---|----------|----------------------------------|
| O1 | Decisão assistida | Toda resposta FI tem evidências + fórmula + impacto |
| O2 | Escalabilidade | Capabilities independentes; evolução faseada sem big-bang |
| O3 | Baixo acoplamento | FI só depende de **ports de leitura** e eventos tipados |
| O4 | SSoT preservado | Domínios operacionais continuam únicos writers das suas tabelas |
| O5 | UI burra | React só renderiza DTOs; zero cálculo de KPI na UI |
| O6 | Internacionalizável | Inteligência independente de legislação fiscal local |
| O7 | Explicabilidade | Nenhuma recomendação “caixa-preta”; IA opcional e auditável |
| O8 | Reuso | Mesmo núcleo serve web, desktop e futuros canais |

---

## 3. Boundaries (fronteiras)

### 3.1 O que FI owns

| Owns | Descrição |
|------|-----------|
| Catálogo de KPIs | Definições, fórmulas conceituais, versões de cálculo |
| Capabilities de análise | Cash Forecast, Margin, Customer Health, etc. |
| Recommendation Engine | Pipeline problema → evidência → recomendação |
| Alert Engine | Detecção → evento de alerta → prioridade |
| Projeções / materializações de leitura | Snapshots derivados (futuros), nunca SSoT operacional |
| Contratos de saída | DTOs de insight, alerta, recomendação, série temporal |

### 3.2 O que FI não owns

| Não owns | Dono (SSoT) | ADR / referência |
|----------|-------------|------------------|
| Contas a receber / pagar | **financial** | ADR-010 |
| Venda, itens, pagamentos da venda | **sales** | ADR-005 |
| Saldo / kardex | **inventory** | ADR-008 |
| Turno, \(E(c)\), movs de gaveta | **cash** | ADR-009 |
| Catálogo / preço de cadastro | **products** | ADR-007 |
| Cadastro cliente | **customers** | entity-ssot `/admin/clientes` |
| Cadastro fornecedor | **suppliers** | entity-ssot `/admin/fornecedores` |
| Documentos fiscais / NF-e legal | **fiscal** | inventário Financial (fila fiscal) |
| UI CRUD de entidades | rotas entity-ssot | `.cursor/rules/entity-ssot.mdc` |

### 3.3 Regras de fronteira (normativas)

1. **FI nunca escreve** tabelas operacionais (`vendas`, `estoque`, `contas_*`, `caixas`, …).
2. **FI nunca importa UI** de outro domínio.
3. **FI não embute regra fiscal** (CFOP, CST, Focus NFe, etc.).
4. **Cálculo vive no core** (`shared-core`), não em Server Components/React.
5. Cross-domínio: apenas via **port de leitura** do dono ou **evento tipado** já emitido pelo dono.
6. Materializações FI (quando existirem) são **cache derivado**: invalidáveis, reconstruíveis, nunca autoridade.
7. Código novo de superfície FI segue ADR-006: `UI → adapter → shared-core → infra`.

### 3.4 Diagrama de fronteira

```
┌─────────────────────────────────────────────────────────────────┐
│                     APPS (pdv-importados / pdv-local)           │
│  UI FI (futura)  →  adapters FI (auth, I/O, i18n de codes)      │
└───────────────────────────────┬─────────────────────────────────┘
                                │
┌───────────────────────────────▼─────────────────────────────────┐
│     @fastproduct/shared-core/src/intelligence/  (DI — ADR-011)  │
│  fatias · KPIs · Recommendation · Alert · ActionPlan · Memory   │
│  (puro: sem React, sem Supabase, sem SQL)                       │
└───────┬───────────┬───────────┬───────────┬───────────┬─────────┘
        │ ports     │ ports     │ ports     │ ports     │ ports
        ▼           ▼           ▼           ▼           ▼
   sales      financial   inventory    cash     customers…
        │           │           │           │           │
        └───────────┴───────────┴───────────┴───────────┘
                          Postgres (autoridade operacional)
```

---

## 4. Responsabilidades

### 4.1 Camadas (hexagonal)

| Camada | Residência alvo | Faz | Não faz |
|--------|-----------------|-----|---------|
| **Domain core** | `shared-core/src/intelligence/` | Definir KPI, agregar fatos tipados, ranquear recomendações, emitir alertas tipados | I/O, React, SQL, locale |
| **Application services** | `shared-core/src/intelligence/services/` | Orquestrar capabilities; montar pipeline de recomendação | Conhecer Next/cookies |
| **Ports (inbound)** | `contracts.ts` | `InsightQueryService`, `AlertQueryService`, `RecommendationQueryService` | Implementar Postgres |
| **Ports (outbound)** | `contracts.ts` | `SalesFactsReader`, `ArApFactsReader`, `InventoryFactsReader`, … | Conhecer schema UI |
| **Adapters** | `app/admin/...` (futuro) | Auth, mapear rows→facts, chamar views/RPCs de leitura, `revalidatePath` | Regra de KPI |
| **UI** | rota futura (não entity-ssot de CRUD) | Exibir insights já calculados | Calcular margem, LTV, forecast |
| **Infra** | Postgres views/materialized (futuro) | Projeções de leitura | Virar SSoT operacional |

### 4.2 Árvore canônica (alvo — não criar nesta missão)

Árvore umbrella definida no [ADR-011](../adr/ADR-011-decision-intelligence.md). Sob a fatia financeira:

```
@fastproduct/shared-core/src/intelligence/
├── financial/               # esta fatia (FI)
│   ├── cashForecast/
│   ├── marginAnalysis/
│   └── …                    # capabilities financeiras
├── recommendation/          # contrato único ADR-011
├── alerts/
├── actionPlan/
├── decisionMemory/
├── kpi/
└── …                        # demais fatias (sales, inventory, customer, …)
```

Espelha o [template de domínio internacionalizado](./template_dominio_internacionalizado.md), com a diferença: FI/DI são **read-mostly / derivados**, não writers de entidade entity-ssot.

---

## 5. Capabilities

Cada capability tem **responsabilidade única**, contrato de entrada (facts) e saída (insights tipados). Capabilities **não se importam mutuamente** de forma cíclica; composição ocorre no Application Service / Executive Dashboard.

```
Decision Intelligence (ADR-011)
├── Financial Intelligence          ← foco deste doc
│   ├── Cash Forecast
│   ├── Margin Analysis
│   └── Profit Opportunities (âmbito $)
├── Sales / Inventory / Customer / Supplier Intelligence
├── Executive Intelligence
└── Recommendation · Alert · Action Plan · Decision Memory   ← transversais
```

> Capabilities detalhadas abaixo (§5.1–5.7) permanecem como desenho analítico; sob ADR-011, Customer Health → Customer Intelligence, Inventory Capital → Inventory Intelligence, Supplier Analysis → Supplier Intelligence, Executive Dashboard → Executive Intelligence.

### 5.1 Cash Forecast

| Item | Definição |
|------|-----------|
| **Responsabilidade** | Projetar posição de caixa / liquidez em horizonte N dias |
| **Não faz** | Abrir/fechar caixa; liquidar AR/AP; alterar \(E(c)\) |
| **Inputs** | Títulos AR/AP abertos, liquidações históricas, vendas a prazo, pagamentos programados |
| **Outputs** | Série `projected_cash[t]`, cobertura de caixa, cenários (base / conservador) |
| **Pergunta** | “Quanto caixa terei daqui a 30 dias?” |

### 5.2 Margin Analysis

| Item | Definição |
|------|-----------|
| **Responsabilidade** | Explicar margem e erosão por produto, categoria, canal, período |
| **Não faz** | Alterar preço de cadastro; reclassificar custo no operacional |
| **Inputs** | Receita líquida de vendas, custo associado (quando disponível), descontos, devoluções |
| **Outputs** | Margem %, lucro bruto, drivers de perda (desconto, custo, mix) |
| **Pergunta** | “Onde estou perdendo dinheiro?” |

### 5.3 Customer Health

| Item | Definição |
|------|-----------|
| **Responsabilidade** | Saúde comercial do cliente (frequência, recência, ticket, risco de churn) |
| **Não faz** | CRUD de cliente; CRM de campanha |
| **Inputs** | Histórico de vendas por cliente, AR em aberto/atraso |
| **Outputs** | Score de saúde, flags de risco, evidências (última compra, tendência) |
| **Pergunta** | “Qual cliente está prestes a deixar de comprar?” |

### 5.4 Supplier Analysis

| Item | Definição |
|------|-----------|
| **Responsabilidade** | Impacto do fornecedor em custo, prazo e margem dos produtos ligados |
| **Não faz** | CRUD de fornecedor; pagar AP |
| **Inputs** | AP, entradas NF-e/compras (efeito custo/estoque), vínculo produto↔fornecedor |
| **Outputs** | Ranking de erosão de margem, tendência de custo, atrasos de pagamento/entrega (quando houver dado) |
| **Pergunta** | “Qual fornecedor está reduzindo minha margem?” |

### 5.5 Inventory Capital

| Item | Definição |
|------|-----------|
| **Responsabilidade** | Capital parado em estoque, giro, SKUs “imobilizadores” |
| **Não faz** | Ajustar saldo; valuation como verdade contábil oficial sem missão de custo |
| **Inputs** | `estoque`, movimentos, custo disponível (cadastro / entrada), vendas por SKU |
| **Outputs** | Capital imobilizado, dias de estoque, ranking de SKUs lentos |
| **Pergunta** | “Quais produtos estão imobilizando capital?” |
| **Nota** | Valuation/custo médio pleno pode estar **fora do piloto** (ADR-008). Capability deve degradar com transparência (`evidence.confidence`). |

### 5.6 Profit Opportunities

| Item | Definição |
|------|-----------|
| **Responsabilidade** | Listar alavancas de lucro com impacto estimado |
| **Não faz** | Executar a ação (reprecificar, comprar, cobrar) |
| **Inputs** | Outputs de Margin, Inventory Capital, Customer Health, Supplier Analysis |
| **Outputs** | Lista priorizada de oportunidades tipadas |
| **Pergunta** | “O que devo fazer hoje para aumentar meu lucro?” |

### 5.7 Executive Dashboard

| Item | Definição |
|------|-----------|
| **Responsabilidade** | Compor read-model executivo (KPIs + alertas + top recomendações) |
| **Não faz** | Recalcular KPI do zero se o catálogo já expõe o valor; ser SSoT |
| **Inputs** | Capabilities + Alert Engine + Recommendation Engine |
| **Outputs** | `ExecutiveSnapshot` versionado por período/loja |

### 5.8 Recommendation Engine

Motor transversal — ver §9.

### 5.9 Alert Engine

Motor transversal — ver §10.

### 5.10 Matriz de coesão

| Capability | Coesão | Acoplamento permitido |
|------------|--------|------------------------|
| Cash Forecast | Alta (só liquidez temporal) | financial + sales (crédito) + cash (contexto, não contábil) |
| Margin Analysis | Alta | sales + products (+ custo quando houver) |
| Customer Health | Alta | sales + customers + financial (AR) |
| Supplier Analysis | Alta | suppliers + financial (AP) + purchases/NF-e custo |
| Inventory Capital | Alta | inventory + products + sales (giro) |
| Profit Opportunities | Média (orquestra) | somente outputs tipados das capabilities |
| Executive Dashboard | Baixa (compositor) | somente contracts públicos FI |
| Recommendation / Alert | Média | facts + outputs de capabilities |

---

## 6. Fluxo de dados

### 6.1 Fluxo canônico (leitura)

```
[Evento operacional no dono]
   ex.: SALE_REGISTERED · liquidação AR · movimento estoque
              │
              ▼
[Facts normalizados]  ← adapters implementam *FactsReader
   SaleFact · ArTitleFact · StockPositionFact · …
              │
              ▼
[KPI Catalog / Capability]  ← shared-core puro
              │
              ├─► KpiValue (+ formulaId, period, dimensions)
              ├─► Insight
              └─► (opcional) Projection store (materialização)
              │
              ▼
[Alert Engine] ──► AlertEvent
[Recommendation Engine] ──► Recommendation (com Evidence[])
              │
              ▼
[Adapter outbound / Query API futura]
              │
              ▼
[UI]  renderiza DTO — sem recalcular
```

### 6.2 Direção das dependências

```
UI FI  →  FI Adapters  →  intelligence (core)
                              │
                              │ outbound ports
                              ▼
                    Adapters dos donos (Readers)
                              │
                              ▼
                         Postgres / ledgers
```

**Proibido:** `sales` → `intelligence`; `financial` → `intelligence` (evita ciclo).  
Donos **emitem** fatos/eventos; FI **assina** (pull via reader ou futuro bus).

### 6.3 Modos de atualização (estratégia)

| Modo | Uso | Quando |
|------|-----|--------|
| **On-read** | Cálculo sob demanda a partir de facts | Fase 1 (indicadores básicos) |
| **Near-realtime** | Reage a eventos de ledger (`venda_eventos`, liquidações) | Fase 2–3 (alertas / forecast curto) |
| **Batch / snapshot** | Materializa séries e rankings | Fase 3+ (horizontes longos, benchmark) |

A arquitetura deve permitir trocar o modo **sem mudar** a definição do KPI (mesmo `kpiId` + `formulaVersion`).

---

## 7. Dependências

### 7.1 Dependências internas (domínios)

| Domínio | Tipo de dependência | Porta conceitual |
|---------|---------------------|------------------|
| sales | Leitura + eventos | `SalesFactsReader` |
| financial | Leitura AR/AP/liquidações | `ArApFactsReader` |
| inventory | Leitura saldo/movimentos | `InventoryFactsReader` |
| cash | Leitura contextual (turno/liquidez física ≠ contábil) | `CashContextReader` |
| products | Identidade SKU, preço/custo cadastro | `ProductFactsReader` |
| customers | Identidade e atributos não-PII sensíveis agregáveis | `CustomerFactsReader` |
| suppliers | Identidade e vínculo produto | `SupplierFactsReader` |
| fiscal | **Opcional / contexto local** — nunca bloqueante | `FiscalContextReader` (flags, não KPIs) |
| auditoria | Trilha de quem/quando; correlacionar insights | `AuditTrailReader` |

### 7.2 Dependências transversais

| Pacote / concern | Papel |
|------------------|-------|
| `shared-core/formatting` | Moeda, número, data — **na borda de apresentação** |
| `shared-core/locale` | Locale do tenant — FI não traduz strings |
| `shared-core/currency` | Código de moeda do tenant |
| Auth / loja | Multi-tenant: todo insight scoped por `loja_id` (e futuro `tenant_id`) |
| Observabilidade | Trace de cálculo (`formulaVersion`, inputs hash) |

### 7.3 Não-dependências (explícitas)

- Componentes React / Design System
- Focus NFe / providers fiscais
- Regras de CFOP/ICMS/ISS
- Zustand / carrinho PDV
- Dual-layer `app/gerente/*` (apenas legado operacional; FI nasce em admin/adapters limpos)

---

## 8. Pontos de extensão

| Extensão | Como plugar | Sem quebrar |
|----------|-------------|-------------|
| Novo KPI | Entrada no catálogo + `formulaVersion` + tests de definição | Capabilities consomem por `kpiId` |
| Nova capability | Pasta sob `capabilities/` + registro no compositor | Dashboard só lista capabilities registradas |
| Nova regra de recomendação | Arquivo em `recommendation/rules/` com id versionado | Engine itera registry |
| Novo detector de alerta | Arquivo em `alerts/detectors/` | Alert Engine registry |
| Novo país | Adapter fiscal/local + calendário/moeda; **core FI intacto** | Ver §12 |
| Novo canal (WhatsApp, e-mail) | Adapter de notificação outbound | Alert Engine emite `AlertEvent`; canal é borda |
| IA (Fase 5) | `AiExplanationPort` opcional — só narra evidências já calculadas | Proibido IA sem `Evidence[]` determinística |
| Benchmark interno | Capability que lê snapshots históricos FI | Não altera operacionais |

### 8.1 Versionamento

Todo artefato derivado carrega:

```
kpiId | ruleId | detectorId
formulaVersion | ruleVersion | detectorVersion
computedAt
inputFingerprint   # hash estável dos facts usados
confidence          # HIGH | MEDIUM | LOW | UNSUPPORTED
```

Isso permite auditoria (“por que o sistema disse X ontem?”) sem caixa-preta.

---

## 9. Recommendation Engine

Contrato canônico único: [ADR-011 — Recommendation Contract](../adr/ADR-011-decision-intelligence.md#recommendation-contract).

Campos mínimos: ID, Categoria, Problema Detectado, Evidências, Impacto Financeiro Estimado, Nível de Confiança, Urgência, Ação Recomendada, Justificativa, KPIs utilizados, Domínios consultados, Data, Status (+ `ruleId`/`ruleVersion`/`inputFingerprint`).

### 9.1 Pipeline obrigatório (explicável)

```
Problema
   ↓
Análise (capability / regra)
   ↓
Evidências (facts + KPIs + período)
   ↓
Impacto Financeiro (estimativa tipada + unidade)
   ↓
Recomendação (ação sugerida, não executada)
   ↓
Urgência / prioridade (score determinístico)
   ↓
Justificativa (codes → i18n na borda)
   ↓
Action Plan (ADR-011) → Checklist → Execução → Decision Memory
```

### 9.2 Modelo conceitual

Ver campos obrigatórios no ADR-011. Resumo:

```
Recommendation {
  id, category, problemCode
  evidences[], financialImpact, confidence, urgency
  suggestedAction { actionCode, targetRef, deepLinkHint }
  justification { causeCodes[], assumptionCodes[], limitations[] }
  kpisUsed[], domainsConsulted[]
  emittedAt, status
  ruleId + ruleVersion, inputFingerprint
}
```

### 9.3 Regras de honestidade

1. **Sem evidência → sem recomendação.**
2. Impacto com `confidence: LOW/UNSUPPORTED` deve aparecer como tal na UI futura.
3. Recomendação **nunca muta** domínio; no máximo sugere deep-link para tela oficial (entity-ssot).
4. Regras determinísticas primeiro (Fases 1–4). IA só **explica/prioriza narração** sobre evidências já existentes (Fase 5).
5. Toda regra tem teste de exemplo (dado → recomendação esperada) no core.

### 9.4 Exemplos de regras (catálogo inicial — desenho)

| ruleId | Problema | Evidências típicas | Ação sugerida |
|--------|----------|--------------------|---------------|
| `REC_SKU_SLOW_CAPITAL` | Capital imobilizado alto | giro baixo + saldo alto + custo | Revisar compra / promoção em `/admin/estoque` + catálogo |
| `REC_CUSTOMER_CHURN_RISK` | Cliente sumindo | recência ↑ + frequência ↓ | Contato; ver histórico em vendas/clientes |
| `REC_SUPPLIER_MARGIN_DRAG` | Fornecedor erode margem | custo ↑ + margem SKU ↓ | Renegociar; ver fornecedor oficial |
| `REC_AR_AGING_PRESSURE` | Caixa pressionado por AR | aging 30/60/90 | Cobrança via `/admin/financeiro` |
| `REC_DISCOUNT_MARGIN_HIT` | Descontos destruindo margem | desconto % vs lucro bruto | Revisar política de desconto gerente |

---

## 10. Alert Engine

Contrato canônico único: [ADR-011 — Alert Contract](../adr/ADR-011-decision-intelligence.md#alert-contract).

Alertas são **eventos de domínio derivado**, não toasts soltos na UI. Campos mínimos: origem, severidade, impacto, evidências, ação sugerida, integração com Auditoria.

### 10.1 Pipeline

```
Condição / detector
   ↓
Alert (contrato ADR-011)
   ↓
Análise (anexa evidências + KPI)
   ↓
Severidade / prioridade
   ↓
Painel (Executive Intelligence / inbox DI)
   ↓
Notificação (canal opcional — e-mail, push, etc.)
```

### 10.2 Modelo conceitual

```
Alert {
  id
  origem: detectorId + detectorVersion + sourceSlice
  severity, impact, evidences[]
  suggestedAction, scope, window
  relatedKpis[], recommendationIds[]
  dedupeKey, status, detectedAt
}
```

### 10.3 Exemplos de detectores

| detectorId | Gatilho conceitual | Severidade típica |
|------------|--------------------|-------------------|
| `ALT_CUSTOMER_INACTIVE` | Cliente sem compra além do limiar de recência | WARNING |
| `ALT_CASH_COVERAGE_LOW` | Cobertura de caixa < N dias no forecast | CRITICAL |
| `ALT_SKU_OVERSTOCK` | Dias de estoque > limiar + demanda baixa | WARNING |
| `ALT_AR_BUCKET_90` | Aging AR em bucket 90+ material | CRITICAL |
| `ALT_MARGIN_DROP` | Margem período < baseline interno | WARNING |

### 10.4 Integração com Auditoria

- Emisão/ack/snooze de alerta gera **trilha auditável** (quem viu, quando).
- FI **não substitui** `/admin/auditoria`; consome ledger operacional e, no futuro, registra eventos próprios de inteligência (`INTEL_ALERT_RAISED`, etc.) se houver store de alertas.
- Correlação: `AlertEvent` pode referenciar `venda_eventos` / liquidações por id, sem duplicar o fato.

---

## 11. Fontes de dados por capability

> Apenas nomes de tabelas/eventos/indicadores e frequência. **Sem SQL.**

### 11.1 Cash Forecast

| Dimensão | Conteúdo |
|----------|----------|
| **Tabelas** | `contas_receber`, `liquidacoes_receber`, `contas_pagar`, `vendas`, `vendas_pagamentos`, `caixas` (contexto), `movimentacoes_caixa` (contexto físico — não misturar com forecast contábil) |
| **Eventos** | liquidação AR; pagamento AP; `SALE_REGISTERED` (crédito/parcial); fechamento de caixa (contexto) |
| **Indicadores** | Fluxo projetado, Liquidez, Cobertura de caixa, Aging das contas |
| **Frequência** | On-read diário na Fase 1; near-realtime em mudanças AR/AP na Fase 3 |

### 11.2 Margin Analysis

| Dimensão | Conteúdo |
|----------|----------|
| **Tabelas** | `vendas`, `itens_venda`, `devolucoes`, `descontos_venda`, `produtos` (custo/preço cadastro), categorias de produto |
| **Eventos** | `SALE_REGISTERED`, `SALE_CANCELLED`, `SALE_PARTIAL_RETURN` |
| **Indicadores** | Receita, Receita líquida, Margem, Lucro bruto |
| **Frequência** | Diária / por período selecionado; recompute ao fechar dia |

### 11.3 Customer Health

| Dimensão | Conteúdo |
|----------|----------|
| **Tabelas** | `clientes`, `vendas`, `itens_venda`, `contas_receber` |
| **Eventos** | `SALE_REGISTERED`, `SALE_CANCELLED`; liquidação AR (saúde financeira do cliente) |
| **Indicadores** | Ticket médio, Frequência de compra, LTV, Churn de clientes |
| **Frequência** | Diária (batch leve); alerta near-realtime quando limiar de recência cruzado |

### 11.4 Supplier Analysis

| Dimensão | Conteúdo |
|----------|----------|
| **Tabelas** | `fornecedores`, `contas_pagar`, vínculo produto↔fornecedor, entradas NF-e / remessa (efeito custo e estoque), `produtos.preco_custo` |
| **Eventos** | pagamento/criação AP; importação NF-e / confirmação de entrada |
| **Indicadores** | Margem por fornecedor (derivada), tendência de custo, Aging AP |
| **Frequência** | Semanal na Fase 1–2; diária quando houver série de custo estável |

### 11.5 Inventory Capital

| Dimensão | Conteúdo |
|----------|----------|
| **Tabelas** | `estoque`, `movimentos_estoque_log`, `produtos`, `itens_venda` |
| **Eventos** | movimentos de estoque; baixas de venda; ajustes |
| **Indicadores** | Capital imobilizado, Giro de estoque |
| **Frequência** | Diária; alerta quando SKU cruza limiar de dias de estoque |

### 11.6 Profit Opportunities

| Dimensão | Conteúdo |
|----------|----------|
| **Tabelas** | Nenhuma direta — consome outputs tipados das capabilities |
| **Eventos** | Disparo após refresh das capabilities fonte |
| **Indicadores** | Compostos (impacto estimado em lucro / caixa) |
| **Frequência** | Após batch das fontes (diário) |

### 11.7 Executive Dashboard

| Dimensão | Conteúdo |
|----------|----------|
| **Tabelas** | Projeção FI futura (`intelligence_snapshots` — nome ilustrativo) + leitura das capabilities |
| **Eventos** | Refresh de snapshot; alertas abertos |
| **Indicadores** | Subconjunto executivo do catálogo (§12) |
| **Frequência** | On-read (Fase 1); snapshot horário/diário (Fase 3+) |

### 11.8 Recommendation Engine / Alert Engine

| Dimensão | Conteúdo |
|----------|----------|
| **Tabelas** | Facts via readers; store opcional `intelligence_alerts` / `intelligence_recommendations` (futuro) |
| **Eventos** | Saídas das capabilities + ledgers operacionais |
| **Indicadores** | Todos os do catálogo, conforme regra/detector |
| **Frequência** | Regras: no refresh; detectores: near-realtime ou diário conforme criticidade |

---

## 12. Catálogo de KPIs (SSoT analítico)

Convenções:

- **Módulo responsável** = dono do *fato bruto* (SSoT operacional).  
- **FI** = dono da *definição analítica versionada* e do valor derivado publicado.  
- Fórmulas são **conceituais** (sem SQL).

### 12.1 Receita

| Campo | Valor |
|-------|-------|
| **Definição** | Soma das vendas concluídas no período, antes de devoluções e deduções analíticas |
| **Fórmula conceitual** | `Σ valor_bruto_vendas(status ∈ concluídas, período)` |
| **Dependências** | `vendas`, `itens_venda` |
| **Módulo responsável (fato)** | **sales** |
| **Publicação analítica** | FI (`kpi.revenue`) |

### 12.2 Receita líquida

| Campo | Valor |
|-------|-------|
| **Definição** | Receita após descontos e devoluções/cancelamentos relevantes ao período |
| **Fórmula conceitual** | `Receita − Descontos − Devoluções (alocadas ao período)` |
| **Dependências** | Receita, `descontos_venda`, `devolucoes`, cancelamentos |
| **Módulo responsável (fato)** | **sales** |
| **Publicação analítica** | FI (`kpi.net_revenue`) |

### 12.3 Margem

| Campo | Valor |
|-------|-------|
| **Definição** | Percentual de lucro bruto sobre receita líquida |
| **Fórmula conceitual** | `Lucro bruto / Receita líquida` |
| **Dependências** | Lucro bruto, Receita líquida; custo disponível |
| **Módulo responsável (fato)** | **sales** + **products/inventory** (custo) |
| **Publicação analítica** | FI (`kpi.margin_pct`) |
| **Nota** | Se custo incompleto → `confidence: LOW` e não inventar custo |

### 12.4 Lucro bruto

| Campo | Valor |
|-------|-------|
| **Definição** | Receita líquida menos CMV/custo das mercadorias vendidas no período |
| **Fórmula conceitual** | `Receita líquida − CMV(período)` |
| **Dependências** | Receita líquida; custo por item vendido |
| **Módulo responsável (fato)** | **sales** (itens) + custo (**products** cadastro e/ou **inventory**/compras quando maturarem) |
| **Publicação analítica** | FI (`kpi.gross_profit`) |

### 12.5 Lucro líquido

| Campo | Valor |
|-------|-------|
| **Definição** | Lucro após despesas operacionais/financeiras reconhecidas no modelo analítico do tenant |
| **Fórmula conceitual** | `Lucro bruto − Despesas operacionais − Despesas financeiras (escopo analítico)` |
| **Dependências** | Lucro bruto; categorias financeiras / AP classificados; comissões |
| **Módulo responsável (fato)** | **financial** (despesas/AP) + **sales** |
| **Publicação analítica** | FI (`kpi.net_profit`) |
| **Nota** | Escopo de “despesa” deve ser configurável por tenant; não confundir com lucro contábil oficial |

### 12.6 Capital imobilizado

| Campo | Valor |
|-------|-------|
| **Definição** | Valor de estoque parado valorizado pelo custo adotado |
| **Fórmula conceitual** | `Σ (quantidade_atual × custo_unitário_adotado)` |
| **Dependências** | `estoque`, custo unitário |
| **Módulo responsável (fato)** | **inventory** (qty) + custo (**products**/compras) |
| **Publicação analítica** | FI (`kpi.immobilized_capital`) |

### 12.7 Giro de estoque

| Campo | Valor |
|-------|-------|
| **Definição** | Quantas vezes o estoque “roda” no período |
| **Fórmula conceitual** | `CMV(período) / Estoque médio valorizado` |
| **Dependências** | CMV, posições de estoque no período |
| **Módulo responsável (fato)** | **sales** + **inventory** |
| **Publicação analítica** | FI (`kpi.inventory_turnover`) |

### 12.8 Ticket médio

| Campo | Valor |
|-------|-------|
| **Definição** | Valor médio por venda concluída |
| **Fórmula conceitual** | `Receita líquida / Nº vendas concluídas` |
| **Dependências** | Receita líquida, contagem de vendas |
| **Módulo responsável (fato)** | **sales** |
| **Publicação analítica** | FI (`kpi.avg_ticket`) |

### 12.9 LTV

| Campo | Valor |
|-------|-------|
| **Definição** | Valor estimado do cliente ao longo do relacionamento observado |
| **Fórmula conceitual** | `Ticket médio × Frequência × Horizonte de vida observado` (versão v1 simples) |
| **Dependências** | Ticket médio, Frequência de compra, histórico do cliente |
| **Módulo responsável (fato)** | **sales** + **customers** |
| **Publicação analítica** | FI (`kpi.ltv`) |
| **Nota** | v1 = histórico observado; modelos preditivos só na Fase 5, com evidências |

### 12.10 Frequência de compra

| Campo | Valor |
|-------|-------|
| **Definição** | Nº médio de compras por cliente ativo no período |
| **Fórmula conceitual** | `Nº vendas de clientes ativos / Nº clientes ativos` |
| **Dependências** | `vendas`, `clientes` |
| **Módulo responsável (fato)** | **sales** |
| **Publicação analítica** | FI (`kpi.purchase_frequency`) |

### 12.11 Churn de clientes

| Campo | Valor |
|-------|-------|
| **Definição** | Proporção de clientes ativos que ultrapassaram limiar de inatividade |
| **Fórmula conceitual** | `Clientes inativos (recência > limiar) / Clientes ativos da base de referência` |
| **Dependências** | Última compra, limiar configurável por tenant/segmento |
| **Módulo responsável (fato)** | **sales** + **customers** |
| **Publicação analítica** | FI (`kpi.customer_churn`) |

### 12.12 Aging das contas

| Campo | Valor |
|-------|-------|
| **Definição** | Distribuição de AR/AP abertos por buckets de atraso (ex.: 0–30, 31–60, 61–90, 90+) |
| **Fórmula conceitual** | `Σ saldo_em_aberto agrupado por bucket(dias_em_atraso)` |
| **Dependências** | `contas_receber` / `contas_pagar`, vencimento, liquidações |
| **Módulo responsável (fato)** | **financial** |
| **Publicação analítica** | FI (`kpi.ar_aging` / `kpi.ap_aging`) |

### 12.13 Fluxo projetado

| Campo | Valor |
|-------|-------|
| **Definição** | Entradas e saídas esperadas de caixa no horizonte |
| **Fórmula conceitual** | `Saldo_inicial_analítico + Σ entradas_esperadas(t) − Σ saídas_esperadas(t)` |
| **Dependências** | Aging/vencimentos AR/AP, histórico de liquidação, vendas a prazo |
| **Módulo responsável (fato)** | **financial** (+ **sales** para crédito) |
| **Publicação analítica** | FI (`kpi.cash_flow_forecast`) |
| **Nota** | Distinto de \(E(c)\) do turno (**cash**) |

### 12.14 Liquidez

| Campo | Valor |
|-------|-------|
| **Definição** | Capacidade de honrar obrigações de curto prazo |
| **Fórmula conceitual** | `Ativos líquidos analíticos / Passivos de curto prazo` (definição v1 documentada por tenant) |
| **Dependências** | Caixa/bancos analíticos, AR curto prazo, AP curto prazo |
| **Módulo responsável (fato)** | **financial** + contexto **cash** |
| **Publicação analítica** | FI (`kpi.liquidity`) |

### 12.15 Cobertura de caixa

| Campo | Valor |
|-------|-------|
| **Definição** | Dias de operação cobertos pelo caixa projetado dado burn/saídas médias |
| **Fórmula conceitual** | `Caixa disponível projetado / Saída média diária` |
| **Dependências** | Fluxo projetado, saídas médias |
| **Módulo responsável (fato)** | **financial** |
| **Publicação analítica** | FI (`kpi.cash_coverage_days`) |

---

## 13. Integrações com domínios existentes

### 13.1 Financeiro (ADR-010)

| Aspecto | Contrato |
|---------|----------|
| **Papel do financeiro** | SSoT de AR/AP, liquidações, categorias, comissões |
| **Papel da FI** | Aging, fluxo projetado, liquidez, alertas de cobrança/pagamento |
| **Integração** | Somente `ArApFactsReader` / eventos de liquidação e pagamento |
| **UI** | Cobrança/pagamento continuam em `/admin/financeiro`; FI apenas sugere |
| **Proibido** | FI liquidar título; FI criar cliente (dívida D-F1 permanece NO-GO) |

### 13.2 Estoque (ADR-008)

| Aspecto | Contrato |
|---------|----------|
| **Papel do estoque** | SSoT de saldo e kardex |
| **Papel da FI** | Capital imobilizado, giro, SKUs lentos |
| **Integração** | `InventoryFactsReader` (saldo + movimentos agregáveis) |
| **UI** | Ações de ajuste/recebimento só em `/admin/estoque/*` |
| **Proibido** | FI ajustar estoque; tratar cache FI como saldo |

### 13.3 Vendas (ADR-005)

| Aspecto | Contrato |
|---------|----------|
| **Papel de sales** | SSoT de venda, itens, `vendas_pagamentos`, devoluções |
| **Papel da FI** | Receita, ticket, margem (com custo), saúde do cliente, oportunidades |
| **Integração** | `SalesFactsReader` + ledger `venda_eventos` (`SALE_REGISTERED`, `SALE_CANCELLED`, `SALE_PARTIAL_RETURN`) |
| **UI** | Venda em `/caixa`; cancelamento em `/admin/vendas` |
| **Proibido** | FI registrar/cancelar venda; usar UI PDV como fonte de KPI |

### 13.4 Compras / Fornecedores

| Aspecto | Contrato |
|---------|----------|
| **Papel** | Entradas (NF-e/remessa), custo de aquisição, AP ligado a fornecedor |
| **Papel da FI** | Supplier Analysis; tendência de custo; impacto em margem |
| **Integração** | Readers de fornecedor + fatos de entrada/custo + AP |
| **UI** | Cadastro em `/admin/fornecedores`; efeito estoque em `/admin/estoque/importar-nfe` etc. |
| **Proibido** | FI criar fornecedor; misturar regra fiscal da NF-e com KPI |

### 13.5 Auditoria

| Aspecto | Contrato |
|---------|----------|
| **Papel da auditoria operacional** | Timeline “quem fez o quê” (`/admin/auditoria`, `venda_eventos`, cancelamentos) |
| **Papel da FI** | Explicar “por que o sistema recomenda X” + trilha de ack de alertas |
| **Integração** | Correlação por ids de eventos; futuro ledger `INTEL_*` |
| **Proibido** | Sobrescrever timeline operacional; alertas sem evidência |

### 13.6 Cash (ADR-009) — fronteira especial

| Conceito | Dono | Uso na FI |
|----------|------|-----------|
| \(E(c)\) / turno | cash | Contexto operacional; **não** é fluxo de caixa empresarial |
| `saldo_atual` | cash | Contador físico; **não** KPI contábil |
| Fluxo projetado 30d | FI ← financial/sales | KPI empresarial |

Documentar na UI futura a distinção para não confundir o lojista.

---

## 14. Escalabilidade internacional

Separação obrigatória de camadas:

```
┌──────────────────────────────────────────────┐
│  Intelligence (FI)                           │  ← independente de legislação
│  KPIs · recomendações · alertas · forecast    │
└──────────────────────┬───────────────────────┘
                       │ facts neutros (money, qty, dates UTC)
┌──────────────────────▼───────────────────────┐
│  Financial rules (AR/AP, aging, liquidez)    │  ← políticas comerciais/financeiras
└──────────────────────┬───────────────────────┘
                       │
┌──────────────────────▼───────────────────────┐
│  Fiscal rules (NF-e, impostos, provider)     │  ← por país / UF
└──────────────────────────────────────────────┘
```

| Camada | Varia por país? | Exemplo |
|--------|-----------------|---------|
| **Intelligence** | Não (só locale/moeda na apresentação) | “cobertura de caixa < 15 dias” |
| **Indicadores** | Parâmetros (limiares), não fórmula legal | limiar de churn |
| **Regras financeiras** | Parcial (meios de pagamento, prazos) | boleto vs cartão |
| **Regras fiscais** | Sim | ICMS BR vs GST etc. |

### Normas

1. Facts no core usam **decimal monetário + currency code + timestamps UTC**.
2. Códigos de problema/alerta/recomendação são **estáveis**; texto na borda i18n (`pt`/`zh`/…).
3. Calendários fiscais e feriados **não** entram no core FI; entram como `CalendarPort` na borda se necessário para forecast.
4. Documento fiscal pode enriquecer custo/entrada, mas FI consome **resultado econômico**, não regra tributária.

Alinha-se a ADR-005 §6 (i18n no mesmo `shared-core`) e ao template de domínio internacionalizado.

---

## 15. Arquitetura hexagonal — checklist de conformidade

| Princípio | Como FI cumpre |
|-----------|----------------|
| Hexagonal | Core puro + ports inbound/outbound + adapters na app |
| SSoT | Donos operacionais intactos; FI só publica derivado versionado |
| Baixo acoplamento | Capabilities isoladas; composição explícita |
| Alta coesão | Um motivo de mudança por capability |
| Modularidade | Registry de KPIs/regras/detectores |
| Evolução incremental | Roadmap ADR-011 (Fases 0–7); on-read → Action Plan → Memory → IA |
| UI sem regra | React só renderiza DTO |
| Sem cálculo na tela | Catálogo + engines no `shared-core` |

### GO / NO-GO de desenho

| Decisão | Resultado |
|---------|-----------|
| Aceitar FI como fatia de Decision Intelligence (ADR-011) | **GO** |
| Scaffold `shared-core/src/intelligence` | **GO** apenas em missão futura (após ADR-011) |
| FI escrever AR/AP/estoque/vendas | **NO-GO** |
| KPI calculado em componente React | **NO-GO** |
| Misturar regra fiscal no Recommendation Engine | **NO-GO** |
| IA sem evidências determinísticas | **NO-GO** |
| Segundo pacote npm paralelo ao shared-core | **NO-GO** (ADR-005) |
| Nova tela de CRUD de entidade “por causa da FI” | **NO-GO** (entity-ssot) |

---

## 16. Roadmap

Roadmap canônico da camada: [ADR-011 § Roadmap](../adr/ADR-011-decision-intelligence.md#roadmap-camada-di). Abaixo, o recorte relevante à fatia FI.

| Fase DI | Nome | Foco FI |
|---------|------|---------|
| **0** | Fundação DI | ADR-011 + este doc |
| **1** | Indicadores básicos | KPIs FI on-read (Receita, Aging, Margem v0, Capital v0) |
| **2** | Recomendações e alertas | Regras/detectores financeiros sob contratos únicos |
| **3** | Action Plan | “O que fazer hoje?” com deep-links `/admin/financeiro` etc. |
| **4** | Previsões | Cash Forecast 30/60/90; cobertura de caixa |
| **5** | Benchmark interno | Desvio de margem/liquidez vs baseline |
| **6** | Decision Memory | Outcomes 30/60/90 das ações financeiras aceitas |
| **7** | IA opcional | Explicação sobre Evidence[] + Memory — complementar |

### Fase 1 — Indicadores básicos

| Entrega conceitual | Notas |
|--------------------|-------|
| Scaffold umbrella DI + fatia `financial/` | types, contracts, kpi catalog (missão futura) |
| KPIs: Receita, Receita líquida, Ticket médio, Aging AR/AP | Sem forecast avançado |
| Margin Analysis v0 | Degrada se custo ausente |
| Inventory Capital v0 | Via Inventory Intelligence / custo com `confidence` |

### Fase 2 — Motor de recomendações

| Entrega conceitual | Notas |
|--------------------|-------|
| Recommendation + Alert Engines (contratos ADR-011) | Evidence obrigatória |
| Regras FI iniciais | AR aging, margem, cobertura |
| Trilha de ack | Integração conceitual com Auditoria |

### Fases 3–6 — Action Plan, previsões, benchmark, Decision Memory

Conforme ADR-011: Action Plan responde “o que fazer hoje?”; Decision Memory registra recomendação → decisão → execução → resultado 30/60/90d para aprendizado auditável **antes** da IA.

### Fase 7 — IA opcional

| Entrega conceitual | Notas |
|--------------------|-------|
| `AiExplanationPort` | Prosa a partir de Evidence[] + Decision Memory |
| Opt-in por tenant | Desligável; nunca SSoT de KPI |

---

## 17. Riscos e mitigações

| Risco | Mitigação |
|-------|-----------|
| FI virar “segundo financeiro” | ADR-011 boundaries + guard de import em CI futuro |
| FI virar silo separado de Sales/Inventory Intelligence | Umbrella DI; contratos únicos |
| Custo/margem errados sem valuation | `confidence` + limitations explícitas |
| Confundir caixa físico com forecast | Seção 13.6 + KPIs separados |
| Dívida dual-layer gerente | FI nasce só em adapters limpos (admin), não expande `gerente/` |
| Explosão de escopo (CRM/IA cedo) | Roadmap faseado; IA só na Fase 7 |
| Acoplamento fiscal BR | Camada fiscal isolada (§14) + ADR-011 i18n |

---

## 18. Próximos passos

Ordem sugerida — **cada item = missão/PR isolada**:

1. ~~**ADR-011**~~ — **feito** ([ADR-011](../adr/ADR-011-decision-intelligence.md)).
2. ~~**Inventário Column → Fact**~~ — **feito** ([DECISION_FACT_CATALOG.md](./DECISION_FACT_CATALOG.md)).
3. ~~**Cycle 0 foundation**~~ — **feito** ([DECISION_INTELLIGENCE_CYCLE_0.md](./DECISION_INTELLIGENCE_CYCLE_0.md)).
4. ~~**Foundation Hardening**~~ — **feito** ([FOUNDATION_HARDENING.md](./FOUNDATION_HARDENING.md); types regenerados; Quality Level tipado).
5. ~~**Cycle 1 Engine Loop v1**~~ — **feito** (`runEngineLoop` + Fact Aggregator + Decision Snapshot).
6. ~~**Cycle 2 KPI Derivation**~~ — **feito** (`deriveKpis` · weakest-link).
7. ~~**Cycle 3 Analysis Engine**~~ — **feito** (`runAnalysisEngine` · Findings · sem Recommendations).
8. Cycles 4–8: Recommendation → Alert → Action Plan → Memory → Executive → **depois** `/admin` DI agregador (não CRUD).

---

## 19. Resultado esperado

Com este desenho (FI sob Decision Intelligence), o Jinlong pode evoluir de ERP operacional para ERP **orientado à decisão**, sem:

- contaminar Financeiro/Estoque/Vendas com regras de BI;
- colocar cálculo em React;
- acoplar inteligência à legislação fiscal;
- forçar big-bang de telas ou migrations;
- precisar refatorar a estrutura ao acrescentar Sales/Inventory Intelligence, Action Plan ou Decision Memory.

A implementação será gradual (Fases 0→7 do ADR-011), verificável e explicável — preservando a arquitetura hexagonal e os SSoTs dos ADRs 005–011.
`)