# Plano do spike — clientes (frontend / domínio)

| Campo | Valor |
|--------|--------|
| **Missão** | 5.1c — ADR frontend boundary + spike clientes |
| **Data** | 2026-07-18 |
| **ADR** | [ADR-006](../adr/ADR-006-frontend-domain-boundaries.md) |
| **Inventário** | [Frontend 5.1b](./inventario_frontend_boundary.md) |
| **Escopo deste doc** | Proposta e caminho futuro — **não** implementa, **não** move arquivos |
| **UI SSoT** | `/admin/clientes` → `pdv-importados/app/admin/clientes/page.tsx` |
| **Contratos 5.1f** | [customers_contracts_adapters.md](./customers_contracts_adapters.md) — Writer/Updater/Exclusion + plano Fase 3 |

---

## 1. Objetivo do spike

Validar o **primeiro padrão** de separação frontend/domínio:

```
UI → adapter → @fastproduct/shared-core → infraestrutura
```

Critérios de sucesso (quando implementar):

1. Comportamento observável **idêntico** (CRUD, paginação, LGPD, financeiro lê lista).
2. Regras puras testáveis no shared-core (validação + política de exclusão).
3. Financeiro deixa de depender de UI de clientes; usa só port de leitura.
4. Zero mudança de RPC / schema / RLS neste spike.

---

## 2. Mapa legado (estado atual — congelado)

### 2.1 Arquivos

| Papel hoje | Path | Camada real |
|------------|------|-------------|
| UI SSoT (page) | `app/admin/clientes/page.tsx` | UI (fina) |
| Lista + CRUD client | `app/gerente/clientes/ClientesListClient.tsx` | UI (**legado pasta**) |
| Modal editar/criar | `app/gerente/clientes/ClienteEditarModal.tsx` | UI (**legado pasta**) |
| Actions gordinhas | `app/gerente/clientes/actions.ts` | Adapter **+ domínio misturado** |
| Leitura financeiro | `app/admin/financeiro/page.tsx` → `buscarClientesPaginadosAction` | Cross-cut leitura |
| Busca PDV | `app/caixa/server/caixaClientesSearch.impl.ts` + `actions` | Adapter separado (fora do spike CRUD) |

### 2.2 Funções em `gerente/clientes/actions.ts`

| Export / lógica | Destino alvo no spike |
|-----------------|----------------------|
| `ClienteListRow`, `ClienteInput` | Tipos em `shared-core` (+ DTO UI se necessário na app) |
| `mapClienteRow` | Adapter (mapeamento view→DTO) ou mapper puro no core se sem I/O |
| `validar(input)` | **shared-core** — `validateClienteInput` |
| `buscarClientesPaginadosAction` | Adapter (auth + query view) |
| `salvarClienteAction` | Adapter chama validate + repo Supabase |
| `excluirClienteAction` (saldo / histórico / anonimizar / delete) | Política de decisão no **core**; efeitos no **adapter** |
| `revalidatePath` | Adapter only |
| `assertGerenteSession` / `createClient` | Adapter / infra app |

### 2.3 Infraestrutura (não alterar no spike)

| Recurso | Uso |
|---------|-----|
| Tabela `clientes` | INSERT/UPDATE/DELETE/anonimização |
| View `v_clientes_gerente` | Listagem + campos computados (`saldo_crediario`, …) |
| Tabela `contas_receber` | Gate de histórico na exclusão (leitura `count`) |
| RLS / sessão gerente | Via `assertGerenteSession` + client server |

---

## 3. Arquitetura alvo (pós-implementação)

```
┌──────────────────────────────────────────────────────────────┐
│ UI SSoT                                                      │
│ app/admin/clientes/page.tsx                                  │
│ app/admin/clientes/_components/                              │
│   ClientesListClient.tsx, ClienteEditarModal.tsx             │
└────────────────────────────┬─────────────────────────────────┘
                             │ chama
                             ▼
┌──────────────────────────────────────────────────────────────┐
│ Adapter                                                      │
│ app/admin/clientes/actions.ts                                │
│   • assertGerenteSession / loadAdminContext                  │
│   • createClient + queries                                   │
│   • map view ↔ DTO                                           │
│   • revalidatePath('/admin/clientes')                        │
│   • export port: listarClientesPaginados (leitura pública    │
│     para financeiro)                                         │
└────────────────────────────┬─────────────────────────────────┘
                             │ importa
                             ▼
┌──────────────────────────────────────────────────────────────┐
│ shared-core — customers                                      │
│ @fastproduct/shared-core/src/customers/                      │
│   types.ts          ClienteInput, ClienteListRow (domínio)   │
│   validate.ts       CPF/CNPJ/email/limite                    │
│   exclusionPolicy.ts  decide: reject | anonymize | delete    │
│   index.ts          barrel público                           │
└────────────────────────────┬─────────────────────────────────┘
                             │ contratos / decisões
                             ▼
┌──────────────────────────────────────────────────────────────┐
│ Infraestrutura (inalterada)                                  │
│ clientes · v_clientes_gerente · contas_receber · RLS         │
└──────────────────────────────────────────────────────────────┘
```

**Consumidor financeiro (alvo):**

```ts
// permitido
import { listarClientesPaginados } from '@/app/admin/clientes/actions'
// ou port nomeado reexportado — sem importar _components de clientes

// proibido
import { ClienteEditarModal } from '…'
```

**Caixa:** permanece em `caixaClientesSearch.impl` neste spike; opcionalmente passa a importar só **tipos** de `@shared-core/customers` (sem unificar auth).

---

## 4. Fases de implementação (PR futuro — fora de 5.1c)

Cada fase = PR pequeno, comportamento congelado, testes verdes.

