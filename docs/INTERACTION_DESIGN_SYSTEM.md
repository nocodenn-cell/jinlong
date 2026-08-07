# Interaction Design System — Jīn Lóng ERP

| Campo | Valor |
|--------|--------|
| **Data** | 2026-08-07 |
| **Status** | **Vigente** — Sprint 0 **pronta para aceite** (0 Divergentes; Engineering Loop) |
| **Escopo** | Comportamento de interação em `pdv-importados` |
| **Irmãos** | [`DESIGN_SYSTEM_GAPS.md`](./DESIGN_SYSTEM_GAPS.md) · [`DESIGN_SYSTEM_GOVERNANCE.md`](./DESIGN_SYSTEM_GOVERNANCE.md) · [`UI_UX_BACKLOG.md`](./UI_UX_BACKLOG.md) · [`SPRINT_0_ENGINEERING_LOOP.md`](./SPRINT_0_ENGINEERING_LOOP.md) |
| **Princípio** | Duas telas diferentes devem ter **o mesmo comportamento** para o mesmo padrão |
| **Última validação código** | 2026-08-07 (Engineering Loop ciclos 1–5) |

Este documento é um **ativo arquitetural**. Componentes SSOT implementam estes contratos; PRs não podem inventar um 2º comportamento sem atualizar este arquivo.

**Atenção:** regras §1 descrevem o **comportamento obrigatório pós-S0**. A §0.1 registra o estado **real** do repositório na validação.

---

## 0.1 Validação IX × código (evidência)

Legenda: **Confirmado** · **Parcial** · **Divergente** · **Não encontrado**.

| Contrato | Status | Evidência no repo | Correção S0 | Bloqueia S1? |
|----------|--------|-------------------|-------------|--------------|
| **IX-CRUD** | Parcial | `PageShell`+`EntityTable` exportados; `CrudListShell`+`DataTable` vivos; `GerenteTable` legado até S3 | Aplicar shells nas telas (S1+) | Não |
| **IX-SEARCH** | Parcial | `FilterBar` debounce 350ms+Enter; cadastros com busca local | Adotar FilterBar nas listas | Não |
| **IX-FILTER** | Confirmado | `FilterDef` com `daterange`; `setParam`/`setDateRange`/`clearAll` deletam `page` | — | Não |
| **IX-TABLE** / sort | Parcial | `EntityTable`+`MoneyText`+`DataTable`; `GerenteTable` vivo | Migrar listas (S1+) | Não |
| **IX-PAGE** | Confirmado | `PaginationBar` `numbered`\|`cursor`\|`infinite` + testes | Adotar infinite nas listas EXC-04 | Não |
| **IX-SELECT** | Parcial | Selection em `EntityTable` + usos locais | Adotar EntityTable selection | Não |
| **IX-BULK** | Parcial | `BulkActionBar` SSOT; `CatalogoLoteToolbar` ainda local | Compor BulkActionBar (S1) | Não |
| **IX-WIZARD** | Parcial | `Stepper` SSOT; wizards de domínio ainda ad hoc | Aplicar Stepper (S3/S4) | Não |
| **IX-UPLOAD** | Parcial | `FileDropzone` SSOT; dropzones locais ainda vivos | Compor FileDropzone (S1+) | Não |
| **IX-IMPORT-CSV** | Parcial | Domínio OK; ConfirmDialog disponível; FileDropzone pronto | Compor na importação | Não |
| **IX-EXPORT** | Parcial | `ExportAction`+`downloadTextFile`; exports locais ainda vivos | Adotar ExportAction | Não |
| **IX-CONFIRM** | Confirmado | `ConfirmDialog` + `ConfirmActionButton` via modal; `check:ds-sprint0` ban confirm nativo (allowlist PDV/import) | Migrar allowlist em S1/PDV | Não |
| **IX-DELETE** | Parcial | ConfirmDialog disponível; copy soft/hard a unificar | Copy na S1+ | Não |
| **IX-DRILL** | Confirmado | `MetricCard` com `href`; dashboard→vendas | — | Não |
| **IX-DRAWER** | Confirmado | Drawers = nav/PDV (EXC); detalhe = DetailSheet | — | Não |
| **IX-SHEET** | Parcial | `DetailSheet` SSOT; sheets legados allowlisted até migração | Migrar Venda/Fiscal/Auditoria (S1+) | Não |
| **IX-LOOKUP** | Parcial | `EntityLookup` async SSOT; Autocomplete client-only p/ listas curtas; recebimento/transf. ainda legados | Migrar lookup longo (S1 Transferências) | Não |
| **IX-FORM** | Parcial | `Field`+`FormSection` SSOT; config ainda mista | Aplicar FormSection (S4) | Não |
| **IX-ERROR** | Parcial | `ErrorState`+`InlineAlert` SSOT | Adotar InlineAlert em gates | Não |
| **IX-SUCCESS** | Confirmado | `emitToast` alias de `emitGerenteToast`; PDV = EXC-02 | — | Não |
| **IX-LOAD** | Parcial | `ListPageSkeleton` em vários `loading.tsx` | Manter | Não |
| **IX-EMPTY** | Parcial | `EmptyState` SSOT; lint bloqueia emoji empty em `components/ui` | Limpar empties de tela (S1+) | Não |
| **IX-KEYS** | Parcial | PDV forte; Esc em DragonModal/ConfirmDialog/DetailSheet | — | Não |
| **IX-SHORTCUT** | Parcial | `KeyHint` SSOT; PDV ainda usa `KbdAtalho` local | Adotar KeyHint no PDV (S1) | Não |
| **IX-AUTHZ** | Confirmado | `loadAdminContext` / policy server-first; sidebar `adminOnly` | — | Não |

