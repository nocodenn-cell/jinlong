# Inventário de fronteira frontend — rotas → domínio → shared-core

| Campo | Valor |
|--------|--------|
| **Missão** | 5.1b — Frontend Boundary Split |
| **Data** | 2026-07-18 |
| **Pré-requisito** | PR 5.1a mergeado (`d0487340`) — inventário writers + `guard:domain` |
| **ADR** | [ADR-005](../adr/ADR-005-fronteiras-dominio-shared-core.md) |
| **Par** | [Inventário 5.1a (DB/writers)](./inventario_dominio_modulo_tabela_writer.md) |
| **Escopo** | Documentação e análise — **não** move arquivos, **não** altera UI/RPC/regras |
| **App analisado** | `pdv-importados` (piloto web; DEC-013) |

---

## 1. Objetivo

Preparar a **separação frontend por domínio** sem mudar comportamento:

1. Congelar o mapa factual: rota → tela → actions → dependências → dono.
2. Definir regras de import da camada app.
3. Explicitar a fronteira **app → domínio (conceitual) → `@fastproduct/shared-core`**.
4. Recomendar o **primeiro módulo** de migração futura.
5. Emitir **GO / NO-GO** para implementação subsequente (scaffold / moves).

**Fora deste documento:** scaffold de pastas em `shared-core`, moves de código, novos módulos npm, alteração de entity-ssot ou RPCs.

> **Nota de sequência vs ADR-005:** o ADR lista “PR 5.1b = scaffold `shared-core/src/`”. Esta missão **5.1b Frontend** entrega o inventário de superfície UI/actions **antes** de qualquer scaffold/move. O scaffold permanece o próximo passo de implementação (sem comportamento novo).

---

## 2. Modelo de camadas (alvo)

```
┌─────────────────────────────────────────────────────────────┐
│  APP (borda)                                                │
│  pdv-importados/app/{admin,caixa,login,…}                   │
│  • rotas Next, layouts, Server Actions, adapters UI         │
│  • pode importar shared-core + shared UI local              │
└───────────────────────────┬─────────────────────────────────┘
                            │ importa contratos / policies
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  DOMÍNIO (conceitual — ADR-005)                             │
│  sales | cash | inventory | products (+ i18n/formatting)    │
│  • regras puras, tipos, ports — sem React/Next              │
│  • residência alvo: @fastproduct/shared-core/src/{domínio}  │
└───────────────────────────┬─────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  SHARED-CORE (único núcleo — DEC-012 / ADR-005)             │
│  @fastproduct/shared-core                                   │
│  • pricing, cart, scan-pipeline, routes, invariants (hoje)  │
│  • sales/inventory/cash/products/i18n… (scaffold futuro)    │
└─────────────────────────────────────────────────────────────┘
```

### Proibido (já guardado em 5.1a)

| Path / padrão | Motivo |
|---------------|--------|
| `modules/shared` | Arquitetura paralela |
| Segundo pacote `shared-core*` | Duas fontes de verdade |
| Domínio puro importar `app/` ou UI | Inverte a seta de dependência |
| UI de domínio A importar UI de domínio B | Acoplamento de apresentação (usar port/read API) |

---

## 3. Estado atual (fatos)

### 3.1 Padrão dual-layer (cheiro estrutural)

| Camada | Onde vive | Papel hoje |
|--------|-----------|------------|
| **UI canônica** | `app/admin/*`, `app/caixa/*` | Rotas oficiais (entity-ssot) |
| **Data / clients legados** | `app/gerente/*` | Maioria das Server Actions + `*PageClient` / list clients |
| **Redirect legado** | `app/gerente/[...path]` + `LEGACY_GERENTE_REDIRECTS` | `/gerente/*` → `/admin/*` |

Admin V2 é em geral **shell fino** que importa `@/app/gerente/...`. Isso **não** é fronteira de domínio — é dívida de migração de pasta.

### 3.2 Aliases de import (`pdv-importados/tsconfig.json`)