### Fase 0 — Pré-requisitos (se ainda não feitos)

- [ ] Scaffold ADR-005 mínimo em `shared-core/src/` (sales/inventory/cash/products) **ou** criar só `customers/` se o time optar por spike antes do scaffold completo (aceitável: pasta satélite sem mexer nos quatro cores).
- [ ] Baseline manual/smoke: listar, criar, editar, excluir (com e sem histórico), financeiro abre com lista de clientes.

### Fase 1 — Extrair domínio puro (sem mover UI)

| Passo | Ação | Não fazer |
|-------|------|-----------|
| 1.1 | Criar `shared-core/src/customers/{types,validate,exclusionPolicy,index}.ts` | Mudar mensagens de erro visíveis sem fixture |
| 1.2 | Portar `validar` → `validateClienteInput` com testes unitários | Chamar Supabase no core |
| 1.3 | Extrair decisão LGPD: input `{ saldoCrediario, temHistoricoContasReceber }` → `reject \| anonymize \| delete` | Alterar textos LGPD / critérios |
| 1.4 | `gerente/clientes/actions.ts` passa a **delegar** validate/policy ao core; I/O igual | Mover arquivos de UI |

**Gate Fase 1:** `npm test` / vitest shared-core + smoke CRUD idêntico.

### Fase 2 — Colocalizar adapter + UI sob SSoT

| Passo | Ação | Não fazer |
|-------|------|-----------|
| 2.1 | Criar `app/admin/clientes/actions.ts` (reexport ou move do conteúdo fino) | Mudar contratos de action sem atualizar callers |
| 2.2 | Mover clients para `app/admin/clientes/_components/` | Redesign visual |
| 2.3 | Atualizar imports: `page.tsx`, financeiro → novo path | Remover redirects `/gerente` |
| 2.4 | Deixar `app/gerente/clientes/*` como reexport thin **ou** apagar só após zero imports (preferir reexport 1 release) | Quebrar bookmarks |

**Gate Fase 2:** `check:entity-ssot` + smoke admin clientes + financeiro.

### Fase 3 — Port de leitura cross-domínio

| Passo | Ação |
|-------|------|
| 3.1 | Nomear export estável `listarClientesPaginados` (alias de `buscarClientesPaginadosAction`) |
| 3.2 | `admin/financeiro/page.tsx` importa só o port do admin/clientes |
| 3.3 | Grep: zero imports de `gerente/clientes` a partir de `admin/**` (exceto reexport temporário) |

**Gate Fase 3:** spike **GO** — padrão demonstrado.

### Fora do spike (backlog)

- Unificar busca PDV com tipos/core (sem misturar assertGerente).
- Remover pasta `gerente/clientes` após 1–2 releases.
- Guard lint: banir `admin/X` importar `_components` de `admin/Y`.

---

## 5. Contratos a preservar (zero mudança de regra)

| Comportamento | Fonte atual |
|---------------|-------------|
| PF documento 11 dígitos; PJ 14 | `validar` |
| E-mail regex; limite ≥ 0; nome ≥ 2 chars | `validar` |
| Create exige `loja_id` da sessão | `salvarClienteAction` |
| LGPD consent fields só no create | insert payload |
| Exclusão: saldo > 0 → rejeita | `excluirClienteAction` |
| Exclusão: histórico contas_receber → anonimiza + `ativo=false` | idem |
| Exclusão: sem histórico → delete físico | idem |
| Listagem via `v_clientes_gerente`, page size 20 | `buscarClientesPaginadosAction` |
| `revalidatePath` admin (+ gerente legado ok) | actions |

Qualquer divergência acidental = **NO-GO** do PR de implementação.

---

## 6. Test plan (quando implementar)

| Caso | Camada |
|------|--------|
| validate: PF/PJ/email/limite inválidos | shared-core unit |
| exclusionPolicy: reject / anonymize / delete | shared-core unit |
| Listar página 1 + termo | smoke / action |
| Criar + editar + reler saldo na view | smoke |
| Excluir sem histórico; com histórico; com saldo | smoke |
| Financeiro carrega opções de cliente | smoke |
| PDV `buscarClientesCaixa` inalterado | regressão rápida |

---

## 7. Riscos e mitigações

| Risco | Mitigação |
|-------|-----------|
| Diff grande de move UI | Fase 1 primeiro (só core); Fase 2 move mecânico |
| Financeiro quebra import | Atualizar no mesmo PR da Fase 2/3; CI typecheck |
| Drift de mensagem de erro | Snapshot / comparar strings na Fase 1 |
| Escopo creep (fiado, vendas.cliente_id) | Fora — ver comentários na view; não expandir |

---

## 8. GO / NO-GO

### Critérios para autorizar implementação do spike

| Critério | Status |
|----------|--------|
| ADR-006 aceito (cadeia UI → adapter → core → infra) | OK (doc) |
| Inventário 5.1b + escolha clientes | OK |
| UI SSoT e legado mapeados | OK |
| Infra/RPC/regras **não** no escopo do spike | OK |
| Plano fatiado em fases com gates | OK |

### Veredito

| Decisão | Resultado |
|---------|-----------|
| **GO** para implementar o spike clientes em PR(s) futuros conforme este plano | **GO** |
| **NO-GO** para implementar nesta missão 5.1c (só docs) | **NO-GO** (código) |
| **NO-GO** para alterar UI/RPC/regras / big-bang gerente | **NO-GO** |

**Ordem recomendada na implementação:** Fase 1 (core puro) → Fase 2 (colocation) → Fase 3 (port financeiro).

---

## Sign-off

| Papel | Entrega | Data |
|-------|---------|------|
| Eng | Plano spike clientes + GO para implementação futura | 2026-07-18 |