**Resumo IX:** Confirmado **7/25** · Parcial **18/25** · Divergente **0/25** · Não encontrado **0/25**.  
**Cobertura IX útil (Confirmado+Parcial) = 100%** — Sprint 0 de primitivos/contratos **DONE** no código; adoção em telas = S1+.

### Divergências que bloqueavam Sprint 1 — resolvidas

| # | Antes | Depois (S0) |
|---|--------|-------------|
| 1 | `ConfirmActionButton` → `globalThis.confirm` | `ConfirmDialog` + gate CI |
| 2 | Sheets `fixed inset-0` sem SSOT | `DetailSheet` exportado; legado allowlisted |
| 3 | Lookup triplo sem async SSOT | `EntityLookup` async (`onSearch`) |

---

## 0. Inventário — padrões de interação

Legenda: **Impl.** = nº aproximado de implementações vivas · **SSOT** = contrato oficial pós-S0.

| # | Padrão | Existe? | Impl. | SSOT (contrato) | Módulos | Falta / gap S0 |
|---|--------|---------|------:|-----------------|---------|----------------|
| 1 | CRUD completo | Parcial | ~8 | **IX-CRUD** + PageShell/CrudListShell/DragonModal | Cat, Cad, Compras; Ven/Est/Fin parciais | Padronizar create=modal/page; activate vs delete |
| 2 | Pesquisa | Sim dual | 2 | **IX-SEARCH** (URL FilterBar \| local debounce) | Cat/Est/Fin/Ven=URL; Cad=local | Regra quando URL vs local |
| 3 | Filtros | Sim dual | 1+N | **IX-FILTER** = FilterBar URL (+daterange) | Cat, Est, Fin, Dash; Comissões/Rel sem | daterange; migrar locais |
| 4 | Paginação | Triplo | 3 | **IX-PAGE** = PaginationBar `numbered`\|`cursor`\|`infinite` | Cat/Est; Ven cursor; Cli/Forn/AP infinite | Modo infinite no SSOT |
| 5 | Ordenação | Sim | ~8 | **IX-SORT** = DataTable/EntityTable (client page; server só com API) | Listas DataTable | Documentar limite client-only |
| 6 | Seleção múltipla | Sim local | 2–3 | **IX-SELECT** + EntityTable selection | Cat, Comissões, Forn | Contrato genérico |
| 7 | Ações em lote | Sim local | 2–3 | **IX-BULK** + **BulkActionBar** (S0) | Cat (forte), Comissões, Forn | Componente/contrato S0 |
| 8 | Wizards/Steppers | Ad hoc | 2+ | **IX-WIZARD** + Stepper | NF-e, Provisionamento | Stepper S0 |
| 9 | Upload arquivos | Ad hoc | 3 | **IX-UPLOAD** + FileDropzone | Foto, CSV, XML NF-e | FileDropzone S0 |
| 10 | Importação CSV | Sim domínio | 1 | **IX-IMPORT-CSV** = FileDropzone + preview + confirm | Catálogo | Compor; não 2º motor |
| 11 | Exportação | Fragmentado | CSV×4, PDF×1, XLSX×0 | **IX-EXPORT** + ExportAction (S0) | Cat, AP, Rel, Hist PDV, Etiquetas PDF | ExportAction; XLSX fora |
| 12 | Confirmações | Heterogêneo | 4 | **IX-CONFIRM** + ConfirmDialog | Fin/Cad confirm nativo; Cat/PDV modais | ConfirmDialog S0 |
| 13 | Exclusões | Domínio | 2+ | **IX-DELETE** (soft/hard messaging) | Cat soft/hard; Cli/Forn; toggle ativo | Copy de outcome único |
| 14 | Drill-down | Sim | KPI+row | **IX-DRILL** = MetricCard.href + row→DetailSheet | Dash, Ven, Est, Aud, Fis | Unificar destino sheet |
| 15 | Drawers | Parcial | nav legado + PDV mobile | **IX-DRAWER** (nav/mobile); detalhe = DetailSheet | Nav gerente; PDV Em aberto | Não usar drawer para detalhe entidade |
| 16 | Detail Sheet | Ad hoc | ~4 | **IX-SHEET** + DetailSheet | Ven, Fis, Aud, Kardex | DetailSheet S0 |
| 17 | Lookup/Combobox | Fragmentado | 3+ | **IX-LOOKUP** = Autocomplete entidade | Rec OK; Transf select; FornecedorCombobox dívida | Autocomplete SSOT |
| 18 | Autocomplete | Existe pouco usado | 1 DS + customs | **IX-LOOKUP** | forms/Autocomplete | Adotar |
| 19 | Atalhos teclado | PDV forte | 1 mapa | **IX-SHORTCUT** + KeyHint | Caixa; Cat `n` | KeyHint; admin mínimo opcional |
| 20 | Navegação teclado | PDV+tabela parcial | — | **IX-KEYS** | Combobox PDV; DataTable sort; modais Esc | Focus trap em Confirm/Sheet |
| 21 | Loading | Parcial | mix | **IX-LOAD** = ListPageSkeleton / table skeleton / Button loading | Admin loading.tsx; DataTable | Proibir spinner inventado |
| 22 | Empty | Parcial | DS+local | **IX-EMPTY** = EmptyState | Cat/Est OK; Rel local | Banir empty emoji |
| 23 | Erro | Parcial | DS+inline | **IX-ERROR** = ErrorState \| Field error \| toast | Produto inline; outros toast | Regra canal |
| 24 | Permissões | Server+hide | policy | **IX-AUTHZ** = server-first; UI hide/disable | Sidebar, actions, funcionários | Não confiar só em hide |
| 25 | Feedback sucesso | Dual | toast/inline/banner | **IX-SUCCESS** | Painel toast; Config inline; PDV toast/banner | Regra quando usar cada canal |

