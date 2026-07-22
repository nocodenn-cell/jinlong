# ADR-006 — Frontend Domain Boundaries

| Campo | Valor |
|--------|--------|
| **ID** | ADR-006 |
| **Título** | Fronteiras de domínio na camada frontend (UI → adapter → shared-core → infra) |
| **Status** | Aceito — decisões e caminho de spike (Missão 5.1c); **sem implementação de código nesta data** |
| **Data** | 2026-07-18 |
| **Contexto** | PR 5.1a mergeado (`d0487340`); inventário frontend 5.1b concluído |
| **Missão** | 5.1c — ADR frontend boundary + plano spike clientes |
| **Relacionados** | [ADR-005](./ADR-005-fronteiras-dominio-shared-core.md), [Inventário frontend 5.1b](../architecture/inventario_frontend_boundary.md), [Inventário writers 5.1a](../architecture/inventario_dominio_modulo_tabela_writer.md), [Plano spike clientes](../architecture/plano_spike_clientes_frontend.md), entity-ssot (`.cursor/rules/entity-ssot.mdc`), DEC-012 |

---

## Contexto

ADR-005 fixou o **único núcleo** `@fastproduct/shared-core` e os donos conceituais `sales` / `cash` / `inventory` / `products`. O inventário 5.1b mostrou que a superfície UI ainda vive em **dual-layer**:

| Camada atual | Local | Problema |
|--------------|-------|----------|
| UI canônica | `app/admin/*`, `app/caixa/*` | OK (entity-ssot) |
| Actions + clients | `app/gerente/*` (maioria) | Pasta legada; regras misturadas com I/O |
| Shared-core | pricing, cart, scan, routes | Ainda sem pasta de cadastros satélite |

Sem uma ADR de **borda frontend**, qualquer move tende a:

- empurrar JSX para o shared-core; ou
- criar `modules/*` paralelo; ou
- “colocar actions no admin” sem extrair domínio (só troca de pasta).

O primeiro candidato de prova (5.1b) é **clientes**: CRUD limitado, UI SSoT em `/admin/clientes`, um único consumidor cross-domínio de leitura (financeiro).

---

## Decisão

### 1. Cadeia canônica de dependência (frontend)

Toda feature de domínio na web segue (ou migra gradualmente para):

```
UI (rota / components)
  → Adapter (Server Action / *.impl / repository app)
    → shared-core (tipos, policies, validação pura, ports)
      → Infraestrutura (Postgres / Supabase / view / RPC)
```

| Camada | Responsabilidade | Pode importar | Não pode |
|--------|------------------|---------------|----------|
| **UI** | Render, estado local, i18n bridge, disparo de actions | adapter (actions), shared UI, tipos de DTO públicos | Supabase direto; regras de negócio duplicadas; UI de outro domínio |
| **Adapter** | Auth de sessão, mapeamento DTO↔DB, chamada infra, `revalidatePath` | shared-core, `lib/supabase`, `lib/admin` | JSX; policies “escondidas” sem teste; UI de outro domínio |
| **shared-core** | Tipos, validação pura, políticas (ex.: LGPD de exclusão), ports | apenas módulos públicos do próprio pacote | `app/`, React, Next cookies, cliente Supabase de app |
| **Infra** | Tabelas, views, RLS, RPCs | — (SQL / Edge) | — |

**Seta única:** UI → adapter → shared-core → (contratos) → infra via adapter.  
**Proibido:** shared-core → app; UI(A) → UI(B); domínio puro → infraestrutura concreta.

Isto **complementa** ADR-005 (que define o núcleo e os writers); não o substitui.

---

### 2. Domínios de superfície vs donos ADR-005

| Tipo | Exemplos | Residência de regras puras |
|------|----------|----------------------------|
| **Core comercial** | sales, cash, inventory, products | `shared-core/src/{sales,…}` (scaffold ADR-005) |
| **Cadastro satélite** | clientes, fornecedores | `shared-core/src/customers` (e futuro `suppliers`) — **não** criar pacote npm novo |
| **Agregador / shell** | dashboard, relatórios, auditoria | permanecem na app; leem via ports dos donos |

**Decisão:** `customers` (clientes) é domínio satélite legítimo no **mesmo** `@fastproduct/shared-core`. Não entra nos quatro writers do ciclo de venda, mas segue as mesmas regras de fronteira (sem UI, sem I/O).

---

