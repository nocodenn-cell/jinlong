# Backlog UI/UX — Jīn Lóng ERP

| Campo | Valor |
|--------|--------|
| **Data** | 2026-08-07 (S0 expandida pela matriz de cobertura) |
| **Docs** | [`ROADMAP_UI_UX.md`](./ROADMAP_UI_UX.md) · [`DESIGN_SYSTEM_GAPS.md`](./DESIGN_SYSTEM_GAPS.md) · [`DESIGN_SYSTEM_GOVERNANCE.md`](./DESIGN_SYSTEM_GOVERNANCE.md) · [`INTERACTION_DESIGN_SYSTEM.md`](./INTERACTION_DESIGN_SYSTEM.md) |
| **Gate** | **Sprint 0 DONE (componentes + IX) antes de qualquer P0/P1 de tela** |

---

## Legenda

| Campo | Significado |
|-------|-------------|
| **Esforço** | S ≤0.5d · M 1–2d · L 3–5d |
| **Gate item** | Reduz retrabalho ou cliques? Mantém arquitetura? Não cria 2º paradigma? |

---

## Sprint 0 — Design System (zero redesign de tela)

### Higiene e contrato

| ID | Item | Esforço | Impacto | Risco | Depende | Critério de pronto |
|----|------|---------|---------|-------|---------|-------------------|
| **UX-S0-01** | Congelar matriz SSOT + link governança | S | Fundação | Baixo | — | Docs SSOT + GOVERNANCE referenciados |
| **UX-S0-02** | Remover órfãos (`CadastroPageShell` e árvore, `PendingSubmitButton`, `card.tsx` se 0 imports, etc.) | S | Dívida | Baixo | S0-01 | Zero import; build ok |
| **UX-S0-03** | `GerenteStatusBadge` → StatusChip (deprecate/delete) | S | Consistência | Baixo | — | Sem import novo do shim |
| **UX-S0-10** | Lint arquivo novo: sem GerenteTable, `.app-btn-*`, hex className, `text-[Npx]` agressivo | S | Congela entropia | Baixo | — | Script/CI documentado |
| **UX-S0-11** | Baseline burndown + métricas roadmap | S | Governança | Baixo | — | `ds-legacy-burndown` asOf S0 |

### Núcleo página / lista / filtro / tabela

| ID | Item | Esforço | Impacto | Risco | Depende | Critério de pronto |
|----|------|---------|---------|-------|---------|-------------------|
| **UX-S0-04** | **PageShell** (page + PageHeader + slots) | M | Anti-retrabalho | Médio | PageHeader | Export + teste/story; 0 rotas migradas |
| **UX-S0-06** | FilterBar `daterange` | M | Desbloqueia S3/S4 | Baixo | FilterBar | Tipo + teste; 0 telas migradas |
| **UX-S0-07** | **EntityTable** (wrapper DataTable) | M | Kill GerenteTable depois | Médio | DataTable | API money/status/actions; 0 migrações |

### Overlay / feedback

| ID | Item | Esforço | Impacto | Risco | Depende | Critério de pronto |
|----|------|---------|---------|-------|---------|-------------------|
| **UX-S0-05** | **ConfirmDialog** (DragonModal) | M | a11y | Médio | DragonModal | danger/neutral; Esc/foco |
| **UX-S0-09** | Alias `emitToast` → emitGerenteToast + doc 2 canais | S | API | Baixo | toast.ts | Alias público |
| **UX-S0-15** | **DetailSheet** (contrato único sheet) | M | Anti-3º overlay | Médio | DragonModal ou primitivo sheet | API documentada; 0 migração obrigatória de sheets legados |
| **UX-S0-16** | **InlineAlert** | S | Banners/gates | Baixo | tokens warning/danger | tones info/warning/danger/success |

### Navegação / fluxo / form / upload

| ID | Item | Esforço | Impacto | Risco | Depende | Critério de pronto |
|----|------|---------|---------|-------|---------|-------------------|
| **UX-S0-13** | **TabNav** | M | Financeiro/Config/Relatórios | Médio | admin-v2 tokens | controlled + Link/URL mode |
| **UX-S0-14** | **Stepper** | M | NF-e / provisionamento | Médio | — | steps + current + labels a11y |
| **UX-S0-17** | **FormSection** | S | Forms densos | Baixo | Field | title + description + grid slot |
| **UX-S0-18** | **FileDropzone** | M | NF-e / CSV | Médio | — | drag/drop + input file + erro |

### Helpers / lote / export / lookup / IDS