---

## 1. Regras de interação (comportamento obrigatório)

### 1.1 CRUD — IX-CRUD

1. **Lista** sempre em `PageShell` + `CrudListShell` + `EntityTable`/`DataTable`.
2. **Criar / editar** cadastro: preferir `DragonModal` (ou página só se formulário > viewport e multi-step). Produto permanece modal (entity-SSoT `/admin/catalogo`).
3. **Ativar/desativar** ≠ excluir: toggle/status com `StatusChip`; exclusão usa IX-DELETE.
4. Após salvar com sucesso: fechar overlay (se modal), `emitToast` success, revalidar lista (router.refresh / invalidate).
5. Não criar CRUD fora das telas oficiais (entity-SSoT).

### 1.2 Pesquisa — IX-SEARCH

| Contexto | Comportamento |
|----------|----------------|
| Listagem admin com FilterBar | Query na **URL** (`q` ou nome do filtro); debounce **350ms**; **Enter** faz flush imediato |
| Listagem curta / infinite client | Estado local + debounce ≥300ms; documentar no PR se não for URL |
| PDV | Campo único bip/nome; combobox de candidatos; teclado ↑↓ Enter Esc |

Proibido: dois campos de busca competindo na mesma lista.

### 1.3 Filtros — IX-FILTER