| Alias | Resolve | Uso |
|-------|---------|-----|
| `@/*` | raiz `pdv-importados` | Dominante (app, lib, components) |
| `@shared-core/*` | `../shared-core/*` | Rotas, pricing, cart, scan |
| `@/shared/*` | `./shared/*` | Helpers locais |
| `@/i18n/*`, `@/idioma/*` | `src/lib/i18n`, `src/lib/idioma` | Mensagens / locale legado |
| `@shared/*` | `../shared/*` | Raro (monorepo legado) |

### 3.3 Pastas de superfície

| Pasta | Papel |
|-------|--------|
| `components/ui/`, `components/ui/admin-v2/` | Shared UI / shell admin |
| `components/caixa/`, `components/gerente/` | UI de domínio (nome legado “gerente”) |
| `lib/admin/`, `lib/supabase/`, `lib/auth/` | Shared app (auth, policy, client) |
| `lib/caixa/`, `lib/gerente/`, `lib/nfe/`, `lib/etiqueta/` | Helpers por domínio / legado |
| `core/` | Ports/regras parciais (pré-shared-core) |
| `stores/` | Estado PDV (cart) |
| `hooks/` | Hooks transversais; caixa também em `app/caixa/hooks/` |

**Não existe** pasta top-level `features/` de domínio (apenas `app/gerente/features/FeatureToggle.tsx`).

---

## 4. Mapa de domínios de superfície → dono ADR-005

Domínios de **dados/writers** (5.1a): `sales`, `cash`, `inventory`, `products`.

Domínios de **superfície frontend** (este inventário) mapeiam assim:

| Superfície UI | Dono ADR-005 (conceitual) | Notas |
|---------------|---------------------------|--------|
| `/caixa` (PDV) | **sales** + **cash** | Venda/pagamentos = sales; turno/movs = cash |
| `/admin/vendas` | **sales** | Cancel/devolver orquestram inventory/cash no RPC |
| `/admin/catalogo`, categorias/marcas produto | **products** | Entity-ssot produto |
| `/admin/estoque/*`, recebimento, NF-e, transferências, etiquetas | **inventory** (+ products na NF-e) | Entity-ssot estoque |
| `/admin/financeiro/*`, categorias financeiras | **cash** / ledger app | Contas a pagar/receber; fila fiscal |
| `/admin/clientes` | *(cadastro — fora dos 4 writers core)* | CRUD próprio; leitura no financeiro/caixa |
| `/admin/fornecedores` | *(cadastro)* | CRUD; combobox legado no form produto |
| `/admin/compras`, comissões, relatórios | agregadores / satélites | Leitura multi-domínio |
| `/admin/configuracoes`, suspensão, diagnóstico | config / ops | Transversal |
| `/admin/dashboard`, auditoria | shell / timeline | Cross-cut de leitura |
| Auth, termos, privacidade | shared app | Fora de domínio comercial |

---

## 5. Inventário de rotas e telas

### 5.1 Auth / legal / misc

| Rota | Arquivo | Domínio superfície | Dependências principais |
|------|---------|--------------------|-------------------------|
| `/` | `app/page.tsx` | auth | redirect → `/login` |
| `/login` | `app/login/page.tsx` | auth | `lib/auth`, branding |
| `/auth/signout` | `app/auth/signout/route.ts` | auth | session |
| `/termos`, `/privacidade` | `app/termos`, `app/privacidade` | shared legal | — |
| `/demo-fluxo` | `app/demo-fluxo` | shared demo | `demo-fluxo/actions` |

### 5.2 PDV — vendas / caixa

| Rota | Arquivo | Domínio | Actions / impl |
|------|---------|---------|----------------|
| `/caixa` | `app/caixa/page.tsx` | sales + cash | `app/caixa/actions.ts` + `app/caixa/server/*.impl.ts` |

Busca de cliente no PDV: `buscarClientesCaixa` → `caixaClientesSearch.impl.ts` (**não** usa `gerente/clientes`).

### 5.3 Admin V2 (UI canônica)

Layout: `app/admin/layout.tsx` → `AdminV2Shell`.

