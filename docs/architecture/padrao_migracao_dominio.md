# Padrão de migração de domínio (frontend → shared-core)

| Campo | Valor |
|--------|--------|
| **Missão** | 5.1j — Documentar padrão de migração |
| **Data** | 2026-07-18 |
| **Prova de conceito** | Domínio **customers** (Missões 5.1d → 5.1i) |
| **ADRs** | [ADR-005](../adr/ADR-005-fronteiras-dominio-shared-core.md) · [ADR-006](../adr/ADR-006-frontend-domain-boundaries.md) |
| **Escopo** | Documento reutilizável — **não** inicia `products`, **não** move código |

---

## 1. Propósito

Padronizar a extração de um domínio de superfície (CRUD / policies) do monólito `pdv-importados` para a cadeia:

```
UI → adapter (app) → port / policy (shared-core) → infraestrutura
```

Sem big-bang, sem segundo núcleo (`modules/shared`), sem mudar RPC/schema/regras no meio da migração.

**Referência viva:** `shared-core/src/customers` + `pdv-importados/app/admin/clientes/`.

---

## 2. Estrutura shared-core

### 2.1 Único pacote

```
@fastproduct/shared-core/src/<domínio>/
```

| Tipo de domínio | Exemplos de pasta | Notas |
|-----------------|-------------------|--------|
| Core comercial (ADR-005) | `sales/`, `cash/`, `inventory/`, `products/` | Scaffold / migração gradual |
| Cadastro satélite | `customers/` (feito), futuro `suppliers/` | Mesmo pacote; sem npm novo |
| Já existente | `pricing/`, `cart/`, `pdv/`, … | Alinhar exports com o tempo |

**Proibido:** `modules/shared`, segundo `shared-core*`, JSX/Next/Supabase no core.

### 2.2 Layout canônico de um domínio

```
shared-core/src/<domínio>/
  types.ts          # DTOs de domínio (sem I/O)
  contracts.ts      # ports: Reader, Writer, Updater, *Service, commands/results
  policies/         # funções puras (validate*, decide*)
    *.spec.ts       # testes unitários das policies
  index.ts          # barrel público — único ponto de import cross-domínio
```

| Artefato | Contém | Não contém |
|----------|--------|------------|
| `types` | shapes estáveis (Input, Row, enums) | nomes de tabela SQL |
| `contracts` | interfaces de port + comandos/resultados | implementação Supabase |
| `policies` | validação / decisão com mensagens legadas | auth, cookies, `revalidatePath` |
| `index` | reexports públicos | paths internos de outros domínios |

### 2.3 Guard

`npm run guard:domain` — pastas em `DOMAIN_DIRS` (inclui `customers`) não importam `app/` nem UI.  
Novos domínios no core: incluir no guard quando a pasta for criada.

---

## 3. Fluxo UI → adapter → port → infra

```
┌─────────────────────────────────────────────────────────────┐
│ UI (entity-ssot)                                            │
│ app/admin/<domínio>/page.tsx + clients/modais               │
│ • estado local, i18n bridge, dispara Server Actions         │
└───────────────────────────┬─────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ Adapter / borda                                             │
│ app/admin/<domínio>/                                        │
│   actions.ts           auth + revalidatePath (fino)         │
│   <domínio>Reader.ts   implementa *Reader                   │
│   <domínio>Writer.ts   implementa *Writer                   │
│   <domínio>Updater.ts  implementa *Updater                  │
│   <domínio>Exclusion.ts effects + *Service (se houver)      │
└───────────────────────────┬─────────────────────────────────┘
                            │ importa policies/ports
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ Port / policy — @fastproduct/shared-core/src/<domínio>      │
│ validate* · decide* · tipos · CustomerReader | …            │
└───────────────────────────┬─────────────────────────────────┘
                            │ (só via adapter)
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ Infra                                                       │
│ tabelas · views · RLS · RPCs (inalterados na migração)      │
└─────────────────────────────────────────────────────────────┘
```

### Responsabilidades

