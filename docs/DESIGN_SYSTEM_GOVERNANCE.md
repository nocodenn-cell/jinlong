# Governança do Design System — Jīn Lóng ERP

| Campo | Valor |
|--------|--------|
| **Data** | 2026-08-07 (inclui Interaction Design System) |
| **Status** | Vigente a partir da aceitação da Sprint 0 |
| **Escopo** | `pdv-importados` (piloto web); `pdv-local` só brand tokens opcional |
| **Irmãos** | [`DESIGN_SYSTEM_GAPS.md`](./DESIGN_SYSTEM_GAPS.md) · [`INTERACTION_DESIGN_SYSTEM.md`](./INTERACTION_DESIGN_SYSTEM.md) · [`ROADMAP_UI_UX.md`](./ROADMAP_UI_UX.md) · [`UI_UX_BACKLOG.md`](./UI_UX_BACKLOG.md) |
| **Objetivo** | Impedir retorno da heterogeneidade de **componentes** e de **comportamento** |

---

## 1. Princípios

1. **Um paradigma por família de componente** — Button, tabela, FilterBar, modal/confirm, toast painel, empty, paginação.
2. **Um paradigma por padrão de interação** — CRUD, busca, filtro, confirm, validação, etc. (ver IDS).
3. **Componentes e padrões de interação são ativos arquiteturais** — mesma rigidez de ADR/shared-core para superfície.
4. **Aplicar ≠ inventar** — sprints pós-S0 só consomem SSOT + contratos IX-*; não criam shells/tabelas/filtros/fluxos paralelos.
5. **Exceção é explícita, temporária e medida** — sem exceção silenciosa em PR.
6. **Burndown não sobe** — hits de legado em arquivos novos = bloqueio.
7. **Entity-SSoT e arquitetura intactos** — DS não move regra de negócio nem CRUD fora das telas oficiais.
8. **Nenhum PR cria novo padrão de interação sem atualizar** [`INTERACTION_DESIGN_SYSTEM.md`](./INTERACTION_DESIGN_SYSTEM.md).

---

## 2. Checklist obrigatório de Pull Request (UI)

Todo PR que toque `app/**/*.tsx`, `components/**/*.tsx` ou `styles/**` deve marcar:

### 2.1 Antes do review

- [ ] Verifiquei no código o estado atual (não só a auditoria).
- [ ] Reutilizei SSOT de [`DESIGN_SYSTEM_GAPS.md`](./DESIGN_SYSTEM_GAPS.md) § matriz SSOT.
- [ ] Comportamento segue [`INTERACTION_DESIGN_SYSTEM.md`](./INTERACTION_DESIGN_SYSTEM.md) (IX-CRUD, IX-FILTER, IX-CONFIRM, IX-FORM, IX-SUCCESS, etc.).
- [ ] Não introduzi segundo **Button** (só `@/components/ui/button` / `PageActions`).
- [ ] Não introduzi segunda **tabela** (só `DataTable` / `EntityTable` — proibido `GerenteTable` / raw table genérica nova).
- [ ] Não introduzi segundo **modal** genérico (só `DragonModal`).
- [ ] Não introduzi segundo **confirm** (só `ConfirmDialog` — proibido `window.confirm` / `globalThis.confirm` / novo ConfirmActionButton nativo).
- [ ] Não introduzi segundo **toast** painel (só `emitToast` / viewport admin; PDV = EXC-02).
- [ ] Não introduzi segundo **lookup** (só `EntityLookup` async — proibido `<select>` massivo / autocomplete paralelo).
- [ ] Não introduzi segundo **sheet** (só `DetailSheet` — proibido novo `fixed inset-0` role=dialog para detalhe).
- [ ] Não introduzi segundo **padrão de formulário** (só `FormSection` + `Field` + `forms/*`).
- [ ] Não introduzi segundo **padrão de interação** sem update do IDS (filtro, bulk, export, wizard, empty, etc.).
- [ ] Não usei `GerenteTable`, `DataTablePage`, `CadastroPageShell`, `.app-btn-*`, `dragon-glass-*` em código **novo**.
- [ ] Não adicionei `text-[Npx]` arbitrário nem hex em `className` (exceto brand auth já existente).
- [ ] Empty/erro usam `EmptyState` / `ErrorState` (sem emoji como empty state).
- [ ] Listagens admin usam `PageShell` + (`CrudListShell` \| slots equivalentes) quando PageShell existir (pós-S0).
- [ ] Filtros de listagem usam `FilterBar` (não pills/date locais novos).
- [ ] Bulk usa `BulkActionBar`; export usa `ExportAction`.
- [ ] i18n de superfície: sem hardcode PT em strings de UI novas (exceto demo/interno documentado).
- [ ] A11y: rótulo em ação por ícone; foco/Esc em modal/sheet/confirm; `aria-*` em combobox/tabela.

