# ADR-011 — Decision Intelligence: camada de inteligência acima dos domínios operacionais

| Campo | Valor |
|--------|--------|
| **ID** | ADR-011 |
| **Título** | Decision Intelligence — fronteira, contratos e evolução para decisões acionáveis |
| **Status** | Aceito — decisões de arquitetura (**sem implementação nesta data**) |
| **Data** | 2026-07-19 |
| **Missão** | ADR-011 antes do scaffold `shared-core/src/intelligence` |
| **Relacionados** | [ADR-005](./ADR-005-fronteiras-dominio-shared-core.md) · [ADR-006](./ADR-006-frontend-domain-boundaries.md) · [ADR-007](./ADR-007-products-domain-boundary.md) · [ADR-008](./ADR-008-inventory-domain-boundary.md) · [ADR-009](./ADR-009-cash-domain-boundary.md) · [ADR-010](./ADR-010-financial-domain-boundary.md) · [FINANCIAL_INTELLIGENCE.md](../architecture/FINANCIAL_INTELLIGENCE.md) · entity-ssot · template domínio internacionalizado |
| **Proibido nesta missão** | Código · telas · SQL · migrations · APIs · alteração de domínios operacionais |

---

## Contexto

O Jinlong já possui SSoTs operacionais (sales, financial, inventory, cash, products, customers, suppliers) e um desenho de [Financial Intelligence](../architecture/FINANCIAL_INTELLIGENCE.md).

O objetivo do produto **não** é apenas exibir indicadores. É ajudar o empresário a **tomar decisões melhores** — com evidências, impacto estimado, plano do dia e memória do que funcionou.

Sem um ADR de fronteira **antes** do scaffold:

- Financial Intelligence pode ser tratado como “o” módulo de BI e bloquear Sales/Inventory/Customer Intelligence;
- recomendações e alertas podem divergir de contrato entre fatias;
- Action Plan e Decision Memory surgem como ad-hoc na UI;
- risco de acoplar fatias entre si ou escrever de volta nos donos operacionais.

Este ADR **congela** a camada Decision Intelligence (DI). Não cria pastas, não move código, não altera banco.

---

## Decisão

### 1. Nome e posição na arquitetura

**Decision Intelligence (DI)** é a camada **derivada, read-mostly**, acima dos domínios operacionais.

Fica no único núcleo permitido (ADR-005):

```
@fastproduct/shared-core/src/intelligence/
```

`intelligence/` é o **umbrella** DI — não um segundo pacote npm e não um god-module operacional.

**Financial Intelligence** (doc existente) é a **primeira fatia vertical** sob DI, não um sistema paralelo.

```
Decision Intelligence                    ← camada / umbrella
├── Financial Intelligence               ← fatia (AR/AP, liquidez, margem $)
├── Sales Intelligence                   ← fatia (receita, ticket, mix, descontos)
├── Inventory Intelligence               ← fatia (capital, giro, ruptura/excesso)
├── Customer Intelligence                ← fatia (saúde, churn, LTV, frequência)
├── Supplier Intelligence                ← fatia (custo, margem por fornecedor)
└── Executive Intelligence               ← compositor (visão do dia / C-level)
```

Motores transversais (não são fatias de domínio):

```
intelligence/
├── recommendation/     # contrato único + engine
├── alerts/             # contrato único + engine
├── actionPlan/         # Recommendation → plano do dia
├── decisionMemory/     # histórico recomendação → resultado
└── kpi/                # catálogo analítico versionado (SSoT de definição de KPI)
```

---

### 2. Responsabilidades por fatia

