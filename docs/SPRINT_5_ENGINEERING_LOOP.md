# Sprint 5 — Engineering Loop (Polish + eliminação de entropia)

| Campo | Valor |
|--------|--------|
| **Abertura** | 2026-08-07 (após aceite Sprint 4) |
| **Fechamento** | 2026-08-07 |
| **RFCs** | [`UI_UX_RFC.md`](./UI_UX_RFC.md) 021–025 |
| **Branch** | `feat/sprint-ux-go-live` |
| **Estado** | **FECHADA** |
| **Aderência DS** | Pré ~88% → Pós **~92%** (não 100% — ver exceções) |

---

## 1. Auditoria de fechamento S0–S4 (inventário inicial)

Busca explícita pós-S4. Classificação: **A** eliminar agora · **B** exceção legítima · **C** dívida residual documentada.

| Resíduo | Onde | Classe | Ação S5 |
|--------|------|--------|---------|
| `GerenteTable` + `DataTableSkeleton` + `TabelaCadastroPadrao` | só stack morta | **A** | Removidos (0 imports de rota) |
| `DataTablePage` | zero consumers app | **A** | Removido + teste |
| `CadastroFormModal` / `FiltroLateralCadastro` | órfãos | **A** | Removidos |
| `GerenteLayoutShell` + `GerenteHeaderNav` + drawers | mortos pós redirect `/gerente` | **A** | Removidos; allowlist `fixed inset-0` limpa |
| `app-btn-*` em LanguageToggle / CadastroFormModal | admin | **A** | LanguageToggle → `Button`; modal morto |
| `app-btn-*` em `CaixaLoadingStates` | PDV | **B** | EXC-02 — permanece |
| `dragon-glass` em CadastroRapidoBlock | Recebimento | **A** | Tokens Admin V2 |
| `dragon-glass-backdrop` em DragonModal | SSOT | **B** | Mantido |
| `alert()` etiquetas PDF | admin | **A** | → `emitToast` |
| `window.confirm` | — | — | Já zero |
| `fixed inset-0` PDV sheets | caixa | **B** | EXC-01/02 |
| `fixed inset-0` DragonModal/DetailSheet | SSOT | **B** | Mantido |
| Toast aliases `GerenteToast*` / `emitGerenteToast` | lib | **B** | Deprecated documentado |
| Filtros locais categorias/marcas | admin | **A** | → `FilterBar` URL |
| `<select>` clientes em Financeiro receber | truncado página 1 | **A** | → `EntityLookup` |
| `<select>` enums Config/Funcionário/Fiscal | listas curtas | **B** | OK (não catálogo longo) |
| `<select>` form produto / OC | legado form | **C** | Fora sem redesign form produto |
| `FornecedorCombobox` inline | form produto | **B/C** | EXC-06 — não expandir |
| `admin-v2-btn-*` / alert Diagnóstico / Financeiro | admin | **A** | `Button` + `InlineAlert` |
| Empty emoji Auditoria | admin | **A** | `EmptyState` |
| PageHeader sem PageShell (clientes/fornecedores/cadastros/auditoria/diagnóstico/provisionamento) | admin | **A** | Migrados |
| Dashboard sem PageShell | overview | **B** | Composição própria (KPIs densos) |
| Infinite scroll clientes/fornecedores/AP | cadastro longo | **B** | EXC-04 |
| Auth `login-premium` / hex auth | auth | **B** | EXC-03 |
| `text-[Npx]` residual | várias telas | **C** | Burndown 164 (↓112) — polish contínuo |
| Mini-tables relatórios | margem/ABC | **B** | EXC-05 |

---

## 2. Inventário final (re-auditoria pós-S5)

| Indicador | Pré-S5 | Pós-S5 |
|-----------|-------:|-------:|
| `GerenteTable` imports | 2 | **0** |
| `DataTablePage` consumers | 0 (órfão) | **arquivo removido** |
| `app-btn-*` hits (burndown) | 6 | **3** (só PDV EXC-02) |
| `alert()` admin | 1 | **0** |
| `admin-v2-btn-*` em `app/` | vários | **0** |
| Drawers gerente na allowlist DS | 2 | **0** |
| text-[Npx] hits | 202 | **164** |
| Aderência DS (roadmap) | ~88 | **~92** |

### Exceções restantes (honestas — não são 100%)

