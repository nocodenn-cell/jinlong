# Design System Gaps — Jīn Lóng ERP

| Campo | Valor |
|--------|--------|
| **Data** | 2026-08-07 (componentes + **padrões de interação**) |
| **App** | `pdv-importados` |
| **Governança** | [`DESIGN_SYSTEM_GOVERNANCE.md`](./DESIGN_SYSTEM_GOVERNANCE.md) |
| **Interação** | [`INTERACTION_DESIGN_SYSTEM.md`](./INTERACTION_DESIGN_SYSTEM.md) |
| **Roadmap / Backlog** | [`ROADMAP_UI_UX.md`](./ROADMAP_UI_UX.md) · [`UI_UX_BACKLOG.md`](./UI_UX_BACKLOG.md) |
| **Burndown** | `pdv-importados/reports/ds-legacy-burndown.json` |

**Sem implementação de tela nesta revisão.** Objetivo: Sprint 0 suficiente para que S1+ só **aplique** componentes **e** comportamentos únicos.

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
| Bulk | **`BulkActionBar`** (S0) + selection EntityTable | Toolbars de lote reinventadas |
| Export | **`ExportAction`** (S0) csv\|pdf | Botões download ad hoc; XLSX fora |
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

## 3. Gaps de componente + interação que a Sprint 0 precisa incluir

### 3.1 Componentes (já na S0)

| ID | Primitivo | Por que sem ele S1+ inventa padrão |
|----|-----------|-------------------------------------|
| **UX-S0-13** | **TabNav** | Financeiro, Config, Relatórios |
| **UX-S0-14** | **Stepper** | NF-e, provisionamento |
| **UX-S0-15** | **DetailSheet** | Vendas, Auditoria, Fiscal, Kardex |
| **UX-S0-16** | **InlineAlert** | Suspensão, stub fiscal, gates |
| **UX-S0-17** | **FormSection** | Produto, Config, forms densos |
| **UX-S0-18** | **FileDropzone** | NF-e + CSV |
| **UX-S0-19** | **BulkActionBar** | Catálogo/comissões/fornecedores reinventam lote |
| **UX-S0-20** | **ExportAction** | CSV/PDF fragmentados; evita 2º botão export |
| **UX-S0-21** | PaginationBar **`infinite`** | Infinite scroll fora do SSOT |
| **UX-S0-23** | **EntityLookup** (doc/helper Autocomplete) | Select 500 / combobox paralelo |

### 3.2 Contratos de interação (obrigatórios na S0)

Inventário completo e regras: [`INTERACTION_DESIGN_SYSTEM.md`](./INTERACTION_DESIGN_SYSTEM.md).

| ID doc | Entrega |
|--------|---------|
| **UX-S0-22** | Publicar IDS + DoD S0 exige conformidade IX-* |

Sem componentes §3.1 **e** contratos IX, as sprints de tela criariam paradigmas novos de **comportamento** (confirm, sheet, bulk, export, validação) mesmo com PageShell visualmente correto.

### 3.3 Fluxos mínimos — cabem na S0?

| Fluxo | Cabe? | Observação |
|-------|-------|------------|
| Venda PDV | Sim | EXC shell/toast |
| Cadastro produto | Sim | Exige Bulk+Export+FileDropzone |
| Entrada estoque | Sim | Autocomplete |
| Transferência | Sim | Autocomplete (não select) |
| Compra | Sim | PageShell+EntityTable |
| Venda admin | Sim | FilterBar+DetailSheet |
| Financeiro | Sim | TabNav+EntityTable |
| Fechamento caixa | Sim | EXC PDV confirm |
| Fiscal | Sim | DetailSheet+InlineAlert |
| Configurações | Sim | TabNav+FormSection+IX-SUCCESS inline |

**Nenhum fluxo mínimo exige paradigma além da S0 expandida.** Detalhe: IDS §2.

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
| FilterBar, DataTable, PaginationBar, DragonModal, Button, forms/*, feedback/* | EntityTable, ConfirmDialog, TabNav, Stepper, DetailSheet, InlineAlert, FormSection, FileDropzone, BulkActionBar, ExportAction, MoneyText, KeyHint | GerenteTable (após migração), DataTablePage, GerenteFilterBar, GerenteStatusBadge, card.tsx se 0 usos, PendingSubmitButton |
| StatusChip, badges.tsx, Autocomplete, SearchInput | FilterBar daterange; PaginationBar infinite; emitToast alias; EntityLookup helper | `.app-btn-*` / `.admin-v2-btn-*` em código novo |
| — | Contratos IX em `INTERACTION_DESIGN_SYSTEM.md` | Comportamentos ad hoc em código novo |

---

## 6. Métricas baseline (atualizar fim de cada sprint)

| Indicador | Baseline |
|-----------|----------|
| Páginas auditadas | 41 |
| Páginas P0 | 6 |
| Páginas P1 | 12 |
| Famílias duplicadas vivas | 8 |
| Padrões de interação duplicados (confirm/sheet/bulk/export/search) | ≥4 famílias com ≥2 impl. |
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

1. Todos os primitivos da §1 (coluna SSOT) **existem e estão exportados** (incl. BulkActionBar, ExportAction, PaginationBar infinite).
2. Matriz §2 / §3.3 sem GAP aberto; fluxos mínimos “cabem”.
3. [`INTERACTION_DESIGN_SYSTEM.md`](./INTERACTION_DESIGN_SYSTEM.md) publicado com IX-* e regras.
4. Exceções §4 estão escritas (não implícitas).
5. Governança PR (componente **e** interação) linkada; burndown baseline atualizado.
6. **Nenhuma tela** foi redesenhada na S0 (aplicação = S1+).