| Fatia | Responsabilidade única | Não faz |
|-------|------------------------|---------|
| **Financial Intelligence** | Liquidez, aging, fluxo projetado, cobertura de caixa, erosão financeira | Liquidar AR/AP; dono de caixa físico |
| **Sales Intelligence** | Receita, ticket, mix, descontos, cancel/devolução como sinal | Registrar/cancelar venda |
| **Inventory Intelligence** | Capital imobilizado, giro, SKUs lentos/excesso | Ajustar saldo; valuation contábil oficial |
| **Customer Intelligence** | Saúde do cliente, recência/frequência, churn, LTV analítico | CRUD de cliente; CRM de campanha |
| **Supplier Intelligence** | Impacto do fornecedor em custo/margem | CRUD fornecedor; pagar AP |
| **Executive Intelligence** | Compor “o que fazer hoje”, snapshot executivo, priorização cross-fatia | Recalcular KPI fora do catálogo; ser SSoT operacional |

| Motor transversal | Responsabilidade |
|-------------------|------------------|
| **Recommendation Engine** | Emitir `Recommendation` explicável a partir de facts/KPIs |
| **Alert Engine** | Emitir `Alert` tipado; correlacionar com Auditoria |
| **Action Plan** | Transformar recomendações aceitas em checklist executável (sem mutar domínio) |
| **Decision Memory** | Registrar ciclo recomendação → decisão → execução → resultado 30/60/90d |
| **KPI Catalog** | Definições e `formulaVersion` — publicação analítica, não fato bruto |

---

### 3. Boundaries

#### 3.1 Owns (DI)

| Owns | Descrição |
|------|-----------|
| Definições analíticas versionadas | KPIs, regras, detectores, `formulaVersion` / `ruleVersion` |
| Contratos de saída | Recommendation, Alert, ActionPlan, DecisionRecord, Insight |
| Engines e fatias de inteligência | Cálculo e composição **no core** |
| Stores derivados futuros | Snapshots, alert inbox, memory — sempre reconstruíveis / não autoridade operacional |
| Codes estáveis | `INTEL_*`, `REC_*`, `ALT_*`, `ACT_*` (texto na borda i18n) |

#### 3.2 Não owns (permanece nos donos)

| Não owns | Dono |
|----------|------|
| `vendas`, `itens_venda`, `vendas_pagamentos`, `devolucoes` | **sales** |
| `contas_receber`, `contas_pagar`, liquidações | **financial** (ADR-010) |
| `estoque`, `movimentos_estoque_log` | **inventory** (ADR-008) |
| `caixas`, \(E(c)\), `movimentacoes_caixa` | **cash** (ADR-009) |
| `produtos`, preço de cadastro | **products** |
| `clientes` | **customers** |
| `fornecedores` | **suppliers** |
| Documentos / regras fiscais | **fiscal** |
| Timeline operacional | **auditoria** (`/admin/auditoria`) |
| UI CRUD entity-ssot | rotas oficiais |

#### 3.3 Regras de fronteira (normativas)

1. **Read-only operacional:** DI **nunca escreve** tabelas dos donos.  
2. **Dependência só via ports de leitura** (e eventos tipados já emitidos pelos donos).  
3. **Proibido** fatia A importar implementação interna da fatia B — só contratos públicos DI / KPI ids.  
4. **Proibido** domínio operacional (`sales`, `financial`, …) importar `intelligence` (evita ciclo).  
5. **Nenhum KPI / regra / priorização em React** — UI só renderiza DTOs.  
6. **Nenhuma lógica de negócio na UI** — inclusive Action Plan e ack de alerta passam por adapter → core.  
7. **Deep-links** apontam para rotas entity-ssot; DI **não** executa a mutação operacional.  
8. **Fiscal** é contexto opcional; nunca define fórmula de KPI nem regra de recomendação.  
9. **Um único núcleo:** proibido segundo pacote/`modules/shared` (ADR-005).  
10. Cadeia frontend: `UI → adapter → shared-core/intelligence → (ports) → readers dos donos` (ADR-006).

#### 3.4 Limite inteligência × domínio

```
Domínio operacional          Decision Intelligence
─────────────────            ─────────────────────
Escreve fatos                Lê facts via ports
Autoridade de tabela         Autoridade de definição analítica
Executa venda/liquidação/…   Sugere ação + registra decisão/memory
Emite eventos de negócio     Emite Alert/Recommendation derivados
UI SSoT de entidade          UI agregadora (futura) — não CRUD
```

