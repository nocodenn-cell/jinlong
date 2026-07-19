# Missão — Decision Intelligence Persistência (Fase 1 / P0)

| Campo | Valor |
|--------|--------|
| **Status** | **Concluído** (camada de integração; Core intocado) |
| **Checkpoint Core** | tag `di-core-v1.0` (congelado) |
| **Código** | `pdv-importados/lib/decision-intelligence/` |
| **Schema** | `backend/supabase/migrations/272_decision_snapshots.sql` |

---

## Objetivo

Armazenar tudo o que o Engine Loop produz, **sem alterar o Core**.

```
Engine Loop (Core v1.0 — intocado)
      ↓
DecisionSnapshot
      ↓
DecisionSnapshotRepositoryPort
      ↓
Adapter Supabase/Postgres
      ↓
public.decision_snapshots
```

## Princípios

| Norma | |
|-------|--|
| Core v1.0 congelado | Sem mudanças em `shared-core/src/intelligence` engines |
| Sem lógica de negócio no adapter | Só serialização + I/O |
| Persistência assíncrona | Não bloqueia o loop; falha de persistência não invalida o snapshot em memória |
| Versionamento | `snapshot_version` (ex.: `di-core-v1.0`) + `schema_version` (payload JSON) |

## Contrato da porta

- `save(snapshot, meta)` → id persistido  
- `findById` / `findLatestByLoja` → leitura para fases seguintes (Read Model)

## Fora de escopo (fases seguintes)

- DecisionRecord (aceite/outcome)  
- Read Model / projeções  
- `/admin/intelligence`  
- Scheduler  

## Ordem

1. ✅ Este documento + migration + porta + adapters + testes  
2. ✅ Checkpoint `di-persist-phase-1`  
3. ✅ Fase 2 DecisionRecord (`DECISION_INTELLIGENCE_DECISION_RECORD.md`)  
4. Fase 3 Read Model  
