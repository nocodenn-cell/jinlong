# Missão — Decision Intelligence Orchestrator (Fase 5 / P0)

| Campo | Valor |
|--------|--------|
| **Status** | **Concluído** |
| **Checkpoint anterior** | tag `di-admin-phase-4` |
| **Código** | `pdv-importados/lib/decision-intelligence/orchestrator/` |
| **Trigger** | `GET|POST /api/cron/decision-intelligence` |
| **Cron** | Vercel `0 */6 * * *` (`pdv-importados/vercel.json`) |
| **Core** | tag `di-core-v1.0` — **intocado** |

---

## Princípio

**O orquestrador apenas coordena. Não calcula.**

| Faz | Não faz |
|-----|---------|
| Disparar `runEngineLoop` | Recalcular KPIs / Findings / Recommendations |
| Persistir Snapshot (append-only) | Mutar snapshots existentes em falha |
| Idempotência por content fingerprint | Criar DecisionRecord (humano) |
| Projetar Read Model pós-ciclo | Lógica de Analysis/Alert/ActionPlan |
| Registrar métricas / falhas por etapa | CRUD de entidades |

## Fluxo de execução

```
Scheduler / Trigger (manual | scheduled)
        ↓
listStoreIds (ou storeIds explícitos)
        ↓
FactProvidersFactory(storeId)   ← I/O; sem regras DI
        ↓
runEngineLoop (Core v1.0)
        ↓
DecisionSnapshot (em memória)
        ↓
content fingerprint == latest? ──yes──► reused (sem insert)
        │
        no
        ↓
persistDecisionSnapshot (retry 1x)
        ↓
buildDecisionIntelligenceReadModel (projeção)
        ↓
Cockpit (/admin/intelligence) lê latest no próximo request
```

**DecisionRecord:** fora deste ciclo. Continua humano/operacional; o Read Model junta records existentes quando o orquestrador projeta.

## Idempotência

O `pipelineFingerprint` do Memory **inclui `requestedAt`** → muda a cada ciclo.

O orquestrador usa `computeSnapshotContentFingerprint(snapshot)`:

- Facts (`factId` + `inputFingerprint`)
- KPIs (`id` + `status` + `inputFingerprint`)
- Findings / Recommendations / Alerts / Plans (ids)

Se igual ao latest da loja → outcome `reused`, **não** cria linha duplicada.

## Retry

| Etapa | Estratégia |
|-------|------------|
| Engine Loop | Sem retry no mesmo run; falha isolada por loja |
| Persistência | 1 retry imediato (`persistRetries: 1`) |
| Próximo cron | Reexecução completa (nova oportunidade) |
| Falha | Nunca delete/update snapshot anterior (append-only) |

## Métricas e logs

JSON estruturado (`decision_intelligence.orchestrator.run`):

- `startedAt` / `finishedAt` / `durationMs`
- `snapshotsCreated` / `snapshotsReused`
- `failuresTotal` / `failuresByStage`
- `coreVersion` (`di-core-v1.0`)
- `schemaVersion`
- `ruleVersion` (de `memory.ruleVersion` do snapshot)
- `storeResults[]` com fingerprint e erros

## Triggers

| Modo | Como |
|------|------|
| Agendado | Vercel Cron → `GET /api/cron/decision-intelligence` |
| Manual | `POST` + body `{ "storeIds": ["…"] }` opcional |

Auth: `Authorization: Bearer $CRON_SECRET` (ou `DI_ORCHESTRATOR_SECRET` / header `X-DI-Orchestrator-Key`).

## Fact Providers

`createEmptyWaveAProviders()` permite o ciclo operar sem SQL (KPIs blocked).  
Providers reais de produção são **incrementais** (fora do Core) e plugados via `providersFactory`.

## Guards

```bash
npm run check:di-orchestrator -w pdv-importados
npm run check:di-admin -w pdv-importados
```

## Ordem

1. ✅ Core · Persistência · DecisionRecord · Read Model · Admin  
2. ✅ Este Orchestrator  
3. Observabilidade avançada (se necessário)  
4. Feedback Loop (DecisionRecord → Memory)  