| ID | Item | Esforço | Impacto | Risco | Depende | Critério de pronto |
|----|------|---------|---------|-------|---------|-------------------|
| **UX-S0-08** | **MoneyText** + **KeyHint** (extrair PDV sem mudar layout) | S | Consistência | Baixo | formatBRL | No DS; adoção PDV = S1 |
| **UX-S0-19** | **BulkActionBar** + selection contract EntityTable | M | Anti-retrabalho lote | Médio | S0-07, CrudListShell | Slot bulkBar documentado; 0 telas migradas |
| **UX-S0-20** | **ExportAction** (csv \| pdf) | S | Export único | Baixo | — | API + helper download; XLSX fora |
| **UX-S0-21** | PaginationBar modo **`infinite`** | S | Cadastros/AP | Médio | PaginationBar | Modo documentado + teste |
| **UX-S0-22** | Publicar **INTERACTION_DESIGN_SYSTEM** + DoD IX | S | Comportamento único | Baixo | — | Doc + governança §2.2 |
| **UX-S0-23** | Doc EntityLookup (superseded por S0-24 para implementação) | S | Contrato | Baixo | — | Aponta para S0-24 |
| **UX-S0-24** | **EntityLookup async** (`onSearch`, debounce, loading, empty) | M | Mata 3º paradigma lookup | Médio | — | API async; **não** thin-wrap de Autocomplete client-only |
| **UX-S0-25** | FilterBar: reset `page`→1 + `daterange` alinhado IX-FILTER | M | Contrato filtro | Baixo | FilterBar | `setParam` deleta `page`; tipo daterange + teste |
| **UX-S0-26** | Lint/CI: ban `window.confirm`, empty emoji, `fixed inset-0` dialog fora SSOT | M | Governança | Médio | — | Falha CI em arquivo novo/tocado |
| **UX-S0-27** | Deprecate `GerenteStatusBadge` → StatusChip | S | Badge único | Baixo | — | Fiscal não importa shim |

| Antigo | Novo |
|--------|------|
| UX-P1-DS-01..05, UX-P2-13 | Absorvidos em UX-S0-* |
| UX-S0-12 “contrato Sheet” | **UX-S0-15 DetailSheet** |
| UX-S0-23 thin helper | **UX-S0-24** EntityLookup async |

**Revalidação 2026-08-07:** UX-S0-01..27 **entregues**; Sprint 0 **ACEITA / ENCERRADA** (DoD §3.3). Sprint 1 **em andamento** — ver [`UI_UX_RFC.md`](./UI_UX_RFC.md).

**DoD Sprint 0:** [`ROADMAP_UI_UX.md`](./ROADMAP_UI_UX.md) §3.3 + IX sem Divergente + S0-24..26.

---

## P0 — telas (após S0)

| ID | Tela | Item | Esforço | Depende | Critério de pronto |
|----|------|------|---------|---------|-------------------|
| **UX-P0-01** | Vendas | FilterBar status/pagamento | S | **S0 DONE** | ✅ S1 |
| **UX-P0-02** | Vendas | Título período + Empty/Error DS | S | S0 | ✅ S1 |
| **UX-P0-03** | Transferências | Lookup async (sem payload 500) | M | S0 | ✅ S1 |
| **UX-P0-04** | Financeiro | Hub 3 abas TabNav + EntityTable pagar | L | S0-04,07,13,16 | ✅ S2 |
| **UX-P0-05** | Documento fiscal | PageShell + DetailSheet/InlineAlert | M | S0-04,05,15,16 | ✅ S2 |
| **UX-P0-06** | Compras | PageShell + EntityTable (zero dark/glass) | L | S0-04,07 | ✅ S3 |
| **UX-P0-07** | Comissões | FilterBar daterange + status | M | S0-06 | ✅ S3 |

---

## P1 — hot-path e gestão (após S0)

