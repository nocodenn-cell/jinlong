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

### 3.1 Componentes S0 — existência no código (validação 2026-08-07)

| ID | Primitivo | No código? | Bloqueia S1 se ausente? |
|----|-----------|------------|-------------------------|
| UX-S0-04 | PageShell | ❌ | Sim (retrabalho) |
| UX-S0-05 | ConfirmDialog | ❌ | **Sim** (IX-CONFIRM divergente) |
| UX-S0-06 | FilterBar daterange | ❌ (`FilterDef` sem tipo) | **Sim** |
| UX-S0-07 | EntityTable | ❌ | Sim |
| UX-S0-08 | MoneyText / KeyHint | ❌ (só `KbdAtalho` local / `formatBRL`) | KeyHint não; MoneyText não |
| UX-S0-09 | emitToast alias | ❌ | Não |
| UX-S0-13 | TabNav | ❌ | **Sim** |
| UX-S0-14 | Stepper | ❌ | **Sim** |
| UX-S0-15 | DetailSheet | ❌ | **Sim** (IX-SHEET) |
| UX-S0-16 | InlineAlert | ❌ | Parcial |
| UX-S0-17 | FormSection | ❌ | **Sim** (Config) |
| UX-S0-18 | FileDropzone | ❌ | **Sim** |
| UX-S0-19 | BulkActionBar | ❌ | **Sim** |
| UX-S0-20 | ExportAction | ❌ | **Sim** |
| UX-S0-21 | PaginationBar infinite | ❌ | **Sim** |
| UX-S0-23 | EntityLookup thin | ⚠️ Autocomplete client-only **insuficiente** | → **S0-24** |

**Já existem (adotar):** AdminV2Shell, PageHeader, CrudListShell, DataTable, FilterBar (parcial), PaginationBar (numbered/cursor), DragonModal, Button, Field, EmptyState, ErrorState, MetricCard, SectionCard, ListPageSkeleton, StatusChip, Autocomplete (só client).

### 3.2 Lacunas além de UX-S0-19..23 (obrigatórias)

| ID | Entrega | Justificativa técnica | Bloqueia S1? |
|----|---------|----------------------|--------------|
| **UX-S0-24** | **EntityLookup async** (`onSearch`, debounce, loading, empty) | `Autocomplete.tsx` só filtra `options[]` em memória; recebimento já tem paralelo async; transferências usam `<select>` 500 — thin-wrap **não** elimina o 3º paradigma | **Sim** |
| **UX-S0-25** | FilterBar: **reset `page`→1** em `setParam` + daterange | IDS IX-FILTER exige reset; `FilterBar.tsx` não deleta `page` | **Sim** |
| **UX-S0-26** | Lint/CI: ban `window.confirm`, empty emoji, novo `fixed inset-0` dialog fora SSOT | Sem freio, admin-v2 continua criando empty/sheet/confirm paralelos | **Sim** (governança) |
| **UX-S0-27** | Deprecate `GerenteStatusBadge` → StatusChip (fiscal ainda importa) | Evita 2º badge em S2 fiscal | Não crítico |

### 3.3 Contratos IX

Validação completa: [`INTERACTION_DESIGN_SYSTEM.md`](./INTERACTION_DESIGN_SYSTEM.md) §0.1.  
UX-S0-22 (doc) ✅ · implementação dos IX Divergentes ❌.

### 3.4 Fluxos críticos — cobertura (código atual vs pós-DoD)