| Rota | Domínio superfície | Page | Actions / client (hoje) |
|------|-------------------|------|-------------------------|
| `/admin` | shell | redirect dashboard | — |
| `/admin/dashboard` | shell / KPI | `admin/dashboard` | `gerente/dashboard-actions` (indireto) |
| `/admin/catalogo` | products | `admin/catalogo` | `gerente/produtos/actions` + clients |
| `/admin/catalogo/novo` | products | redirect/query | idem |
| `/admin/categorias-produtos` | products (taxonomia) | `admin/categorias-produtos` | `gerente/categorias-produtos` |
| `/admin/clientes` | clientes | `admin/clientes` | `gerente/clientes/*` |
| `/admin/fornecedores` | fornecedores | `admin/fornecedores` | `gerente/fornecedores/*` |
| `/admin/estoque` | inventory | `admin/estoque` | `gerente/estoque` + `admin/estoque/actions` (kardex) |
| `/admin/estoque/recebimento` | inventory | … | `gerente/recebimento` |
| `/admin/estoque/transferencias` | inventory | … | `gerente/transferencias` |
| `/admin/estoque/imprimir-etiquetas` | inventory | … | `gerente/estoque/imprimir-etiquetas` |
| `/admin/estoque/importar-nfe` | inventory (+ products) | … | `gerente/estoque/importar-nfe` |
| `/admin/vendas` | sales | `admin/vendas` | `gerente/vendas` + `admin/vendas/actions` |
| `/admin/financeiro` | financeiro / cash | `admin/financeiro` | `gerente/financeiro` + `admin/financeiro/actions` |
| `/admin/financeiro/contas-pagar` | financeiro | … | `gerente/financeiro/contas-pagar` |
| `/admin/financeiro/documento/[id]` | financeiro / fiscal | … | fiscal via financeiro |
| `/admin/categorias-financeiras` | financeiro (taxonomia) | … | `gerente/categorias-financeiras` |
| `/admin/compras` | compras | `admin/compras` | `gerente/compras` |
| `/admin/comissoes` | comissoes | `admin/comissoes` | `gerente/comissoes` |
| `/admin/relatorios` | relatorios | `admin/relatorios` | `gerente/relatorios/*` |
| `/admin/auditoria` | auditoria | `admin/auditoria` | `admin/auditoria/actions` |
| `/admin/configuracoes` | config | `admin/configuracoes` | `gerente/configuracoes` |
| `/admin/suspensao` | config | `admin/suspensao` | `gerente/suspensao` |
| `/admin/diagnostico-caixa` | ops / cash | `admin/diagnostico-caixa` | `admin/diagnostico-caixa/actions` |

### 5.4 Legacy gerente (redirects)

| Rota | Comportamento |
|------|---------------|
| `/gerente` | → `/admin/dashboard` |
| `/gerente/[...path]` | `legacyGerenteRedirect` (`@shared-core/navigation/routes`) |
| `/gerente/estoque/imprimir-etiquetas` | redirect preservando query |
| `/gerente/financeiro/contas-pagar` | redirect preservando query |

Mapa completo de slugs: `LEGACY_GERENTE_REDIRECTS` em `shared-core/navigation/routes.ts`.

Layout `app/gerente/layout.tsx` ainda existe para páginas remanescentes; **não** há `page.tsx` de CRUD sob gerente (só redirect + clients importados pelo admin).

### 5.5 API routes (borda)

| Path | Domínio |
|------|---------|
| `/api/health` | shared |
| `/api/caixa/scan-telemetry` | sales / ops |
| `/api/gerente/health`, `atividades/*`, `notificacoes/count` | shell legado |
| `/api/gerente/fila/status` | financeiro / fiscal |

---

## 6. Inventário de actions (Server Actions)

### 6.1 Por dono de superfície

