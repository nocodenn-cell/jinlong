# Missão — Decision Intelligence Admin Surface (Fase 4 / P0)

| Campo | Valor |
|--------|--------|
| **Status** | **Concluído** |
| **Checkpoint anterior** | tag `di-read-model-phase-3` |
| **Rota** | `/admin/intelligence` (`ROUTES.admin.intelligence`) |
| **Código UI** | `pdv-importados/app/admin/intelligence/` |
| **Serviço** | `pdv-importados/lib/admin/intelligence/loadIntelligenceReadModel.ts` |
| **Core** | tag `di-core-v1.0` — **intocado** |

---

## Princípio

**UI nunca calcula. Consome apenas o Read Model.**

```
DecisionReadModelPort.getForLoja(lojaId)
        ↓
DecisionIntelligenceReadModel (projeções)
        ↓
/admin/intelligence (painéis 1:1)
        ↓
deepLinkHint → rotas entity-SSoT (/admin/catalogo, estoque, vendas, …)
```

| Faz | Não faz |
|-----|---------|
| Renderizar projeções tipadas | Acessar `DecisionSnapshot` / `DecisionRecord` direto |
| Validar prefixo de deep link SSoT | Recalcular KPI / Finding / Recommendation / Alert / Plan |
| Deep link para módulos oficiais | CRUD paralelo de produto/cliente/fornecedor/estoque |

## Painéis

| Projeção | Componente |
|----------|------------|
| ExecutiveDashboard | `ExecutiveDashboardPanel` |
| RecommendationQueue | `RecommendationQueuePanel` |
| CriticalAlerts | `CriticalAlertsPanel` |
| DailyActionPlan | `DailyActionPlanPanel` |
| DecisionHistory | `DecisionHistoryPanel` |
| DecisionPerformance | `DecisionPerformancePanel` |
| PendingReviews | `PendingReviewsPanel` |

## Guarda de arquitetura

```bash
npm run check:di-admin -w pdv-importados
```

Script: `pdv-importados/scripts/check-decision-intelligence-admin.mjs`  
Garante que a UI chama `loadIntelligenceReadModel` e não importa repos/codec/Engine.

## Desafio operacional (próxima fase)

Hoje o Engine Loop ainda é sob demanda (homologação). Para operação contínua, a **Fase 5 — Scheduler** deve:

1. Executar o Engine Loop periodicamente (cron/job/fila)
2. Persistir novos snapshots
3. Atualizar a base que o Read Model projeta
4. Registrar falhas e métricas

Sem scheduler, o cockpit depende de execuções manuais.

## Ordem

1. ✅ Core · Persistência · DecisionRecord · Read Model  
2. ✅ Este Admin Surface  
3. Scheduler / orquestrador (fora do Core)  
4. Observabilidade · Feedback loop  