**Teste litmus:** se a feature altera saldo, título, venda ou cadastro → **não é DI**; é o domínio dono.

---

### 4. Dependências

#### 4.1 Direção permitida

```
UI (agregador DI futuro)
  → adapters DI
    → intelligence (core)
         │ outbound ports (somente leitura)
         ▼
    Readers/ports dos donos (sales, financial, inventory, cash, …)
         │
         ▼
    Postgres / ledgers operacionais (SSoT)
```

#### 4.2 Mapa fatia → domínios consultados (leitura)

| Fatia DI | Ports / domínios (leitura) |
|----------|----------------------------|
| Financial Intelligence | financial, sales (crédito), cash (contexto ≠ contábil) |
| Sales Intelligence | sales, products |
| Inventory Intelligence | inventory, products, sales (giro) |
| Customer Intelligence | customers, sales, financial (AR do cliente) |
| Supplier Intelligence | suppliers, financial (AP), purchases/NF-e custo, products |
| Executive Intelligence | **somente** contratos públicos das fatias + engines (não bypass para SQL) |

#### 4.3 Integração entre capabilities

| De | Para | Mecanismo |
|----|------|-----------|
| Qualquer fatia | KPI Catalog | publica/consome `kpiId` + `formulaVersion` |
| Fatias | Recommendation Engine | facts + KPIs → `Recommendation` |
| Fatias | Alert Engine | detectores → `Alert` |
| Recommendation Engine | Action Plan | recomendações elegíveis → plano do dia |
| Action Plan | Decision Memory | aceite/execução → `DecisionRecord` |
| Alert Engine | Auditoria | correlação + eventos `INTEL_*` (futuro store) |
| Executive Intelligence | todas | composição read-model; sem recalcular fórmula |

**Proibido:** Sales Intelligence chamar SQL de `contas_receber` direto — deve usar port financial ou KPI já publicado.

---

### 5. Árvore canônica alvo (scaffold futuro — não criar agora)

```
@fastproduct/shared-core/src/intelligence/
├── types.ts
├── contracts.ts                 # ports inbound/outbound DI
├── errorCodes.ts
├── kpi/
├── financial/                   # Financial Intelligence
├── sales/                       # Sales Intelligence
├── inventory/                   # Inventory Intelligence
├── customer/                    # Customer Intelligence
├── supplier/                    # Supplier Intelligence
├── executive/                   # Executive Intelligence
├── recommendation/
├── alerts/
├── actionPlan/
├── decisionMemory/
├── policies/
└── index.ts
```

Adapters futuros na app (admin), **não** em `app/gerente/*` novo.

---

## Recommendation Contract

Contrato **único** para todas as fatias. Toda recomendação é explicável; **caixa-preta é NO-GO**.

### Campos mínimos obrigatórios

| Campo | Descrição |
|-------|-----------|
| **ID** | Identificador estável da emissão (`recommendationId`) |
| **Categoria** | Taxonomia (`MARGIN`, `CASH`, `CUSTOMER`, `INVENTORY`, `SUPPLIER`, `EXECUTIVE`, …) |
| **Problema Detectado** | `problemCode` estável + parâmetros tipados |
| **Evidências** | Lista `Evidence[]` (fato, KPI, período, referência de entidade/evento) |
| **Impacto Financeiro Estimado** | métrica, valor, moeda, horizonte, unidade |
| **Nível de Confiança** | `HIGH` \| `MEDIUM` \| `LOW` \| `UNSUPPORTED` |
| **Urgência** | `P0` \| `P1` \| `P2` \| `P3` (ou score 0–100 + tier) |
| **Ação Recomendada** | `actionCode` + alvo (`entityRef`) + `deepLinkHint` (rota entity-ssot) |
| **Justificativa** | `causeCodes[]` + `assumptionCodes[]` + `limitations[]` |
| **KPIs utilizados** | lista de `kpiId` + `formulaVersion` |
| **Domínios consultados** | lista explícita (`sales`, `financial`, …) — só leitura |
| **Data** | `emittedAt` (UTC) |
| **Status** | `OPEN` \| `ACCEPTED` \| `DISMISSED` \| `SNOOZED` \| `EXPIRED` \| `COMPLETED` |

