# Design System Gaps — Jīn Lóng ERP

| Campo | Valor |
|--------|--------|
| **Data** | 2026-08-07 (cobertura + SSOT definitivo Sprint 0) |
| **App** | `pdv-importados` |
| **Governança** | [`DESIGN_SYSTEM_GOVERNANCE.md`](./DESIGN_SYSTEM_GOVERNANCE.md) |
| **Roadmap / Backlog** | [`ROADMAP_UI_UX.md`](./ROADMAP_UI_UX.md) · [`UI_UX_BACKLOG.md`](./UI_UX_BACKLOG.md) |
| **Burndown** | `pdv-importados/reports/ds-legacy-burndown.json` |

**Sem implementação de tela nesta revisão.** Objetivo: Sprint 0 suficiente para que S1+ só **aplique** padrão único.

---

## 0. Causa raiz (confirmada)

| Camada | Veredito |
|--------|----------|
| Sintoma dominante | Heterogeneidade visual (Admin V2 vs clients Gerente embutidos em `/admin`) |
| Causa raiz | Migração incompleta + dual-track de primitivos sem kill-switch |
| Implicação | Consolidar SSOT na **Sprint 0** antes de redesenhar telas |

---

## 1. Matriz SSOT — famílias oficiais

| Família | SSOT (oficial) | Eliminar / não expandir |
|---------|----------------|-------------------------|
| Layout admin | `AdminV2Shell` | `GerenteLayoutShell` (quando redirect-only) |
| Página | **`PageShell`** (S0) + `PageHeader` | `CadastroPageShell`, H1+`max-w-*` locais novos |
| Lista CRUD | `CrudListShell` | `DataTablePage` |
| Filtro | `FilterBar` (+ `daterange` S0) | `GerenteFilterBar`; filtros só-URL |
| Tabela | `DataTable` → **`EntityTable`** (S0) | `GerenteTable`, `TabelaCadastroPadrao` |
| Form | `forms/*` + `Field` + **`FormSection`** (S0) | FormField morto; labels soltos novos |
| Tabs | **`TabNav`** (S0) | TabNav locais sem contrato |
| Stepper | **`Stepper`** (S0) | Wizards ad hoc novos |
| Overlay | `DragonModal` | `fixed inset-0` ad hoc novos |
| Detalhe lateral | **`DetailSheet`** (S0) | Sheets inventados por tela |
| Confirm | **`ConfirmDialog`** (S0) | `window.confirm` |
| Alert inline | **`InlineAlert`** (S0) | Banners amber/emoji soltos |
| Upload | **`FileDropzone`** (S0) | Dropzones locais novos |
| Toast painel | `emitToast` + viewport admin | nome Gerente* (alias S0) |
| Toast PDV | `CaixaToastViewport` | — (exceção aprovada) |
| Empty / erro | `feedback/EmptyState`, `ErrorState` | empty local / emoji |
| Badge | `StatusChip` + `badges.tsx` tipados | `GerenteStatusBadge`; `admin-v2-badge-*` solto |
| Card / KPI | `SectionCard`, `MetricCard`, `ChartCard` | `card.tsx` shadcn; `dragon-glass` novo |
| Paginação | `PaginationBar` (+ modo infinite documentado) | paginação manual nova |
| Botão | `Button` + `PageActions` | `.app-btn-*`, `.admin-v2-btn-*` novos |
| Money / tecla | **`MoneyText`**, **`KeyHint`** (S0) | format inline inconsistente |
| Ícone | `lucide-react` + brand | icon-wrapper genérico |

**Regra:** não criar segundo Button, DataTable, FilterBar, Toast painel ou Modal genérico.

---

## 2. Auditoria de cobertura por módulo

Legenda: **OK** = S0 cobrirá · **GAP** = primitivo a incluir na S0 · **EXC** = exceção aprovada ao DS.

### 2.1 Matriz resumo

| Módulo | S0 suficiente? | Componente adicional (S0) | Exceção DS? |
|--------|----------------|---------------------------|-------------|
| **PDV** | Parcial → OK com KeyHint + Confirm | KeyHint; ConfirmDialog (PDV pode wrap) | **EXC** layout PDV + toast/banner bip |
| **Vendas** | Quase | DetailSheet; FilterBar (já); EmptyState | Não |
| **Estoque** | Quase | Autocomplete (existe); FileDropzone; Stepper (NF-e); DetailSheet (kardex) | Etiquetas 2-col domínio OK |
| **Compras** | Sim após EntityTable + PageShell | EntityTable; PageShell; ConfirmDialog | Não |
| **Financeiro** | Não sem TabNav | **TabNav**; EntityTable; PageShell; InlineAlert | Infinite scroll AP = modo footer |
| **Fiscal** | Não sem DetailSheet + InlineAlert | DetailSheet; InlineAlert; StatusChip | Timeline eventos = domínio fino |
| **Cadastros** | Quase | FormSection; PageShell; CrudListShell; ConfirmDialog | FornecedorCombobox = dívida entity (não expandir) |
| **Relatórios** | Quase | FilterBar daterange; TabNav (seções); EmptyState | Charts = ChartCard (já) |
| **Configurações** | Não sem FormSection + TabNav | FormSection; TabNav; InlineAlert | Não |
| **Administração** | Não sem Stepper + InlineAlert | Stepper; InlineAlert; PageShell; ConfirmDialog | Diagnóstico interno: densidade maior OK |