### 2.2 Se o PR cria componente em `components/ui/**` **ou** novo padrão de interação

- [ ] Justificativa no corpo do PR: por que nenhum SSOT/IX existente cobre o caso.
- [ ] Nome, props e exemplo de uso documentados (JSDoc ou story) — se componente.
- [ ] Atualização de [`INTERACTION_DESIGN_SYSTEM.md`](./INTERACTION_DESIGN_SYSTEM.md) (novo IX-* ou alteração de regra) **no mesmo PR**.
- [ ] Atualização da matriz SSOT em `DESIGN_SYSTEM_GAPS.md` se houver primitivo novo.
- [ ] Teste behavior/unit mínimo (componente ou contrato crítico).
- [ ] Aprovação de **DS owner** (ver §6).

**Sem atualização do IDS, o PR que altera comportamento de interação é rejeitado.**

### 2.3 Se o PR pede exceção ao DS / IDS

- [ ] Issue/ADR curto ou seção no PR: motivo, escopo, prazo de remoção.
- [ ] Exceção listada em `DESIGN_SYSTEM_GAPS.md` § Exceções aprovadas.
- [ ] Não é “porque era mais rápido”.

### 2.4 Verificações automatizadas

- [ ] `npm run check:ds-burndown` (ou script equivalente) — hits legado **não sobem**.
- [ ] Lint/typecheck/testes do pacote tocado verdes.
- [ ] Sem `--no-verify`.
- [ ] (Pós UX-S0-26) lint bloqueia: `window.confirm`, empty emoji em listas novas, `fixed inset-0` dialog fora de DragonModal/DetailSheet/ConfirmDialog.

### 2.5 Gate Sprint 1

Nenhum PR de aplicação de tela (Sprint 1+) pode mergear enquanto a matriz de prontidão S0 em [`ROADMAP_UI_UX.md`](./ROADMAP_UI_UX.md) estiver **REPROVADA**.

---

## 3. Regras para criação de novos componentes e padrões de interação

| Situação | Ação |
|----------|------|
| Precisa de UI/comportamento que **já existe** no SSOT/IDS | **Reutilizar** — proibido wrap cosmético ou fluxo paralelo |
| Precisa de variação visual pequena | Extender props/variants do SSOT (`tone`, `size`, `density`) |
| Precisa de composição de domínio (ex.: toolbar de lote do catálogo) | Componente de **domínio** usando BulkActionBar/SSOT por baixo |
| Precisa de primitivo ou IX-* novo | Só na Sprint 0 ou PR dedicado de DS com §2.2 **e** update do IDS |
| “Só desta tela” com `fixed inset-0` / `window.confirm` / select 500 | **Rejeitar** |

**Onde colocar**

| Tipo | Path |
|------|------|
| Primitivo SSOT | `pdv-importados/components/ui/**` ou `components/ui/admin-v2/**` |
| Form control | `components/ui/forms/**` |
| Feedback | `components/ui/feedback/**` |
| Domínio (não SSOT) | `app/<rota>/_components/**` ou `components/<domínio>/**` |
| Legado gerente | **Não expandir**; só migrar/remover |

---

## 4. Quando reutilizar vs. quando compor

1. **Reutilizar puro** — Button, Field, Input, Select, Autocomplete, DataTable/EntityTable, FilterBar, PaginationBar, EmptyState, MetricCard, SectionCard, StatusChip/badges tipados, MoneyText, KeyHint, ConfirmDialog, DragonModal, PageShell, CrudListShell, TabNav, Stepper, InlineAlert, FileDropzone, FormSection, DetailSheet, BulkActionBar, ExportAction.
2. **Compor fluxos** — seguir tabelas de fluxo em `INTERACTION_DESIGN_SYSTEM.md` §2 (ex.: Import CSV = FileDropzone + preview EntityTable + ConfirmDialog + toast).
3. **Domínio fino** — labels i18n, column maps, adapters de EntityLookup. Não reimplementar tabela/filtro/confirm/sheet.