### Campos de rastreio (obrigatórios no contrato)

| Campo | Descrição |
|-------|-----------|
| `ruleId` + `ruleVersion` | Regra determinística que gerou a recomendação |
| `inputFingerprint` | Hash estável dos facts usados |
| `relatedAlertIds` | Opcional — alertas que originaram a recomendação |

### Regras de honestidade

1. Sem `Evidence[]` não vazia → **não emitir** recomendação.  
2. Impacto com confiança baixa deve permanecer visível (não “arredondar” para certeza).  
3. Recomendação **não muta** domínio operacional.  
4. IA (fase futura) só narra/prioriza sobre evidências já presentes — nunca inventa fato.  
5. Toda regra tem caso de teste conceitual (dado → recomendação esperada) antes de produção.

### Pipeline

```
Problema → Análise → Evidências → Impacto → Recomendação → Urgência → Justificativa
```

---

## Alert Contract

Contrato **único** de alerta derivado.

### Campos mínimos

| Campo | Descrição |
|-------|-----------|
| **ID** | `alertId` |
| **Origem** | `detectorId` + `detectorVersion` + fatia (`sourceSlice`) |
| **Severidade** | `INFO` \| `WARNING` \| `CRITICAL` |
| **Impacto** | descrição tipada (métrica afetada, magnitude estimada, horizonte) |
| **Evidências** | `Evidence[]` (mesmo shape da recomendação) |
| **Ação sugerida** | `actionCode` + `deepLinkHint` (opcional link a `recommendationId`) |
| **Escopo** | `loja_id` (+ `entityRef` opcional) |
| **Janela** | período analisado |
| **KPIs relacionados** | `kpiId[]` |
| **Status** | `OPEN` \| `ACKNOWLEDGED` \| `RESOLVED` \| `SNOOZED` |
| **dedupeKey** | evita spam do mesmo sinal |
| **detectedAt** | UTC |

### Integração com Auditoria

| Princípio | Norma |
|-----------|--------|
| Separação | `/admin/auditoria` continua SSoT da timeline **operacional** |
| Correlação | Alert referencia ids de `venda_eventos` / liquidações / movs — **não duplica** o fato |
| Trilha DI | raise / ack / snooze / resolve geram eventos auditáveis `INTEL_ALERT_*` (store futuro DI) |
| Responsabilidade | Auditoria operacional ≠ inbox de alertas DI; UI pode compor, cores não misturam autoridade |

### Pipeline

```
Detector → Alert → Análise/evidências → Severidade → Painel DI → Notificação (borda)
                 ↘ opcional → Recommendation
```

---

## Action Plan

Capability que responde: **“O que devo fazer hoje?”**

### Fluxo

```
Recommendation
      ↓
Action Plan          ← agrupa, prioriza, agenda o dia
      ↓
Checklist            ← itens acionáveis (não executam domínio sozinhos)
      ↓
Execução             ← humano (ou orquestração futura) na tela entity-ssot do dono
      ↓
Resultado            ← registrado → alimenta Decision Memory
```

### Responsabilidades

| Faz | Não faz |
|-----|---------|
| Selecionar recomendações abertas elegíveis para o dia | Recalcular KPI fora do catálogo |
| Ordenar por urgência × impacto × confiança | Liquidar, vender, ajustar estoque |
| Gerar checklist com dono sugerido (papel) e deep-link | Substituir permissões/RLS dos domínios |
| Marcar item como feito/ignorado/adiado (estado DI) | Escrever nas tabelas operacionais |

### Modelo conceitual

```
ActionPlan {
  id, lojaId, planDate
  items: ActionPlanItem[]
}

ActionPlanItem {
  id
  recommendationId          # origem obrigatória
  titleCode / actionCode
  checklistLabelCode
  urgency, confidence
  estimatedImpact
  deepLinkHint              # rota oficial do dono
  status                    # TODO | DONE | SKIPPED | DEFERRED
  completedAt?, actorId?
}
```