### 2.2 Detalhe por módulo

#### PDV (`/caixa`)

| Pergunta | Resposta |
|----------|----------|
| Suficiente? | **Sim**, se S0 entregar KeyHint + ConfirmDialog e PDV continuar shell próprio. |
| Adicional | KeyHint (extrair); opcional MoneyText nos totais. |
| Exceção | **Layout PDV** (grid busca/carrinho/rail), **CaixaToastViewport**, **CaixaMessageBanner** (contrato bip) — não forçar AdminV2Shell. |

#### Vendas

| Suficiente? | **Sim** com PageShell + FilterBar + EntityTable/DataTable + DetailSheet + EmptyState + PaginationBar + MetricCard. |
| Adicional | **DetailSheet** (hoje `VendaDetailSheet` ad hoc). |
| Exceção | Nenhuma. |

#### Estoque (+ recebimento, transferências, NF-e, etiquetas)

| Suficiente? | **Sim** com PageShell, CrudListShell, FilterBar, DataTable, Autocomplete, DragonModal, **FileDropzone**, **Stepper** (NF-e), DetailSheet (kardex), PageActions. |
| Adicional | FileDropzone, Stepper, DetailSheet. |
| Exceção | Layout 2 colunas etiquetas = composição domínio sobre PageShell; não nova tabela. |

#### Compras

| Suficiente? | **Sim** após migrar para PageShell + EntityTable + FilterBar + MetricCard + DragonModal. |
| Adicional | Nenhum além do SSOT S0. |
| Exceção | Nenhuma — dark/glass **proibido**. |

#### Financeiro (AR/AP hub)

| Suficiente? | **Não** sem TabNav SSOT. |
| Adicional | **TabNav** (substitui `FinanceiroTabNav` local); EntityTable na aba pagar; InlineAlert (stubs). |
| Exceção | Infinite scroll em AP = `PaginationBar` modo `infinite` ou footer CrudListShell documentado — **não** terceira tabela. |

#### Fiscal (aba + `/documento/[id]`)

| Suficiente? | **Sim** com PageShell, DetailSheet, StatusChip/badges, ConfirmDialog, InlineAlert. |
| Adicional | DetailSheet; InlineAlert. Timeline de eventos = lista domínio com tokens SSOT (não primitivo novo obrigatório). |
| Exceção | Nenhuma para chrome; copy de migration some na aplicação (S2). |

#### Cadastros (clientes, fornecedores, produtos, funcionários, taxonomias)

| Suficiente? | **Sim** com PageShell, CrudListShell, FilterBar/SearchInput, EntityTable/DataTable, FormSection, Field, DragonModal, ConfirmDialog. |
| Adicional | **FormSection** (promover padrão ProdutoForm). |
| Exceção | `FornecedorCombobox` legado — não expandir; infinite scroll clientes/fornecedores = modo footer. |

#### Relatórios

| Suficiente? | **Sim** com PageShell, FilterBar daterange, ChartCard, MetricCard, SectionCard, TabNav (opcional seções), EmptyState. |
| Adicional | daterange; TabNav se segmentar Vendas/Margem/Estoque. |
| Exceção | Mini-tabelas raw em cards de relatório — permitidas se padding/empty alinhados (não GerenteTable). |

#### Configurações

| Suficiente? | **Sim** com PageShell, TabNav, FormSection, Field, Button, InlineAlert. |
| Adicional | FormSection; TabNav; InlineAlert. |
| Exceção | Nenhuma. |

#### Administração (funcionários UI já em cadastros; provisionamento, implantação, suspensão, diagnóstico, auditoria)

| Suficiente? | **Sim** com PageShell, Stepper (provisionamento), InlineAlert (gates/suspensão), ConfirmDialog, FilterBar (auditoria/comissões), DetailSheet (auditoria), EntityTable. |
| Adicional | Stepper; InlineAlert; ConfirmDialog. |
| Exceção | Diagnóstico caixa / demo-fluxo: utilitário interno — visual Admin V2 tokens, densidade pode ser maior. |

---