| Path | Domínio | Papel |
|------|---------|-------|
| `app/caixa/actions.ts` (+ `server/*.impl.ts`) | sales + cash | PDV: venda, turno, movs, relâmpago, busca cliente |
| `app/caixa/idioma/actions.ts` | config / i18n | Locale operador |
| `app/admin/estoque/actions.ts` | inventory | Kardex read; list/ajuste via gerente |
| `app/admin/vendas/actions.ts` | sales | Detalhe venda; list via gerente |
| `app/admin/financeiro/actions.ts` | financeiro | Wrapper admin; tipos do gerente |
| `app/admin/auditoria/actions.ts` | auditoria | Leituras próprias |
| `app/admin/diagnostico-caixa/actions.ts` | ops / cash | Checklist pré-prod |
| `app/gerente/produtos/actions.ts` (+ precos/sugestão) | products | CRUD catálogo (SSoT UI `/admin/catalogo`) |
| `app/gerente/categorias-produtos/actions.ts` | products | Taxonomia |
| `app/gerente/marcas-produtos/actions.ts` | products | Taxonomia |
| `app/gerente/clientes/actions.ts` | clientes | CRUD + paginação |
| `app/gerente/fornecedores/actions.ts` | fornecedores | CRUD |
| `app/gerente/estoque/actions.ts` | inventory | Ajuste / listagens |
| `app/gerente/estoque/importar-nfe/actions.ts` | inventory | Import NF-e |
| `app/gerente/estoque/imprimir-etiquetas/actions.ts` | inventory | Etiquetas |
| `app/gerente/recebimento/actions.ts` | inventory / compras | Recebimento |
| `app/gerente/transferencias/actions.ts` | inventory | Transferências |
| `app/gerente/vendas/actions.ts` | sales | Listagem / cancel paths UI |
| `app/gerente/financeiro/actions.ts` | financeiro | Contas / fiscal |
| `app/gerente/financeiro/contas-pagar/actions.ts` | financeiro | Contas a pagar |
| `app/gerente/categorias-financeiras/actions.ts` | financeiro | Taxonomia |
| `app/gerente/compras/actions.ts` | compras | Compras |
| `app/gerente/comissoes/actions.ts` | comissoes | Comissões |
| `app/gerente/relatorios/**/actions.ts` | relatorios | Agregações |
| `app/gerente/configuracoes/actions.ts` | config | Config loja |
| `app/gerente/suspensao/actions.ts` | config | Licença |
| `app/gerente/idioma/actions.ts` | config / i18n | Idioma admin |
| `app/gerente/actions.ts`, `dashboard-actions.ts` | shell | Dashboard / helpers |
| `app/demo-fluxo/actions.ts` | demo | Demo |

### 6.2 Acoplamento admin → gerente

Dezenas de arquivos em `app/admin/**` importam `@/app/gerente/**` (actions e clients). Padrão sistêmico — qualquer migração deve **primeiro** quebrar esse hábito por domínio (colocar actions sob rota canônica ou `domains/<nome>/` futuro), não big-bang.

---

## 7. Componentes e dependências cruzadas

### 7.1 Shared (permanecem centrais)

- `components/ui/**`, `components/ui/admin-v2/**`
- `components/auth`, `branding`, `legal`, `security`, `theme`, `forms`, `charts`
- `lib/admin` (policy, session), `lib/supabase`, `lib/errors`, `lib/format`
- `@shared-core` (routes, pricing, cart, scan)

### 7.2 Hotspots de acoplamento (risco)

| Hotspot | Domínios tocados | Severidade |
|---------|------------------|------------|
| `app/caixa/**` + `stores/*` + scan-pipeline | sales, cash, products, inventory (via RPC) | **Crítica** |
| `admin/financeiro` → clientes + fornecedores + contas-pagar | financeiro, clientes, fornecedores | **Alta** |
| `components/gerente/produtos/form/**` | products, fornecedores, inventory (estoque inicial) | **Alta** |
| `admin/estoque` → filtros produtos | inventory, products | Média |
| `admin/catalogo` → produtos actions + modais | products (+ fornecedor inline legado) | **Alta** |
| Relatórios estoque/vendas | relatorios → inventory/sales | Média |
| PDV relâmpago → schema produto | sales → products | Média (orquestrador RPC) |

### 7.3 Ranking de isolamento (migração)