Executive Intelligence consome o Action Plan do dia como read-model principal do “hoje”.

---

## Decision Memory

Mecanismo de **aprendizado com o histórico da própria empresa**, com rastreabilidade total — ainda **determinístico** (antes de IA).

### O que registra

| Momento | Registro |
|---------|----------|
| Emissão | snapshot da `Recommendation` (ruleVersion, evidences, KPIs, fingerprint) |
| Decisão | aceite / dismiss / snooze + motivo (`decisionCode`) + ator + timestamp |
| Execução | itens do Action Plan concluídos / pulados; deep-link usado; notas |
| Resultado | medição dos KPIs-alvo em **+30 / +60 / +90 dias** vs baseline na emissão |

### Modelo conceitual

```
DecisionRecord {
  id
  recommendationId
  actionPlanItemIds[]
  decision            # ACCEPTED | DISMISSED | SNOOZED
  decisionAt, actorId
  reasonCodes[]
  execution           # status + completedAt
  baselines           # KPI values at emission
  outcomes: {
    d30: OutcomeSnapshot | PENDING
    d60: OutcomeSnapshot | PENDING
    d90: OutcomeSnapshot | PENDING
  }
  effectiveness       # IMPROVED | NEUTRAL | WORSE | INCONCLUSIVE (quando houver dados)
}
```

### Normas

1. Memory é store **DI** — não altera vendas/estoque/financeiro.  
2. Outcomes recalculam pelos **mesmos kpiId/formulaVersion** da emissão (ou registram que a fórmula mudou).  
3. Serve a: priorização futura, benchmark interno, e (só depois) IA explicativa.  
4. Sem Decision Memory, o sistema não “aprende”; com Memory, o aprendizado é **auditável**.

---

## Internacionalização

DI permanece **independente** de regras fiscais, legislação e país.

| Camada | Varia por país? | Papel |
|--------|-----------------|-------|
| Decision Intelligence | Não | KPIs, alertas, recomendações, action plan, memory |
| Regras financeiras comerciais | Parâmetros (prazos, meios) | Ports dos donos |
| Regras fiscais | Sim | **fiscal** apenas — adapters locais |
| Apresentação | Sim (locale/moeda) | borda i18n / formatting |

### Normas

1. Facts: money decimal + `currency` + timestamps UTC.  
2. Core emite **codes**; borda traduz (`pt` / `zh` / …).  
3. Calendário fiscal / feriados: `CalendarPort` na borda — não no núcleo de regra.  
4. NF-e / impostos enriquecem custo só como **fato econômico** já resolvido pelo dono — DI não interpreta CFOP/CST.

---

## Roadmap (camada DI)

Substitui/estende o roadmap só-FI. IA permanece **opcional e complementar**.

| Fase | Nome | Entrega arquitetural |
|------|------|----------------------|
| **0** | Fundação DI | Este ADR; contratos Recommendation/Alert; mapa de fatias |
| **1** | Indicadores básicos | KPI Catalog + fatias Financial/Sales/Inventory on-read |
| **2** | Recomendações e alertas | Engines + contratos únicos; primeiras regras/detectores |
| **3** | Action Plan | “O que fazer hoje?” + checklist + deep-links entity-ssot |
| **4** | Previsões | Cash forecast / tendências determinísticas |
| **5** | Benchmark interno | Baselines loja/período; desvios |
| **6** | Decision Memory | Ciclo completo + outcomes 30/60/90; efetividade |
| **7** | IA opcional | `AiExplanationPort` sobre Evidence[] + Memory — nunca SSoT |

**Ordem de scaffold (missões futuras, uma por vez):** ADR aceito → facts inventory (doc) → scaffold umbrella + KPI stubs → uma fatia read-only → engines → Action Plan → Memory → UI agregadora.

---

## Consequências

### Positivas