## 3. Gaps que a Sprint 0 ainda precisa incluir

Além dos itens já listados (PageShell, ConfirmDialog, FilterBar daterange, EntityTable, MoneyText, KeyHint, emitToast, lint, órfãos, contrato Sheet), a cobertura exige:

| ID | Primitivo | Por que sem ele S1+ inventa padrão |
|----|-----------|-------------------------------------|
| **UX-S0-13** | **TabNav** | Financeiro, Config, Relatórios, Provisionamento pills |
| **UX-S0-14** | **Stepper** | NF-e, provisionamento (e evita wizard ad hoc) |
| **UX-S0-15** | **DetailSheet** | Vendas, Auditoria, Fiscal, Kardex — formaliza S0-12 |
| **UX-S0-16** | **InlineAlert** | Suspensão, stub fiscal, gates implantação, erros de página |
| **UX-S0-17** | **FormSection** | Produto, Config, Funcionários — um ritmo de form |
| **UX-S0-18** | **FileDropzone** | NF-e + import CSV — um dropzone |

Sem esses seis, as sprints de tela **criariam** paradigmas novos — violando o objetivo desta missão.

---

## 4. Exceções aprovadas (baseline)

| ID | Exceção | Motivo | Prazo |
|----|---------|--------|-------|
| EXC-01 | Shell PDV próprio (não AdminV2Shell) | Operação teclado-first / balcão | Permanente (revisar só se unificar brand) |
| EXC-02 | `CaixaToastViewport` + `CaixaMessageBanner` | Contrato bip ≠ toast painel (`VISUAL_TRANSACTION_STATES`) | Permanente |
| EXC-03 | Auth `login-premium-*` / AuthShell | Superfície ceremonial | Permanente até unificar tokens (sponsor) |
| EXC-04 | Infinite scroll em clientes/fornecedores/AP | UX de cadastro longo; footer CrudListShell | Documentar modo; não criar 2ª paginação |
| EXC-05 | Mini-`<table>` em cards de relatório | Densidade analítica | OK se tokens/empty alinhados |
| EXC-06 | `FornecedorCombobox` no form produto | Dívida entity-SSoT | Não expandir; preferir `/admin/fornecedores` |
| EXC-07 | Diagnóstico/demo densidade utilitária | Uso interno | Tokens Admin V2 obrigatórios |

Qualquer exceção nova → processo em [`DESIGN_SYSTEM_GOVERNANCE.md`](./DESIGN_SYSTEM_GOVERNANCE.md) §5.

---

## 5. Inventário rápido do que já existe vs. criar

| Já existe (adotar) | Criar na S0 | Eliminar (órfão/legado) |
|--------------------|-------------|-------------------------|
| AdminV2Shell, PageHeader, PageActions, CrudListShell, SectionCard, MetricCard, ChartCard, ListPageSkeleton | PageShell | CadastroPageShell + árvore cadastro órfã |
| FilterBar, DataTable, PaginationBar, DragonModal, Button, forms/*, feedback/* | EntityTable, ConfirmDialog, TabNav, Stepper, DetailSheet, InlineAlert, FormSection, FileDropzone, MoneyText, KeyHint | GerenteTable (após migração telas), DataTablePage, GerenteFilterBar, GerenteStatusBadge, card.tsx se 0 usos, PendingSubmitButton |
| StatusChip, badges.tsx, Autocomplete, SearchInput | FilterBar daterange; emitToast alias | `.app-btn-*` / `.admin-v2-btn-*` em código novo |

---

## 6. Métricas baseline (atualizar fim de cada sprint)

| Indicador | Baseline |
|-----------|----------|
| Páginas auditadas | 41 |
| Páginas P0 | 6 |
| Páginas P1 | 12 |
| Famílias duplicadas vivas | 8 |
| Padrões formulário | 2 |
| Padrões tabela | 3 |
| Padrões modal | 2 |
| Padrões toast | 2 canais |
| Padrões FilterBar | 1 SSOT + N locais |
| Aderência DS (%) | ~42% |

Fórmula e metas: [`ROADMAP_UI_UX.md`](./ROADMAP_UI_UX.md) § Métricas · [`DESIGN_SYSTEM_GOVERNANCE.md`](./DESIGN_SYSTEM_GOVERNANCE.md) §7.

---

## 7. Definição de pronto da cobertura S0

A Sprint 0 só é “base definitiva” quando:

1. Todos os primitivos da §1 (coluna SSOT) **existem e estão exportados**.
2. Matriz §2 não aponta GAP aberto.
3. Exceções §4 estão escritas (não implícitas).
4. Governança PR está linkada e burndown baseline atualizado.
5. **Nenhuma tela** foi redesenhada na S0 (aplicação = S1+).
