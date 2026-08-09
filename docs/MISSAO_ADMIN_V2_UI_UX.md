# Missão Admin V2 — UI/UX (alto impacto)

**Branch:** `cursor/admin-v2-ui-ux-633a`  
**Baseline:** `AUDITORIA_FECHAMENTO_S0_S7.md`, `MISSAO_ESTOQUE_COMPRAS_ADMIN_V2.md`, RFCs S6/S7, `DESIGN_SYSTEM_CONTRACT.md`  
**Escopo:** UI/UX apenas — **sem** RPC, SSOT, schema Supabase, regras de negócio.

---

## 1. Problemas encontrados

| ID | Prioridade | Problema | Rota / área |
|----|------------|----------|-------------|
| UX-01 | P0 | Compras 100% `ComprasGerentePageClient` + `GerenteTable` | `/admin/compras` |
| UX-02 | P0 | Hub Estoque: subfluxos sem `embeddedInAdminHub` / back links redundantes | `/admin/estoque/*` |
| UX-03 | P0 | Financeiro: aba pagar com `dragon-glass-card`, `app-btn-*`, fila fiscal `text-[11px]` | `/admin/financeiro` |
| UX-04 | P1 | `GerenteToastViewport` no layout admin (fora tokens DS) | `app/admin/layout.tsx` |
| UX-05 | P1 | Funcionários: `GerenteTable` + `DataTablePage` legado | `/admin/funcionarios` |
| UX-06 | P1 | Sidebar/hubs S6 não mergeados em `main` | navegação global |

---

## 2. Correções implementadas

| ID | Correção | Comportamento |
|----|----------|---------------|
| UX-01 | `ComprasContent` (PageHeader, MetricCard, DataTable); page `admin-v2-page` | Actions OC inalteradas; modais preservados |
| UX-02 | Cherry-pick S6/S7 + `embeddedInAdminHub` recebimento/NF-e/transfer/etiquetas + `EstoqueHubNav` | Mesmas actions gerente; sem link “voltar” duplicado |
| UX-03 | `FinanceiroHubNavShell`; fiscal list tipografia DS; `ContasPagarListClient` prop `adminV2Surface` | KPIs/filtros sem dragon-glass na aba pagar; gerente puro inalterado |
| UX-04 | `AdminToastViewport` (tokens DS) substitui `GerenteToastViewport` no admin | Mesmo bus `emitGerenteToast` |
| UX-05 | `FuncionariosListClient` → `CrudListShell` + `DataTable` + forms DS | Policies/actions iguais |
| UX-06 | Hubs catálogo/estoque/financeiro + sidebar enxuta | Rotas SSOT preservadas |

---

## 3. Rotas afetadas

- `/admin/compras`
- `/admin/estoque`, `/admin/estoque/recebimento`, `importar-nfe`, `transferencias`, `imprimir-etiquetas`
- `/admin/financeiro`, `/admin/financeiro/contas-pagar` (redirect)
- `/admin/catalogo`, categorias/marcas (hub nav)
- `/admin/categorias-financeiras`
- `/admin/funcionarios`
- `/admin/dashboard`, `/admin/relatorios` (ajustes menores S7 cherry-pick)

---

## 4. Antes / depois (resumo)

| Superfície | Antes | Depois |
|------------|-------|--------|
| Compras | `GerenteStickyToolbar` + `GerenteTable` | Admin V2 list + DataTable |
| Estoque hub | PageClients gerente com back link | Hub tabs + embedded (sem back redundante) |
| Financeiro pagar | Dragon glass + app-btn | Surface admin-v2 (paper table, tokens KPI) |
| Admin toast | Gerente light theme fixo | Tokens `--color-*-border/bg` + `text-small` |
| Funcionários | GerenteTable tone dragon | DataTable + CrudListShell |

---

## 5. Testes

- Ajuste: `tests/admin-auth-resilience.test.ts` — mock `AdminToastViewport`.
- Existentes: `AdminHubTabNav.test.tsx`, `SidebarNav.behavior.test.tsx`, `adminV2SidebarNav.test.ts` (S6/S7).

**Vitest:** 858 passed.

---

## 6. Métricas DS (burndown pós-missão)

| Métrica | Antes (auditoria S0–S7) | Depois |
|---------|-------------------------|--------|
| `GerenteTable` imports | 13 files | **11 files** (Δ−6 no gate) |
| `.app-btn-*` | 38 hits / 22 files | **35 hits / 21 files** (Δ−18 hits) |
| `GerenteTable` em `app/admin/**` | 2 (funcionários + compras via gerente) | **0** |

Cobertura DS (`check:ds-sprint0`): app TSX com import DS **87/166 (52%)**; telas migradas **6/12** (financeiro ainda parcial — aba pagar melhorada, lista ainda `GerenteTable` paper).

---

## 7. `GerenteTable` removidos nesta missão

- `/admin/compras` (substituído por DataTable em `ComprasContent`)
- `/admin/funcionarios` (DataTable)

**Permanecem (fora admin ou gerente puro):** `ContasPagarListClient` (tabela interna; tone `paper` no admin), rotas `/gerente/*`, outros 11 arquivos no burndown global.

---

## 8. Resíduos legados (justificativa)

| Resíduo | Motivo |
|---------|--------|
| Modais OC (`OcFormModal` / `OcDetalheModal`) estilos gerente | Escopo: sem mudança de comportamento; migração visual futura |
| `ContasPagarListClient` ainda usa `GerenteTable` + `app-input` na aba admin | Evitar refactor massivo de 500+ linhas; surface admin-v2 já remove dragon-glass KPI |
| `app/gerente/*` PageClients | SSOT dados; reexports `@legacy` compras |
| Catálogo modals em `components/gerente/produtos/*` | Fora P0 desta missão |
| Fornecedores UI gerente | P1 backlog |

---

## 9. Gates

| Gate | Resultado |
|------|-----------|
| `npm run check:ds-sprint0` | OK |
| `npm run typecheck` | OK |
| `npm run lint` | OK (3 warnings e2e pré-existentes) |
| `npm test` | **858** OK |
| `npm run check:entity-ssot` | OK (6 avisos legado) |
| `npm run build` | OK |

---

## 10. Riscos

- **Baixo:** chrome Compras/Estoque/Financeiro — actions idênticas.
- **Médio:** KPIs Compras não refresh client-side pós-filtro (igual legado).
- **Nenhuma alteração** Supabase / Fase 3 reconciliação / migration 252.

---

## 11. Arquivos principais alterados

- `app/admin/compras/_components/ComprasContent.tsx` (novo)
- `app/admin/layout.tsx`, `components/ui/admin-v2/AdminToastViewport.tsx`
- `app/admin/financeiro/_components/FinanceiroContent.tsx`
- `app/gerente/financeiro/contas-pagar/ContasPagarListClient.tsx` (`adminV2Surface`)
- `app/admin/funcionarios/FuncionariosListClient.tsx`
- Hubs: `AdminHubTabNav`, `*HubNav*`, `lib/navigation/*`
- PageClients estoque/compras gerente (embedded + reexport)
- `tests/admin-auth-resilience.test.ts`