- Um lugar só para inteligência; Financial Intelligence não vira silo.  
- Contratos únicos evitam N formatos de recomendação/alerta.  
- Action Plan e Decision Memory preparam evolução KPI → decisão → aprendizado sem refatorar donos.  
- Preserva hexagonal, SSoT, entity-ssot e ADR-005 (um único shared-core).  
- Internacionalização limpa: fiscal fora do core DI.

### Trade-offs

- Mais pasta/conceitos antes do primeiro KPI na tela — custo aceito para não refatorar depois.  
- Executive Intelligence exige disciplina: só compõe contratos públicos.  
- Decision Memory implica store derivado futuro (missão própria) — fora do scaffold inicial.  
- Custo/margem podem ter `confidence` baixo até valuation madura — transparência obrigatória.

---

## Critérios de aceite (aprovação deste ADR)

| Critério | Atendido? |
|----------|-----------|
| Preserva arquitetura atual (ADR-005…010, entity-ssot) | **Sim** |
| Não cria acoplamento entre domínios operacionais | **Sim** — só ports de leitura; donos não importam DI |
| Mantém Single Source of Truth | **Sim** — DI é derivado; não escreve tabelas operacionais |
| Camada reutilizável por qualquer módulo (fatias) | **Sim** — umbrella + contratos únicos |
| Prepara evolução KPI → recomendações acionáveis | **Sim** — Recommendation + Action Plan + Memory |
| Evita refatoração estrutural futura óbvia | **Sim** — fatias e motores transversais já nomeados |
| Read-only / sem KPI em React / sem regra na UI | **Sim** — normas §3.3 |
| Independência fiscal / país | **Sim** — § Internacionalização |
| Sem implementação nesta missão | **Sim** |

---

## GO / NO-GO

| Decisão | Resultado |
|---------|-----------|
| Aceitar ADR-011 — Decision Intelligence como umbrella | **GO** |
| Financial Intelligence como fatia sob DI (não sistema paralelo) | **GO** |
| Contratos únicos Recommendation + Alert | **GO** |
| Action Plan + Decision Memory no desenho (implementação faseada) | **GO** |
| Scaffold `shared-core/src/intelligence` **nesta** missão | **NO-GO** (missão futura) |
| DI escrever tabelas operacionais | **NO-GO** |
| KPI / recomendação / priorização em React | **NO-GO** |
| Domínio operacional importar `intelligence` | **NO-GO** |
| Segundo pacote de inteligência fora do shared-core | **NO-GO** |
| IA como fonte de verdade de KPI ou sem Evidence | **NO-GO** |
| Nova tela CRUD de entidade “para inteligência” | **NO-GO** (entity-ssot) |
| Misturar regra fiscal no core DI | **NO-GO** |

---

## Referência cruzada

- Detalhamento de capabilities financeiras, catálogo de KPIs e fontes: [FINANCIAL_INTELLIGENCE.md](../architecture/FINANCIAL_INTELLIGENCE.md) (atualizado para subordinar-se a este ADR).  
- Inventário semântico Column → Fact: [DECISION_FACT_CATALOG.md](../architecture/DECISION_FACT_CATALOG.md) (**feito**).  
- Cycle 0 foundation: [DECISION_INTELLIGENCE_CYCLE_0.md](../architecture/DECISION_INTELLIGENCE_CYCLE_0.md) + `shared-core/src/intelligence/`.  
- Foundation Hardening: [FOUNDATION_HARDENING.md](../architecture/FOUNDATION_HARDENING.md) — types regenerados; `GATE_DATABASE_TYPES_STALE` SATISFIED; Quality Level tipado.  
- Cycles 1–3: [C1](../architecture/DECISION_INTELLIGENCE_CYCLE_1.md) · [C2](../architecture/DECISION_INTELLIGENCE_CYCLE_2.md) · [C3 Analysis](../architecture/DECISION_INTELLIGENCE_CYCLE_3.md) — Findings ≠ Recommendations; `/admin` DI só depois do Cycle 4.
`)