| Tier | Superfícies | Comentário |
|------|-------------|------------|
| A — isolado | comissoes, suspensao, auditoria, demo, auth/legal | Poucos inbound |
| B — baixo | **clientes**, categorias-financeiras, marcas, idioma | CRUD/taxonomia limitados |
| C — médio | fornecedores, compras, categorias-produtos, config, etiquetas/NF-e | 2–3 consumidores |
| D — alto | relatorios, vendas admin, estoque, dashboard | Agregam |
| E — crítico | catalogo/products, financeiro, caixa | Orquestração + shared-core |

---

## 8. Regras de import frontend (normativas)

Aplicáveis a **código novo** e a **PRs de migração**. Legado existente não é reescrito neste inventário.

### R-F1 — Direção da dependência

```
app (rota/UI/action)  →  shared-core (domínio puro)
app                    →  shared UI local (components/ui, lib/admin, …)
domínio A (puro)   ✗→  domínio B UI
domínio puro       ✗→  app/
shared-core        ✗→  pdv-importados/app, pdv-local UI
```

### R-F2 — App chama domínio via contrato

- Regras de preço, carrinho, scan, invariantes: **somente** `@shared-core/*` (não duplicar em `app/`).
- Server Actions são **borda**: auth, I/O Supabase, mapeamento DTO → UI.
- Policies de domínio novas → `shared-core` (após scaffold); action só orquestra.

### R-F3 — Sem “god import” de UI entre domínios

- Domínio A **não** importa componentes de tela de B.
- Leitura cross-domínio (ex.: financeiro precisa de lista de clientes):
  - **permitido:** action/port de leitura do dono (`clientes`) ou contrato em shared-core;
  - **proibido:** importar `ClienteEditarModal` / form completo de outro domínio.

### R-F4 — Entity-ssot permanece nas rotas

| Entidade | Rota oficial | Não criar CRUD em |
|----------|--------------|-------------------|
| Produto | `/admin/catalogo` | PDV (exceto relâmpago mínimo), financeiro |
| Cliente | `/admin/clientes` | PDV cadastro completo |
| Fornecedor | `/admin/fornecedores` | financeiro / produto (evitar novo combobox CRUD) |
| Estoque manual | `/admin/estoque` | form de produto pós-criação |
| Venda | `/caixa` (criar); `/admin/vendas` (cancel) | — |

### R-F5 — Pasta `gerente/` é legado de localização

- Rotas `/gerente/*` = redirect only.
- Actions/clients sob `app/gerente/*` = **data layer transitória** até colocation sob `app/admin/<domínio>` (ou extrato de domínio).
- Código **novo** de feature admin: preferir `app/admin/<domínio>/` (actions + `_components`), não expandir `gerente/`.

### R-F6 — Orquestradores ficam no RPC / adapter

Alinhado ao inventário 5.1a: `finalizar_venda_*`, `cancelar_venda_*`, `devolver_ou_trocar_venda`, `criar_produto_com_estoque_inicial`.

UI **não** reimplementa a política multi-tabela; só chama o orquestrador.

### R-F7 — i18n / formatting

- Domínios comerciais **não** conhecem idioma (ADR-005 §6).
- Bridge legado `pt`/`zh` permanece na borda até Missão 5.2.

### R-F8 — Guards

| Guard | Escopo |
|-------|--------|
| `npm run guard:domain` | Paths proibidos + imports shared-core (5.1a) |
| `npm run check:entity-ssot` | Fronteira CRUD de entidades |
| *(futuro)* lint frontend domain | Admin↔gerente / UI cruzada — **não** neste PR |

---

## 9. Fronteira app → domínio → shared-core (checklist operacional)