| ID | Tela | Item | Esforço | Depende | Sprint |
|----|------|------|---------|---------|--------|
| **UX-P1-01** | PDV | Drawer mobile Operações/Em aberto | M | S0 | S4 |
| **UX-P1-02** | PDV | Adotar KeyHint na Finalizar | S | S0-08 | ✅ S1 |
| **UX-P1-03** | PDV | F3 = consulta rápida (contrato vigente; **não** add-to-cart) | S | S0 | ✅ S1 · RFC-005 |
| **UX-P1-04** | PDV | Realce linha carrinho | S | — | ✅ S1 |
| **UX-P1-05** | PDV | Ícone barcode busca | S | — | ✅ S1 |
| **UX-P1-06** | Catálogo | 1 primary + menu Importar | S | S0 | ✅ S1 |
| **UX-P1-07** | Catálogo | PageShell + CrudListShell | M | S0-04 | ✅ S1 |
| **UX-P1-08** | Produto | Atacado pós-salvar | M | — | S4 |
| **UX-P1-09** | NF-e | Stepper fases + FileDropzone | M | S0-14,18 | ✅ S3 |
| **UX-P1-10** | Recebimento | PageShell + breadcrumb | S | S0-04 | ✅ S1 |
| **UX-P1-11** | Contas a pagar | Alias da tab pagar | M | P0-04 | ✅ S2 |
| **UX-P1-12** | Estoque | Hub ações header | S | S0 | ✅ S3 |
| **UX-P1-13** | Funcionários | CrudListShell + EntityTable + FilterBar | M | S0-04,07 | ✅ S4 |
| **UX-P1-14** | Cat. financeiras | Paridade categorias-produto | M | S0 | ✅ S4 |
| **UX-P1-15** | Relatórios | TabNav seções + EmptyState + donut honesto | M | S0-06,13 | ✅ S4 |
| **UX-P1-16** | Suspensão | ConfirmDialog + InlineAlert | S | S0-05,16 | ✅ S4 |
| **UX-P1-17** | Implantação | InlineAlert gate + FormSection/SectionCard | M | S0-04,16 | ✅ S4 |
| **UX-P1-18** | /gerente | Redirect sem flash | S | — | ✅ S4 |
| **UX-P1-19** | Toast | Rename viewport admin | S | S0-09 | ✅ S4 |
| **UX-P1-20** | Config | TabNav + FormSection | M | S0-13,17 | ✅ S4 |
| **UX-P1-21** | Vendas detalhe | Migrar sheet → DetailSheet | S | S0-15 | S1/S2 |
| **UX-P1-22** | Provisionamento | Stepper SSOT | S | S0-14 | S4 |

---

## P2 — polish (S5)

| ID | Item | Esforço |
|----|------|---------|
| UX-P2-01 | Auth → Field/Button | S |
| UX-P2-02 | Fornecedores i18n subtítulo | S |
| UX-P2-03 | Auditoria i18n + DetailSheet | S |
| UX-P2-04 | Config mobile stack | S |
| UX-P2-06 | Diagnóstico colapsar OK | S |
| UX-P2-07 | Etiquetas toast | S |
| UX-P2-08 | Dashboard densidade | M |
| UX-P2-09 | Legal TOC | S |
| UX-P2-11 | PDV token brand | S |
| UX-P2-12 | Chips/badges unificados | M |
| UX-P2-14 | Sidebar drawer se tablet | M |
| UX-P2-15 | pdv-local brand opcional | L |
| UX-P2-16 | Cores emerald/amber → tokens | S |

---

## Fora de escopo

| Item | Motivo |
|------|--------|
| Features ERP novas | Freeze |
| Unificação total tokens | Sponsor |
| Apagar `app/gerente/*` inteiro | Actions vivas |
| Redesign de tela na S0 | Escopo |
| Expandir FornecedorCombobox | Entity-SSoT |

---

## Já resolvido (não reabrir P0)

| Item | Estado |
|------|--------|
| Seletor candidatos PDV | ✅ |
| Estoque no carrinho | ✅ |
| PaginationBar | ✅ |
| Drill-down KPI | ✅ |
| Cascata `--accent` | ✅ |
| KeyHint na Finalizar (parcial branch) | Verificar antes de UX-P1-02 |

---

## Mapa Sprint ← IDs

| Sprint | IDs |
|--------|-----|
| **S0** | UX-S0-01..11, 13..27 (**bloqueia S1 até DONE**) |
| **S1** | P0-01..03, P1-02..07, P1-10, P1-21 |
| **S2** | P0-04..05, P1-11 |
| **S3** | P0-06..07, P1-09, P1-12 |
| **S4** | P1-01, P1-08, P1-13..20, P1-22 |
| **S5** | P2-* |

---

## Itens que geram retrabalho se fora de ordem

| Se fizer… | …antes de | Retrabalho |
|-----------|-----------|------------|
| P0-04 Financeiro | S0-13 TabNav | TabNav local permanente |
| P0-06 Compras | S0-04/07 | Reembrulhar lista |
| P1-09 NF-e | S0-14/18 | Wizard/dropzone paralelo |
| P0-07 Comissões | S0-06 | Date filter local |
| P1-21 sheets | S0-15 | Terceiro overlay |
| Qualquer tela admin | S0-10 lint | Entropia sem freio |