| Fluxo | SSOT hoje? | IX hoje? | Exceção? | S1 limpa se DoD S0? |
|-------|------------|----------|----------|---------------------|
| PDV | Parcial | Parcial | EXC-01/02 | Sim |
| Cadastro produtos | Parcial | Parcial | EXC-06 | Sim + S0-18/19/20/05 |
| Compras | Não | Divergente | — | Sim + PageShell/EntityTable |
| Estoque | Quase | Parcial | Etiquetas 2-col | Sim |
| Transferências | Não | **LOOKUP divergente** | — | **Só com S0-24** |
| Vendas | Parcial | SHEET parcial | — | Sim + DetailSheet |
| Financeiro | Não | Parcial | EXC-04 | Sim + TabNav/EntityTable/S0-21 |
| Fiscal | Não | SHEET divergente | Timeline OK | Sim + DetailSheet |
| Configurações | Parcial | FORM parcial | — | Sim + TabNav/FormSection |
| Administração | Parcial | WIZARD/CONFIRM | EXC-07 | Sim + Stepper/Confirm |

### 3.5 Matriz de prontidão Sprint 0

| Item | Status | Bloqueia Sprint 1? |
|------|--------|--------------------|
| Componentes SSOT | ❌ maioria S0 inexistente no código | **Sim** |
| Contratos IX | ⚠️ 3 Divergentes + 19 Parciais | **Sim** (Confirm/Sheet/Lookup) |
| Governança | ⚠️ checklist reforçado; lint S0-26 ausente | **Sim** até S0-26 |
| Cobertura de módulos | ⚠️ docs OK; código parcial | **Sim** |
| Burndown legado | ⚠️ `asOf 2026-07-30` stale | Não (atualizar em S0-11) |
| Métricas | ⚠️ baseline recalculada ~55% estrita / ~69% proxy PageHeader | Não |
| Documentação | ✅ IDS/GAPS/GOVERNANCE/ROADMAP/BACKLOG | Não |

**Decisão:** ver [`ROADMAP_UI_UX.md`](./ROADMAP_UI_UX.md) — **Sprint 0 REPROVADA**.

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

| Já existe (adotar) — **confirmado no repo** | Criar na S0 — **ainda ausente** | Eliminar |
|-----------------------------------------------|----------------------------------|----------|
| AdminV2Shell, PageHeader, CrudListShell, DataTable, FilterBar, PaginationBar (numbered/cursor), DragonModal, Button, Field, EmptyState, ErrorState, MetricCard, SectionCard, ListPageSkeleton, StatusChip, Autocomplete (client-only) | PageShell, EntityTable, ConfirmDialog, TabNav, Stepper, DetailSheet, InlineAlert, FormSection, FileDropzone, BulkActionBar, ExportAction, MoneyText, KeyHint, emitToast, daterange, infinite, **EntityLookup async** | CadastroPageShell (órfão), PendingSubmitButton, card.tsx (0 imports); GerenteTable/DataTablePage (após migração telas) |

---

## 6. Métricas medidas (2026-08-07)

| Indicador | Valor medido |
|-----------|-------------|
| `app/admin/**/page.tsx` | 28 |
| Com PageHeader | 20 / 28 |
| PageShell | **0** |
| Listas com DataTable | 11 |
| GerenteTable vivo | 3 (funcionários, compras, AP) |
| DragonModal imports | ~26 |
| Sheets `fixed inset-0` fora Dragon | ~8 arquivos |
| Button SSOT files | ~57 |
| `app-btn-*` files | ~12 |
| EmptyState usages | ~16 |
| FilterBar consumers | 4 |
| Burndown JSON asOf | **2026-07-30** (stale) |
| **Aderência DS (fórmula GOVERNANCE, PageShell=0)** | **~55%** |
| **Aderência DS (proxy PageHeader)** | **~69%** |
| **Cobertura IX (Confirmado+Parcial / 25)** | **~88%** |
| IX Divergentes | 3 (CONFIRM, SHEET, LOOKUP) |

Baseline antiga ~42% estava **desatualizada** vs contagens atuais.

---

## 7. Definição de pronto + veredicto

DoD: primitivos §3.1+§3.2 **exportados**; IX sem Divergente dominante; S0-26 lint; burndown atualizado; zero redesign de tela na S0.

**Veredicto validação 2026-08-07: Sprint 0 REPROVADA** — documentação avançada; implementação SSOT/IX no código insuficiente para liberar Sprint 1.