| Camada | Faz | Não faz |
|--------|-----|---------|
| **UI** | Chama actions; preserva UX | Supabase direto; regras de negócio |
| **actions.ts** | `assertGerenteSession`, instancia adapter, revalidate | Policy embutida sem teste no core |
| **\*Reader/Writer/…** | I/O + map view↔DTO; chama policy do core | JSX |
| **shared-core** | Tipos, ports, policies testáveis | React, Next, cliente Supabase de app |
| **Infra** | Persistência | — |

### Cross-domínio

- Domínio B **lê** A via port/action do dono (ex.: financeiro → `buscarClientesPaginadosAction`).
- Domínio B **não** importa modal/form de A.

---

## 4. Fases de migração (ordem obrigatória)

Migrar **uma operação por PR** (ou missão). Congelar comportamento observável a cada passo.

| Fase | Entrega | Gate |
|------|---------|------|
| **0 — Inventário** | Rotas, actions legadas, callers, entity-ssot | Doc; GO/NO-GO |
| **1 — Domínio puro** | `types` + `contracts` + `policies` + specs no shared-core | Testes core verdes; **sem** wire app (ou wire mínimo) |
| **2 — Contratos fechados** | Ports Writer/Updater/Service documentados | Doc de adapters |
| **3 — Reader** | Listagem (e `getById` se necessário) | Smoke listagem |
| **4 — Writer** | Só create | Smoke create + list |
| **5 — Updater** | Só update | Smoke edit |
| **6 — Exclusion / Delete** | Service + effects; policy no core | Cenários: inexistente, com/sem histórico, repetido |
| **7 — Facade legado** | `gerente/*` reexporta; UI pode ficar na pasta legado 1–2 releases | Zero I/O duplicado |
| **8 — Colocation UI** *(opcional, PR separado)* | Mover clients para `admin/<domínio>/_components` | Visual idêntico |

**Não pular** direto para products/caixa/financeiro sem repetir este padrão num domínio simples.

---

## 5. Checklist (copiar por domínio)

### Antes de codar

- [ ] UI SSoT identificada (`/admin/...`) — entity-ssot
- [ ] Callers mapeados (admin, financeiro, PDV, …)
- [ ] Mensagens de erro / critérios de exclusão **congelados** (copiar do legado)
- [ ] Confirmar: sem mudança de RPC, schema, RLS neste ciclo
- [ ] Nome da pasta no shared-core acordado (inglês, singular/plural alinhado ao time)

### Shared-core

- [ ] `types.ts` + `contracts.ts` + `policies/` + `index.ts`
- [ ] Specs das policies (mensagens byte-a-byte com legado)
- [ ] Pasta listada em `guard:domain` (`DOMAIN_DIRS`) se aplicável
- [ ] `npm run test --workspace=@fastproduct/shared-core`
- [ ] Core não importa `app/` / components

### Adapter app

- [ ] Adapters sob `app/admin/<domínio>/` (não expandir features novas em `gerente/`)
- [ ] Actions finas: auth → port → revalidate
- [ ] Reader antes de Writer; Writer antes de Updater; Exclusion por último
- [ ] Testes de adapter onde houver orquestração (ex.: ExclusionService com effects mock)
- [ ] `npm run typecheck --workspace=pdv-importados`
- [ ] `npm run guard:domain`

### Legado

- [ ] Pasta `gerente/<domínio>` **não removida** no mesmo PR da migração
- [ ] Reexport / facade para callers antigos
- [ ] UI sem redesign — só troca de action importada

### Aceite

- [ ] Comportamento observável idêntico (create / update / delete / list)
- [ ] Policies no caminho quente (não só “código morto” no core)
- [ ] Nenhum segundo CRUD fora da rota SSoT

---

## 6. Decisões aprendidas em customers