### 3. UI SSoT (entity-ssot) não se move

| Entidade | Rota oficial | Spike |
|----------|--------------|-------|
| Cliente | `/admin/clientes` | **UI SSoT** — permanece |
| — | `app/gerente/clientes/*` | **Legado** a mapear / colocalizar depois |
| — | `buscarClientesCaixa` em `app/caixa` | Leitura PDV própria (adapter separado; pode reutilizar tipos/policies do core) |

Nenhum ADR autoriza criar segunda tela de CRUD de cliente.

---

### 4. Regras de import frontend (normativas)

1. **Código novo** de feature admin: colocalizar sob `app/admin/<domínio>/` (page, `_components`, `actions` finas). Não expandir `app/gerente/` com features novas.
2. **Cross-domínio na app:** só via **port de leitura** (action/função exportada do dono) ou contrato em shared-core — nunca importar modal/form do outro domínio.
3. **Regras que hoje estão nas actions** (validação CPF/CNPJ, política LGPD de exclusão, mapeamento de campos de domínio) → candidatas a shared-core no spike; I/O permanece no adapter.
4. **`app/gerente/*`**: legado de localização até migração domínio a domínio; redirects `/gerente/*` continuam.
5. **Proibido:** `modules/shared`, segundo `shared-core`, big-bang de pasta.

Alinhado a `guard:domain` (5.1a) e `check:entity-ssot`.

---

### 5. Adapter fino vs action gorda (estado atual → alvo)

**Hoje (legado tipico — clientes):**

```
ClientesListClient / ClienteEditarModal   (UI, pasta gerente)
        ↓
gerente/clientes/actions.ts               (auth + validar + LGPD + Supabase + revalidate)
        ↓
clientes / v_clientes_gerente             (infra)
```

**Alvo (após spike implementado):**

```
app/admin/clientes/page + _components     (UI SSoT)
        ↓
app/admin/clientes/actions.ts             (adapter: auth, repo, revalidate)
        ↓
@shared-core/customers                    (tipos, validateCliente, politicaExclusaoLgpd)
        ↓
Supabase (tabela clientes, view)          (infra — só no adapter)
```

Consumidor financeiro:

```
admin/financeiro  →  port leitura do dono customers
                  ✗→  ClienteEditarModal / form completo
```

---

### 6. Escopo desta ADR (5.1c)

| Entrega | Nesta data |
|---------|------------|
| ADR-006 (este documento) | Sim |
| Plano do spike clientes | Sim — [`plano_spike_clientes_frontend.md`](../architecture/plano_spike_clientes_frontend.md) |
| Mover arquivos / alterar UI / RPC / regras | **Não** |
| Scaffold `shared-core/src/customers` | **Não** (PR futuro de implementação) |

---

## Consequências

### Positivas

- Caminho demonstrável e testável sem tocar no ciclo comercial GO.
- Template reutilizável para fornecedores e, depois, products/inventory.
- Mantém DEC-012 (um núcleo) e entity-ssot.

### Negativas / trade-offs

- Dual-layer `gerente/` coexiste até o spike e PRs seguintes.
- Extração de LGPD/validação exige testes puros no core sem mudar comportamento observável.
- Caixa mantém adapter de busca separado até unificar tipos (opcional, pós-spike).

### Riscos se ignorado

- “Migração” = só renomear pasta sem domínio → dívida recorrente.
- Extrair UI para shared-core → acoplamento Next/Tauri.
- Migrar caixa/financeiro/catálogo primeiro → risco alto sem padrão validado.

---

## Alternativas rejeitadas

| Alternativa | Motivo |
|-------------|--------|
| Só mover `gerente/clientes` → `admin/clientes` sem shared-core | Não prova a cadeia UI → adapter → core → infra |
| Colocar Server Actions no shared-core | Viola ADR-005 (core sem Next/auth) |
| Unificar já a busca do caixa com o CRUD admin | Escopo maior; PDV tem auth/contrato distintos |
| Começar pelo catálogo ou financeiro | Tier E no inventário 5.1b |

---

## Sign-off

| Papel | Decisão | Data |
|-------|---------|------|
| Eng | Cadeia UI → adapter → shared-core → infra; spike clientes como prova | 2026-07-18 |

**Próximo passo (implementação, quando autorizado):** executar o [plano do spike clientes](../architecture/plano_spike_clientes_frontend.md) em PR isolado, **sem** mudança de regra de negócio.