1. Filtros de listagem admin = **FilterBar** (pills / select / search / daterange).
2. Estado **sempre refletido na URL** (compartilhável, sobrevive a refresh).
3. Chips removíveis para filtros ativos.
4. Mudança de filtro **reseta página** para 1.
5. Proibido filtro só via edição manual de query string sem controle na UI.

### 1.4 Tabela — IX-TABLE (+ sort/select)

1. Uma API: `DataTable` / `EntityTable`.
2. **Ordenação:** clique no header; indicador `aria-sort`. Default = sort **client na página atual**. Sort server só se action/API existir e estiver documentado na coluna.
3. Colunas money = `MoneyText` (tabular, alinhado à direita).
4. Status = `StatusChip` / badges tipados.
5. Clique na linha: ou abre **DetailSheet**, ou navega — nunca os dois com comportamentos diferentes na mesma lista sem documentar.
6. Ações por ícone: `aria-label` obrigatório.

### 1.5 Paginação — IX-PAGE

| Modo | Quando usar |
|------|-------------|
| `numbered` | Total conhecido (catálogo, estoque) |
| `cursor` | Só `hasMore` (vendas) |
| `infinite` | Cadastros longos / AP — footer CrudListShell + sentinel |

SSOT: `PaginationBar` (estender para `infinite` na S0). Proibido paginação manual nova com botões soltos.

### 1.6 Seleção e lote — IX-SELECT / IX-BULK

1. Selection state na EntityTable/DataTable (checkbox coluna).
2. Toolbar = **BulkActionBar** no slot `CrudListShell.bulkBar`.
3. Bulk sempre: contagem selecionada · limpar seleção · ações · ConfirmDialog se destrutivo.
4. Escopo default = **página atual** (catálogo); se “selecionar todos do filtro”, copy explícito.

### 1.7 Wizard — IX-WIZARD

1. UI = `Stepper` (passos nomeados, passo atual, `aria-current`).
2. Avançar só com validação do passo; Voltar preserva estado.
3. Passo final = resumo + ação primária única.
4. Usar em: import NF-e, provisionamento; import CSV pode ser Stepper **dentro** de DragonModal.

### 1.8 Upload / Import CSV / Export — IX-UPLOAD / IX-IMPORT-CSV / IX-EXPORT

**Upload:** só `FileDropzone` (drag/drop + click + tipos MIME + erro InlineAlert/Field).

**Import CSV:** FileDropzone → parse → preview (EntityTable) → ConfirmDialog/commit → toast resultado. Motor de domínio pode permanecer; **UI** não inventa 2º dropzone.

**Export:** `ExportAction` (menu ou botão) com formato declarado (`csv` \| `pdf`). XLSX **fora** até decisão de produto. PDF etiquetas = ExportAction domínio `pdf`.

### 1.9 Confirmação — IX-CONFIRM

1. Só `ConfirmDialog` (danger \| neutral).
2. Esc fecha; foco no cancelar (neutral) ou no danger com label explícito.
3. Proibido `window.confirm` / `alert` em hot-path.
4. PDV pode usar `CaixaConfirmModal` (EXC) desde que mesmo contrato Esc/foco/labels.

### 1.10 Exclusão — IX-DELETE

| Outcome | UI |
|---------|-----|
| Hard delete OK | ConfirmDialog danger → toast success → remove da lista |
| Bloqueado → soft (ex.: produto INATIVO) | ConfirmDialog explica risco → toast **explica outcome** (“inativado porque…”) |
| Só inativar | Não chamar de “excluir”; usar “Desativar” |

### 1.11 Drill-down — IX-DRILL