---

## 5. Quando uma exceção ao DS é aceitável

Exceção **só** se **todas** forem verdadeiras:

1. Cobertura SSOT documentada como insuficiente **e** não dá para extender o primitivo em &lt; M esforço sem atrapalhar outros módulos.
2. Caso é **operacionalmente distinto** (ex.: PDV teclado-first; canal toast PDV ≠ painel — ver `VISUAL_TRANSACTION_STATES.md`).
3. Há **dono + prazo** para absorver ou formalizar no SSOT (máx. 2 sprints, senão vira item de backlog DS).
4. Registrada em § Exceções aprovadas de `DESIGN_SYSTEM_GAPS.md`.

**Nunca exceção:** “cliente legado”, “não quero migrar”, “copiei do Gerente”, dark-glass em rota `/admin`.

---

## 6. Papéis

| Papel | Responsabilidade |
|-------|------------------|
| **DS owner** | Aprovar primitivos **e** IX-* novos; exceções; matriz SSOT + IDS |
| **Autor do PR** | Checklist §2; burndown; IDS atualizado se comportamento mudar |
| **Reviewer** | Recusar segundo paradigma de componente **ou** interação; exigir PageShell/IDS |
| **Sponsor freeze** | Unificação total de tokens / redesign amplo |

---

## 7. Como medir aderência ao longo do tempo

### 7.1 Frequência

- **Fim de cada sprint** — preencher tabela em [`ROADMAP_UI_UX.md`](./ROADMAP_UI_UX.md) § Métricas.
- **Cada PR UI** — burndown não sobe.
- **Release piloto** — meta aderência ≥ 85%.

### 7.2 Fórmula de aderência (%)

```
score = 0.20 * (páginasAdminComPageShell / páginasAdminOperacionais)
      + 0.20 * (listasComDataTableOuEntityTable / listasAdmin)
      + 0.15 * (overlaysDragonOuConfirmOuSheet / overlaysTotais)
      + 0.15 * (arquivosButtonSsot / (buttonSsot + appBtn + adminV2Btn))
      + 0.15 * (emptyStateSsot / (emptyStateSsot + emptyLocal))
      + 0.15 * (filtrosFilterBar / listagensComFiltro)
```

### 7.3 Sinais de regressão (parar e abrir item S0-hotfix)

- Novo import de `GerenteTable` / `DataTablePage` / `.app-btn-*`.
- Novo `fixed inset-0` role=dialog fora de DragonModal/DetailSheet.
- Novo `window.confirm` / `<select>` com lista longa / filtro sem UI.
- Aderência cai &gt; 3 pp entre sprints.
- PR cria componente em `components/ui` ou novo fluxo de interação sem §2.2 / sem update do IDS.
- Duas telas do mesmo padrão (ex.: confirm) com comportamentos diferentes em código **novo**.

### 7.4 Artefatos

| Artefato | Uso |
|----------|-----|
| `pdv-importados/reports/ds-legacy-burndown.json` | Baseline legado |
| `DESIGN_SYSTEM_GAPS.md` | SSOT + cobertura + exceções |
| `ROADMAP_UI_UX.md` § Métricas | Série temporal |
| Este arquivo | Processo PR / exceção |

---

## 8. Relação com freeze e entity-SSoT

- Sprint 0 e aplicação de SSOT = **IN** no freeze (consistência estrutural).
- Unificação total de tokens / multi-tema = **OUT** sem sponsor.
- Não criar CRUD de produto/cliente/fornecedor fora das telas oficiais (`.cursor/rules/entity-ssot.mdc`).
- Pasta `app/gerente/*` permanece como biblioteca de actions até migração; **não** é desculpa para UI nova no visual Gerente.

---

## 9. Entrada em vigor

1. Sprint 0 aceita (critérios em `ROADMAP_UI_UX.md`).
2. Este documento linkado no template de PR (ou checklist da sprint UX).
3. Qualquer PR pós-S0 que viole §2 pode ser rejeitado sem discussão de “preferência visual”.
