# Customers — contratos fechados + adapters (Missão 5.1f)

| Campo | Valor |
|--------|--------|
| **Missão** | 5.1f — Clientes fechamento de contrato |
| **Data** | 2026-07-18 |
| **Pré-requisitos** | 5.1d (policies) · 5.1e (CustomerReader + listagem admin) |
| **Código de contratos** | `@fastproduct/shared-core/src/customers` |
| **Escopo** | Contratos + documentação — **sem** migrar CRUD |

---

## 1. Mapa de contratos (shared-core)

| Contrato | Papel | Status |
|----------|-------|--------|
| `CustomerReader` | Listagem paginada | **Implementado** (Fase 2) — `app/admin/clientes/customerReader.ts` |
| `CustomerReaderById` | Relê linha pós-write via view | **Implementado** (5.1g) — `getById` no reader |
| `CustomerWriter` | INSERT `clientes` | **Implementado** (5.1g) — `customerWriter.ts` + `criarClienteAction` |
| `CustomerUpdater` | UPDATE `clientes` | **Implementado** (5.1h) — `customerUpdater.ts` + `atualizarClienteAction` |
| `CustomerExclusionEffects` | I/O: fatos / anonimizar / delete | **Implementado** (5.1i) — `customerExclusion.ts` |
| `CustomerExclusionService` | Orquestra exclusão LGPD | **Implementado** (5.1i) — policy `decideClienteExclusion` |
| `validateClienteInput` | Policy pura create/update | **Implementado** (5.1d) — wired em Writer/Updater |
| `decideClienteExclusion` | Policy pura exclusão | **Implementado** (5.1d) — wired em ExclusionService |
| **Padrão reutilizável** | — | [padrao_migracao_dominio.md](./padrao_migracao_dominio.md) (5.1j) |

### Comandos / resultados

| Tipo | Uso |
|------|-----|
| `CreateClienteCommand` | `{ input, lojaId }` → Writer |
| `UpdateClienteCommand` | `{ id, input }` → Updater |
| `SaveClienteResult` | Retorno create/update com `ClienteListRow` |
| `DeleteClienteResult` | Retorno exclusão (`anonimizado?`) |
| `SaveClienteCommand` | Legado tipado (`ClienteInput` unificado) — preferir split Writer/Updater |

---

## 2. Adapters necessários (app — ainda não criar na 5.1f)

Todos sob `pdv-importados/app/admin/clientes/` (SSoT de borda). Pasta `gerente/clientes` permanece até Fase 3+ (reexport / UI).

| Adapter (alvo) | Implementa | Infra | Depende de (core) |
|----------------|------------|-------|-------------------|
| `customerReader.ts` | `CustomerReader` (+ opcional `CustomerReaderById`) | `v_clientes_gerente` | tipos |
| `customerWriter.ts` | `CustomerWriter` | INSERT `clientes` (+ consent LGPD) | `validateClienteInput` |
| `customerUpdater.ts` | `CustomerUpdater` | UPDATE `clientes` | `validateClienteInput` |
| `customerExclusion.ts` | `CustomerExclusionEffects` + `CustomerExclusionService` | view (saldo/nome), `contas_receber` count, UPDATE anon / DELETE | `decideClienteExclusion`, `CLIENTE_ANONIMIZACAO_PAYLOAD` |
| `actions.ts` (borda) | Server Actions finas | auth + revalidatePath | ports acima |

### Responsabilidades por camada

```
UI (page / list / modal)
  → actions.ts          auth, revalidatePath, mapeia input UI
    → Writer|Updater|ExclusionService|Reader
      → validate* / decide*   (shared-core — sem I/O)
        → Postgres            (inalterado nesta trilha)
```

### O que **não** vai para shared-core

- `assertGerenteSession`, cookies, `createClient`
- `revalidatePath`
- JSX / Server Components
- SQL / nomes de tabela como dependência do core (só nos adapters)

---

## 3. Impacto (5.1f)

| Área | Impacto |
|------|---------|
| Runtime `/admin/clientes` | **Nenhum** — listagem continua no Reader; CRUD no legado |
| `gerente/clientes` | **Intacto** |
| RPC / schema / RLS | **Nenhum** |
| Regras de negócio | **Nenhuma** — contratos espelham comportamento legado |
| shared-core | Superfície tipada expandida; policies já testadas |
| Callers (financeiro, PDV) | Sem mudança nesta missão |

**Risco:** baixo — só tipos + docs.  
**Dívida consciente:** `salvarClienteAction` / `excluirClienteAction` ainda misturam adapter + regras na pasta gerente.

---

## 4. Plano Fase 3 — migrar CRUD (implementação futura)

Objetivo: UI admin continua igual; actions de mutação passam pelos ports; policies do core entram no caminho quente.

### 4.1 Ordem sugerida (PRs pequenos)

| Passo | Entrega | Gate |
|-------|---------|------|
| **3.1** | `customerWriter` + `customerUpdater` + `getById` no reader; `salvarClienteAction` em **admin** delega (validate → write/update → revalidate) | Smoke create/edit; typecheck |
| **3.2** | `CustomerExclusionService` + effects; `excluirClienteAction` em admin delega | Smoke: saldo / anonimiza / delete |
| **3.3** | `ClienteEditarModal` / list client importam mutações de `@/app/admin/clientes/actions` | Zero import de save/delete do gerente nos clients ativos |
| **3.4** | Gerente `salvar*` / `excluir*` viram reexport thin (como a listagem) | Callers legados OK |
| **3.5** *(opcional, PR separado)* | Financeiro importa só port de leitura admin; colocation UI `_components` | Inventário 5.1b / ADR-006 |

### 4.2 Fora da Fase 3

- Remover pasta `gerente/clientes` (só após 1–2 releases com reexport)
- Unificar busca PDV (`buscarClientesCaixa`) com Writer/Reader admin
- Alterar RPC, schema, textos LGPD ou critérios de exclusão

### 4.3 Critérios de aceite Fase 3

1. Comportamento observável idêntico (mensagens de validação e exclusão).
2. `validateClienteInput` e `decideClienteExclusion` no caminho de mutação.
3. Nenhum JSX novo de CRUD fora de `/admin/clientes` (entity-ssot).
4. `npm run test` (shared-core) + typecheck pdv-importados verdes.
5. CRUD **não** reimplementa policy no TypeScript da action (só orquestra).

### 4.4 GO / NO-GO (para quando autorizar Fase 3)

| Decisão | Status agora (5.1f) |
|---------|---------------------|
| Contratos Writer / Updater / Exclusion fechados | **GO** (entregue) |
| Implementar adapters CRUD (Fase 3) | **GO** quando autorizar |
| Migrar CRUD nesta missão 5.1f | **NO-GO** |
| Mudar regras / schema / RPC | **NO-GO** |

---

## 5. Referências

- [ADR-006](../adr/ADR-006-frontend-domain-boundaries.md)
- [Plano spike clientes](./plano_spike_clientes_frontend.md)
- [Inventário frontend 5.1b](./inventario_frontend_boundary.md)
- Policies: `shared-core/src/customers/policies/*`
- Reader vivo: `pdv-importados/app/admin/clientes/customerReader.ts`