| ID | O quê | Por quê permanece |
|----|-------|-------------------|
| EXC-01 | Shell PDV | Teclado-first / balcão |
| EXC-02 | Toast/banner PDV + `app-btn` loading PDV | Contrato bip ≠ toast painel |
| EXC-03 | Auth ceremonial | Tokens próprios até unificação sponsor |
| EXC-04 | Infinite scroll cadastros longos | UX lista longa; PaginationBar infinite OK |
| EXC-05 | Mini-`<table>` analítica em Relatórios | Densidade; EmptyState alinhado |
| EXC-06 | `FornecedorCombobox` | Dívida entity-SSoT — não expandir |
| EXC-07 | Diagnóstico densidade utilitária | Interno; agora com InlineAlert/PageShell |
| Alias toast | `GerenteToastViewport` / `emitGerenteToast` | Compat imports; API canônica = `emitToast` |
| CSS `.app-btn-*` / `.dragon-glass-*` | theme CSS | PDV + DragonModal até unificar tokens |
| Dashboard | sem PageShell rígido | Overview com layout próprio |

### Dívida C residual (não bloqueia fechamento S5)

1. Form produto / OC: `<select>` nativos em seções fiscais/comerciais — migrar para Field/Select DS em PR dedicado.
2. `text-[Npx]` residual (~164) — burndown contínuo, sem big-bang.
3. Dual `LanguageToggle` (caixa vs gerente) — unificar quando tocar PDV brand.
4. Relatórios ainda carregam pacote único server-side (TabNav só esconde seções) — fetch-by-tab opcional futuro.

---

## 3. Entregas S5

| Tema | Entrega |
|------|---------|
| Entropia morta | Remoção GerenteTable/DataTablePage/shell gerente/drawers/órfãos cadastro |
| Cadastros | PageShell+FilterBar categorias/marcas; PageShell clientes/fornecedores |
| Financeiro | EntityLookup cliente no “Novo título”; Button SSOT |
| Admin polish | Auditoria FilterBar+EmptyState; Diagnóstico InlineAlert; Etiquetas toast+PageShell; Provisionamento Stepper+PageShell |
| Feedback | ConfirmActionButton → Button SSOT |
| Docs | RFCs 021–025 |

### Telas fundidas / eliminadas / reorganizadas

| Ação | Item |
|------|------|
| **Eliminadas (código morto)** | Stack GerenteTable/DataTablePage/LayoutShell/HeaderNav/MobileDrawer/ActivityRail/TabelaCadastro/FiltroLateral/CadastroFormModal |
| **Reorganizadas** | Categorias/marcas filtros → header FilterBar; Auditoria pills → FilterBar; Financeiro cliente → lookup |
| **Não fundidas (decisão)** | Diagnóstico ≠ Implantação; Dashboard ≠ Relatórios; Suspensão ≠ Config (já RFC-018) |

---

## 4. Ganhos de UX

- Operador não encontra paradigma de tabela fantasma no código/nav legado.
- Categorias/marcas filtráveis como o resto do admin (URL compartilhável).
- Criar título a receber não esconde clientes além da página 1.
- Kill-switch / diagnóstico / provisionamento com feedback DS coerente.
- Menos cliques cognitivos: filtros no header, empty honesto, confirmação tipada.

---

## 5. Gates executados

| Gate | Resultado |
|------|-----------|
| `check:ds-sprint0` | ✅ |
| `check:ds-burndown` | ✅ GerenteTable=0 · app-btn=3 (PDV) |
| `tsc --noEmit` | ✅ |
| eslint | ✅ 0 errors |
| vitest (UI + auth + consolidação + policies) | ✅ 87 tests |
| `check:entity-ssot` | ✅ (1 aviso EXC-06) |
| `next build` | ✅ |

---

## 6. Problemas ainda existentes

Documentados na §2 (exceções B + dívida C). Nenhum P0/P1 de paradigma duplicado **vivo** em rotas admin após re-auditoria.

Sprint 5 **não** declara 100% de aderência: PDV/Auth/EXC-06 e CSS legado permanecem por decisão de produto/risco.

---

## DoD

- [x] Inventário A/B/C publicado
- [x] Itens A eliminados ou migrados
- [x] Re-auditoria sem novos problemas relevantes em rotas admin
- [x] RFCs 021–025
- [x] Gates + **build** verdes
- [x] Métricas roadmap atualizadas