1. KPI clicável = `MetricCard` com `href` (mesmo filtro/período).
2. Linha de lista → DetailSheet (detalhe) ou rota de detalhe — um padrão por lista.
3. Proibido KPI morto quando o destino já existe.

### 1.12 Drawer vs DetailSheet vs Modal — IX-DRAWER / IX-SHEET / Modal

| Uso | Padrão |
|-----|--------|
| Criar/editar formulário | `DragonModal` |
| Confirmar | `ConfirmDialog` |
| Detalhe read-mostly + ações secundárias | `DetailSheet` |
| Navegação mobile / rail PDV | Drawer (EXC PDV / nav) |

Proibido `fixed inset-0` ad hoc para detalhe de entidade.

### 1.13 Lookup / Autocomplete — IX-LOOKUP

1. Qualquer escolha de **produto / cliente / fornecedor / entidade longa** = **`EntityLookup`** (S0) com busca **async** (`onSearch` / debounce / loading / empty).
2. `forms/Autocomplete` atual (**só filtro client** sobre `options[]` — evidência `Autocomplete.tsx`) **não** satisfaz lookup de catálogo remoto sozinho.
3. Proibido `<select>` com centenas de options em código novo.
4. Teclado: ↑↓ Enter Esc; empty “nenhum resultado”; loading visível.
5. `FornecedorCombobox` = dívida; não expandir (EXC-06).
6. `ProdutoRecebimentoAutocomplete` deve ser **substituído/envolvido** por EntityLookup na aplicação (S1+), não copiado.

### 1.14 Formulário e validação — IX-FORM

1. Estrutura: `FormSection` + `Field` + controls `forms/*`.
2. Validação **client**: erro **inline no Field** (`aria-invalid` + mensagem); foco no primeiro inválido ao submit.
3. Erro **server**: mapear para Field quando houver campo; senão `InlineAlert` no topo do form ou toast se overlay já fechou.
4. Submit: `Button` loading; impedir double-submit.
5. Sucesso: ver IX-SUCCESS.

### 1.15 Mensagens de erro — IX-ERROR

| Canal | Quando |
|-------|--------|
| Field inline | Erro de campo conhecido |
| `InlineAlert` | Erro de página/form ainda aberto |
| `ErrorState` | Falha de carregamento de lista/região |
| Toast destructive | Erro após ação quando o contexto visual já mudou |
| Banner PDV | Erros de pipeline bip (EXC-02) |

Proibido emoji como único sinal de erro.

### 1.16 Mensagens de sucesso — IX-SUCCESS

| Canal | Quando |
|-------|--------|
| `emitToast` success | Mutação em lista/modal (padrão painel) |
| Inline success | Forms longos multi-seção que **permanecem abertos** (ex.: Config abas) |
| Banner PDV | ACK de bip / estado de turno (não substituir toast de sangria se já usa toast) |

Uma ação → **um** canal primário de sucesso (não toast + inline + banner juntos).

### 1.17 Loading / Empty — IX-LOAD / IX-EMPTY

- Primeira carga de lista admin: `ListPageSkeleton` / skeleton DataTable.
- Ação: Button `loading` ou row busy; não bloquear layout inteiro sem necessidade.
- Empty: sempre `EmptyState` com título + descrição + CTA opcional.
- Proibido empty só com emoji ou string solta.

### 1.18 Teclado e atalhos — IX-KEYS / IX-SHORTCUT

**PDV (obrigatório):** mapa único (`caixaAtalhos`); atalho visível via `KeyHint` no controle; F1 abre referência.

**Admin:**  
- Esc fecha Modal/Sheet/Confirm.  
- Em FilterBar search: Enter aplica.  
- Atalho de criar (`n` no catálogo) só se documentado e com KeyHint ou title.  
- Não capturar teclas dentro de inputs (exceto Enter flush).

### 1.19 Permissões — IX-AUTHZ

1. **Server é autoridade** (policy/RPC). UI nunca é única defesa.
2. UI: **esconder** nav/ação se perfil não tem rota; **desabilitar** com motivo se a ação é visível mas bloqueada pontualmente.
3. Não mostrar CTA que sempre falha no server sem feedback.

---

## 2. Auditoria de fluxos — composição só com S0 (+ EXC)