| # | Aprendizado | Prática |
|---|-------------|---------|
| 1 | **Um núcleo só** | Domínio satélite (`customers`) vive em `@fastproduct/shared-core`, não em pacote paralelo |
| 2 | **Policy primeiro, I/O depois** | 5.1d extraiu `validate*` / `decide*` com testes **antes** de wire; reduziu risco de drift |
| 3 | **Ports antes do CRUD completo** | 5.1f fechou Writer/Updater/Exclusion **contratos** antes de implementar mutações |
| 4 | **Fatiar create ≠ update ≠ delete** | 5.1g → 5.1h → 5.1i; PRs pequenos, rollback claro |
| 5 | **Reader precisa de `getById`** | Pós-write relê a **view** (campos computados); não devolver só o payload do INSERT |
| 6 | **Mensagens legadas são contrato** | Specs assertam strings exatas (`Nome inválido.`, LGPD, etc.) |
| 7 | **Exclusion = effects + service** | I/O mockável nos testes; policy pura no core; action só auth + revalidate |
| 8 | **Legado vira facade, não lixeira** | `gerente/clientes/actions` reexporta admin; UI pode ficar na pasta legado temporariamente |
| 9 | **Não unificar PDV no mesmo spike** | Busca caixa tem auth/contrato distintos — tipos do core depois, adapter separado |
| 10 | **Cross-cut só por port de leitura** | Financeiro deve importar listagem do dono, nunca o modal de clientes |
| 11 | **Payload shared no adapter** | `buildClientePersistPayload` no app (map UI↔coluna DB); core não conhece `limite_credito` |
| 12 | **Guard acompanha pasta** | Ao criar domínio no core, atualizar `DOMAIN_DIRS` no mesmo PR |

### Anti-padrões (evitar)

| Anti-padrão | Por quê |
|-------------|---------|
| Só mover `gerente/X` → `admin/X` sem core | Não prova a cadeia; regras continuam nas actions |
| Server Actions dentro do shared-core | Viola ADR-005/006 |
| Migrar catálogo/caixa primeiro | Tier E — alto acoplamento; validar padrão em domínio simples |
| Mudar schema “já que estamos aqui” | Mistura fundação com feature; quebra critério de aceite |
| Remover pasta legado no mesmo PR do Writer | Quebra bookmarks / imports; usar reexport 1–2 releases |

---

## 7. Mapa de referência (customers)

| Camada | Path |
|--------|------|
| Core | `shared-core/src/customers/` |
| Adapters | `pdv-importados/app/admin/clientes/{customerReader,customerWriter,customerUpdater,customerExclusion,actions}.ts` |
| UI SSoT | `app/admin/clientes/page.tsx` |
| UI/legado | `app/gerente/clientes/{ClientesListClient,ClienteEditarModal}.tsx` |
| Facade | `app/gerente/clientes/actions.ts` (reexport) |
| Detalhe contratos | [customers_contracts_adapters.md](./customers_contracts_adapters.md) |
| Inventário UI | [inventario_frontend_boundary.md](./inventario_frontend_boundary.md) |

---

## 8. Próximo domínio (orientação — sem iniciar)

Ordem sugerida pelo inventário 5.1b (isolamento):

1. **fornecedores** (`suppliers`) — similar a customers; atenção ao `FornecedorCombobox` legado  
2. taxonomias pequenas  
3. **products** / inventory / financeiro / caixa — só após o padrão estar rotineiro  

Este documento **não** autoriza iniciar `products`; apenas define como migrar quando houver missão dedicada.

---

## 9. GO / NO-GO

| Critério | Status |
|----------|--------|
| Spike customers completo (Reader → Exclusion) | OK |
| Cadeia UI → adapter → port → infra comprovada | OK |
| Documento reutilizável (este) | OK |
| Iniciar products / mover código nesta missão | **NO-GO** |
| Alterar arquitetura / RPC / schema nesta missão | **NO-GO** |

| Decisão | Resultado |
|---------|-----------|
| Usar este padrão nos próximos domínios | **GO** |
| Iniciar migração de `products` agora | **NO-GO** (aguardar missão explícita) |

---

## Sign-off

| Papel | Entrega | Data |
|-------|---------|------|
| Eng | Padrão de migração documentado a partir de customers | 2026-07-18 |