| Camada | Pode conter | Não pode conter |
|--------|-------------|-----------------|
| **app/** | Pages, layouts, Server Actions, adapters Supabase, UI de domínio | Regras de preço/carrinho/scan duplicadas; segundo núcleo |
| **Domínio (shared-core)** | Tipos, ports, policies, cálculos, eventos conceituais | JSX, Next cookies, `createClient` de app |
| **Shared UI app** | Primitivos, shell admin, auth buttons | Lógica de writer de tabela |

**Seta permitida:** `app` → `shared-core` → (nada de app).  
**Seta proibida:** `shared-core` → `app`, UI(A) → UI(B).

---

## 10. Recomendação — primeiro módulo de migração

### Escolha: **clientes**

| Critério | Avaliação |
|----------|-----------|
| Entity-ssot | UI oficial `/admin/clientes` |
| Superfície | 1 actions (`gerente/clientes/actions.ts`), 2 clients (`ClientesListClient`, `ClienteEditarModal`) |
| Inbound | `admin/clientes` (CRUD); `admin/financeiro` só `buscarClientesPaginadosAction` (leitura) |
| Caixa | Busca própria (`buscarClientesCaixa`) — **não** acopla ao gerente/clientes |
| Writers ADR-005 | Fora do núcleo sales/cash/inventory/products — risco de regressão comercial **baixo** |
| Valor como template | Valida colocation admin + port de leitura para financeiro sem tocar orquestradores |

### Alternativas (não primeiro)

| Módulo | Motivo de adiar |
|--------|-----------------|
| comissoes | Ainda mais isolado, mas menos útil como template de port |
| fornecedores | Semelhante a clientes, porém `FornecedorCombobox` no form produto (dívida entity-ssot) |
| products / estoque / financeiro / caixa | Tier E — após shared-core scaffold + padrões validados |

### Sequência sugerida (implementação futura — fora deste PR)

1. Colocar actions/types de clientes sob rota canônica (ou extrato de domínio app).
2. Expor port/read usado pelo financeiro (sem importar modal/UI de clientes).
3. Smoke: `/admin/clientes` CRUD + receber títulos no financeiro + busca PDV.
4. Remover imports `@/app/gerente/clientes` do admin.
5. Só então considerar próximo módulo (fornecedores ou taxonomias).

---

## 11. GO / NO-GO

| Critério | Status |
|----------|--------|
| 5.1a em main (`d0487340`) | OK |
| ADR-005 path único shared-core | OK |
| Inventário writers (DB) disponível | OK |
| Inventário frontend (este doc) | OK |
| Entity-ssot e dual-layer documentados | OK |
| Regras de import frontend definidas | OK |
| 1º módulo de migração escolhido com critérios | OK — **clientes** |
| Scaffold shared-core / moves de código | **Não** neste entregável |
| Mudança de comportamento / RPC | **Proibida** nesta fase |

### Veredito

| Decisão | Resultado |
|---------|-----------|
| **GO** para implementação futura da fronteira frontend | **GO** — com restrições abaixo |
| **NO-GO** para big-bang / mover caixa·financeiro·catálogo agora | **NO-GO** |
| **NO-GO** para alterar RPC, regras de negócio ou UI neste passo | **NO-GO** |

**Próximo passo de implementação (quando autorizado):**

1. Scaffold mínimo ADR-005 sob `@fastproduct/shared-core/src/{sales,inventory,cash,products,…}` **sem** mover comportamento; **ou**
2. Spike de migração **clientes** (colocation + port de leitura) em PR isolado.

Recomendação de ordem: **scaffold shared-core (fundação ADR) → spike clientes (prova frontend)** — ambos sem mudança de regra.

---

## 12. Lacunas conscientes (não corrigir aqui)

| Item | Nota |
|------|------|
| `pdv-local` superfície | Fora do escopo (piloto web) |
| Contagem completa de imports cruzados | Amostra + hotspots; lint futuro |
| Expandir writers kardex | Já lacuna no inventário 5.1a |
| Remover pasta `gerente/` | Só após migração domínio a domínio |
| FornecedorCombobox inline | Dívida entity-ssot — não replicar |

---

## Sign-off

| Papel | Entrega | Data |
|-------|---------|------|
| Eng | Inventário frontend + regras de import + recomendação **clientes** + GO restrito | 2026-07-18 |

**Referências:** ADR-005 · inventário 5.1a · entity-ssot · `scripts/domain-boundary-guard.mjs` · `shared-core/navigation/routes.ts`.