| Fluxo | SSOT componentes suficientes **hoje**? | IX suficientes **hoje**? | Exceção inevitável? | S1 sem novo paradigma **se DoD S0 completo**? |
|-------|----------------------------------------|--------------------------|---------------------|-----------------------------------------------|
| **PDV** | Parcial (Kbd local, sem KeyHint export) | Parcial | **Sim** EXC-01/02 | **Sim** |
| **Cadastro produto** | Parcial (bulk/export/upload ad hoc) | Parcial | FornecedorCombobox (não expandir) | **Sim** se S0-18/19/20/05 |
| **Compras** | **Não** (GerenteTable/dark) | Divergente overlay | Não | **Sim** se PageShell+EntityTable+Confirm |
| **Estoque** | Quase (PageHeader+CrudListShell+DataTable) | Parcial | Etiquetas 2-col OK | **Sim** |
| **Transferências** | **Não** (select 500) | **IX-LOOKUP divergente** | Não | **Só com UX-S0-24 async** |
| **Vendas** | Parcial (sheet/empty/filtros locais) | SHEET/EMPTY/FILTER parciais | Não | **Sim** com DetailSheet+FilterBar |
| **Financeiro** | **Não** (TabNav local, GerenteTable AP) | Parcial | Infinite AP = EXC-04 | **Sim** com TabNav+EntityTable+S0-21 |
| **Fiscal** | **Não** (sheet ad hoc) | SHEET divergente | Timeline domínio OK | **Sim** com DetailSheet |
| **Configurações** | Parcial (tabs/labels raw) | FORM parcial | Não | **Sim** com TabNav+FormSection |
| **Administração** | Parcial (wizard/banners ad hoc) | WIZARD/CONFIRM | EXC-07 diagnóstico | **Sim** com Stepper+Confirm+InlineAlert |

**Conclusão pós-DoD S0 (incl. S0-24..26):** fluxos cabem sem 3º paradigma.  
**Conclusão no código atual:** Sprint 0 **não** está implementada — veredicto em `ROADMAP_UI_UX.md`.

---

## 3. Itens Sprint 0 derivados desta auditoria

| ID | Entrega | Tipo | Estado 2026-08-07 |
|----|---------|------|-------------------|
| **UX-S0-19** | **BulkActionBar** (+ selection EntityTable) | Componente | ❌ não existe no código |
| **UX-S0-20** | **ExportAction** (csv\|pdf) | Componente | ❌ não existe |
| **UX-S0-21** | PaginationBar modo `infinite` | Extensão | ❌ só numbered/cursor |
| **UX-S0-22** | Publicar IDS + DoD IX | Documento | ✅ doc; ⚠️ contratos não implementados |
| **UX-S0-23** | EntityLookup (doc) | Contrato | ⚠️ insuficiente sozinho → **S0-24** |
| **UX-S0-24** | **EntityLookup async** (`onSearch`, debounce, loading) | Componente | ❌ obrigatório — Autocomplete client-only não basta |
| **UX-S0-25** | FilterBar: reset `page`→1 + `daterange` alinhado ao IDS | Extensão | ❌ `setParam` não deleta `page` |
| **UX-S0-26** | Lint/CI: ban empty emoji, `window.confirm`, novo `fixed inset-0` dialog fora SSOT | Tooling | ❌ |
| **UX-S0-27** | Kill-switch StatusChip vs `GerenteStatusBadge` (fiscal ainda usa) | Higiene | ⚠️ |

Contratos IX-CRUD…IX-AUTHZ + primitivos acima são **obrigatórios** no DoD S0.

---

## 4. Como evoluir este documento

1. Novo comportamento de interação → PR atualiza **este arquivo** + `DESIGN_SYSTEM_GAPS.md` na mesma mudança.
2. Novo componente só é aceito se mapear a um IX-* existente ou criar IX-* novo **neste PR**.
3. Exceção de interação → seção Exceções em `DESIGN_SYSTEM_GAPS.md` + prazo.

Ver governança: [`DESIGN_SYSTEM_GOVERNANCE.md`](./DESIGN_SYSTEM_GOVERNANCE.md).
