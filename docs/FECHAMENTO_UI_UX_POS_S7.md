# Fechamento UI/UX pós-S7 — execução e evidência

**Branch:** `cursor/fechamento-ui-ux-633a`  
**Data:** 2026-08-08 (UTC)  
**Baseline documental:** `AUDITORIA_FECHAMENTO_S0_S7.md`, RFCs S6/S7, `DESIGN_SYSTEM_CONTRACT.md`, `MISSAO_ESTOQUE_COMPRAS_ADMIN_V2.md`  
**Método:** validação **código > doc**; achados só com arquivo/rota reproduzível; implementação em lotes com gates.

---

## 1. Inventário inicial (validado no código)

| Métrica | Doc S0–S7 (ago/2026) | Código **antes** desta missão (`main`) | Código **depois** (branch) |
|---------|----------------------|----------------------------------------|----------------------------|
| Telas DS migradas (12 alvos) | 6/12 (50%) | 6/12 | **8/12 (67%)** — funcionários + financeiro (pagar) |
| `GerenteTable` em `app/admin/**` | 2+ (compras, funcionários) | compras + funcionários | **0** |
| Hub Estoque/Financeiro/Catálogo | “só na branch S7” | ausente em `main` | **presente** (S6/S7 cherry-pick) |
| Toast admin | `GerenteToastViewport` | sim | **`AdminToastViewport`** |
| Fornecedores sem abas catálogo | citado P1 | PageHeader only | **`CatalogoHubNav`** |

**Conclusão:** vários itens P0 da auditoria estavam **corretos para `main`**, mas **já resolvidos em branches** não mergeadas; esta missão **integra S6/S7 + fechamento operacional** numa branch única de UI/UX.

---

## 2. Achados reais (código atual na branch)

Formato: `ID | superfície | arquivo/rota | problema real | impacto | padrão correto | ação`

| ID | Superfície | Arquivo / rota | Problema real | Impacto | Padrão correto | Ação |
|----|------------|----------------|---------------|---------|----------------|------|
| UX-01 | Compras | `app/admin/compras/page.tsx` | Renderizava só `ComprasGerentePageClient` + `GerenteTable` | Operador vê chrome legado fora do DS | `ComprasContent` + DataTable | **Implementado** |
| UX-02 | Estoque hub | `app/admin/estoque/*/page.tsx` | Back link + shell duplicado vs hub | Cliques/confusão navegação | `EstoqueHubNav` + `embeddedInAdminHub` | **Implementado** (S7) |
| UX-03 | Financeiro | `FinanceiroContent.tsx`, aba receber/fiscal | KPI/fila fiscal fora do padrão lista única | Inconsistência entre abas | Hub nav + tokens DS | **Implementado** (receber parcial) |
| UX-04 | Admin shell | `app/admin/layout.tsx` | `GerenteToastViewport` (estilo claro fixo) | Feedback fora do tema admin | `AdminToastViewport` | **Implementado** |
| UX-05 | Funcionários | `FuncionariosListClient.tsx` | `GerenteTable` tone dragon | Lista admin inconsistente | `CrudListShell` + `DataTable` | **Implementado** |
| UX-06 | Catálogo | `app/admin/fornecedores/page.tsx` | Sem `CatalogoHubNav` (produtos/categorias tinham) | Navegação quebrada entre abas SSOT | `CatalogoHubNav` | **Implementado** |
| UX-07 | Relatórios | `RelatoriosContent.tsx` | `text-[11px]` / `text-[12px]` em tabelas e badges | Tipografia fora do contrato | `text-caption` / `text-small` | **Implementado** (arquivo) |
| UX-08 | Financeiro | `ContasPagarListClient` → `/admin/financeiro?tab=pagar` | `GerenteTable`, `DataTablePage`, `app-input`/`app-chip`/`app-btn-*` | Aba AP crítica com chrome legado | `CrudListShell` + `MetricCard` + `DataTable` + forms DS | **Implementado** |
| UX-09 | Vendas | `VendasTable.tsx`, `VendaDetailSheet.tsx` | Dezenas de `text-[10–12px]` | Hierarquia inconsistente | tokens tipográficos DS | **Implementado** (tipografia `text-caption` / `text-small` / `text-body`) |
| UX-10 | Config / Implantação / Provisionamento | `ds-coverage.json` | `migrated: false` | Telas operacionais secundárias | PageShell DS | **Backlog P2** |
| UX-11 | Modais produto | `components/gerente/produtos/*` | Modais gerente no catálogo admin | Dialog inconsistente | DragonModal + `fp-control` DS | **Implementado** |
| UX-12 | Documento fiscal | `app/admin/financeiro/documento/[id]` | Client gerente dedicado | Detalhe fora do hub | PageShell + sheet DS | **Implementado** — hub fiscal + `SectionCard` DS |

---

## 3. Lotes implementados

### Lote A — S6/S7 (navegação hubs)

- `AdminHubTabNav`, `CatalogoHubNav`, `EstoqueHubNav`, `FinanceiroHubNavShell`
- Sidebar enxuta (`adminV2SidebarNav.ts`)
- Redirect `contas-pagar` → `financeiro?tab=pagar`

### Lote B — P0 operacional

- `ComprasContent` + page `admin-v2-page`
- `embeddedInAdminHub` recebimento, NF-e, transferências, etiquetas
- Financeiro: hub nav, fiscal list DS; **UX-08** contas a pagar → `DataTable` + `CrudListShell`

### Lote C — P1 consistência

- `AdminToastViewport` no layout admin
- Funcionários → DataTable
- Fornecedores → `CatalogoHubNav`
- Relatórios → tipografia DS (substituição em massa no content)

### Lote D — UX-08 (contas a pagar)

- `ContasPagarListClient`: removidos `GerenteTable`, `DataTablePage`, classes `app-*`; KPIs `MetricCard`; filtros `SearchInput`/`Input`/`Select`; lista `DataTable` + `rowActions`; prop `adminV2Surface` removida (rota gerente só redireciona)

---

## 4. Deliberadamente não implementado

| Item | Motivo |
|------|--------|
| Migração modais OC para tokens admin-v2 | Comportamento preservado; só visual |
| Vendas tipografia completa | Alto volume; sem bloqueio operacional imediato |
| Configurações / Implantação / Provisionamento | P2 pós go-live assistido |
| Aba receber financeiro → DataTable unificado | Comportamento OK; `ContasReceberTable` dedicada |
| Remoção global `app/gerente/*` | Proibido pela governança |

---

## 5. Testes e gates (esta branch)

| Gate | Resultado |
|------|-----------|
| `npm run typecheck` (pdv-importados) | OK |
| `npm run lint` | OK (4 warnings: 1 hooks contas-pagar resolvível; 3 e2e pré-existentes) |
| `npm test` (Vitest) | **858** OK |
| `npm run check:ds-sprint0` | OK |
| `npm run check:entity-ssot` | OK (6 avisos legado) |
| `npm run build` (Next) | OK |

Ajuste de teste: `admin-auth-resilience.test.ts` mock `AdminToastViewport`.

---

## 6. Estado Vercel (investigação 2026-08-08)

**Relatório completo:** [`docs/VERCEL_PREVIEW_PROVISIONING_INVESTIGATION_20260808.md`](./VERCEL_PREVIEW_PROVISIONING_INVESTIGATION_20260808.md)

**Resumo:** conclusão **B** — bloqueio **fora do código**. Redeploy na árvore `826b52d2` (`dpl_FNJESiM1`, branch `cursor/vercel-redeploy-826b52d-633a`) falhou igual (~632 ms, zero logs). Etapa provável: **Provisioning Integrations** (hipótese integração Supabase × env manual Preview). Último **Ready:** `dpl_4znhvKr7` (`826b52d2`). Pacote suporte: relatório §7.

**UI/UX:** retomado após remoção da integração legada `supabase-pink-village` no painel Vercel (2026-08-08). Preview/Production voltam a completar build (~3m46s observado em redeploy).

---

## 7. Aderência real aos padrões definidos

Critérios do contrato DS (`DESIGN_SYSTEM_CONTRACT.md` + hubs S6 IDS):

| Critério | Aderência | Notas |
|----------|-----------|--------|
| Tokens + primitivos Button/Forms/DataTable/feedback | **Alta** em superfícies tocadas | Aba pagar alinhada; receber ainda tabela dedicada |
| Tipografia sem `text-[Npx]` em código novo | **Média–alta** | Relatórios + vendas admin corrigidos; implantação/suspensão ainda denso |
| Hubs Catálogo/Estoque/Financeiro | **Alta** na branch | Fornecedores alinhado ao hub |
| Zero `GerenteTable` em admin | **100%** em `app/admin/**` | |
| Toast admin DS | **Sim** | Viewport `AdminToastViewport`; API `emitGerenteToast` mantida |
| 12 telas-alvo migradas | **8/12 (67%)** | Faltam config, implantação, provisionamento, pdv-polish |

**Percentual global honesto (UX operacional admin): ~74%** — hubs + listas núcleo + AP DataTable (alto); receber parcial + vendas tipografia (médio); config/implantação (baixo).

Não se declara 100%: exceções em §4 e UX-09–UX-12.

---

## 8. Varredura `app/admin/**` (pós UX-08)

| Padrão | Ocorrências em admin | Classificação | Ação nesta missão |
|--------|----------------------|---------------|-------------------|
| `GerenteTable` | **0** | — | — |
| `GerenteStickyToolbar` | **0** | — | — |
| `dragon-glass-card` | **0** | — | — |
| `app-btn-*` | **0** | — | — |
| `emitGerenteToast` | vários arquivos | **Justificado** | API de toast compartilhada; viewport admin já é DS |
| `text-[10–12px]` | vendas, suspensão, implantação, relatórios filtros | **P1 backlog** | Não refatorado (UX-09+) |
| Tabela HTML manual | `ImplantacaoChecklistClient` | **P2** | Fora de P0/P1 |

**Regressões UX-08:** nenhuma detectada nos gates automatizados; matriz P0 (`p0-roteiro-operacional`, `p0-venda-homologacao`) continua verde.

---

## 9. Resíduos restantes (prioridade)

1. **P2:** Configurações, Implantação, Provisionamento (UX-10)
2. **P2:** Financeiro aba receber — unificar visual com DS (sem mudar RPCs)

**Próxima superfície recomendada:** **UX-10** (config/implantação) ou polish PDV `app-accent-text`.

### 9.2 UX-11 — modais catálogo (fechado 2026-08-08)

Ver `pdv-importados/docs/UX-11_MODAIS_CATALOGO_AUDIT.md`. Gates: typecheck OK; Vitest `components/gerente/produtos` **69/69**.

### 9.1 PDV — polish (Onda 12, em andamento)

| ID | Problema | Impacto | Status |
|----|----------|---------|--------|
| UX-PDV-01 | `app/caixa/error.tsx` com botões Tailwind crus (`blue-600` / `slate`) fora do DS | Falha no PDV = tela alienada, baixa legibilidade, foco inconsistente | **Implementado** — `ErrorState` + `Button` DS, root `caixa-oriental-root` |
| UX-PDV-02 | Tipografia `text-[10–11px]` densa no carrinho / histórico / chrome PDV | Turno longo, leitura à distância | **Fechado + Preview** — commit `26dca96a`; Preview `dpl_2k6BB4z` READY |
| UX-PDV-03 | Skeletons caixa ainda usam classes `app-*` legadas | Loading visual inconsistente | **Implementado** — commit `c4c92af8`; `CaixaLoadingStates.tsx` tokens DS |

**Gates UX-PDV-02** (`26dca96a`):

| Comando / evidência | Resultado (2026-08-08) |
|---------|------------------------|
| `npm run typecheck` (pdv-importados) | OK |
| `npm test -- --run CaixaCartList` | 4/4 OK |
| Vercel Preview (árvore 26dca96) | `dpl_2k6BB4z` **READY** — ver `pdv-importados/docs/PREVIEW_VALIDATION_20260808.md` |

**Gates UX-PDV-03** (`c4c92af8`):

| Comando | Resultado (2026-08-08) |
|---------|------------------------|
| `npm run typecheck` | OK |
| `npm test -- --run CaixaCartList` | 4/4 OK |

**Gates UX-09** (tipografia vendas admin):

| Comando | Resultado (2026-08-08) |
|---------|------------------------|
| `npm run typecheck` | OK |
| `npm test -- --run Vendas` | 7/7 OK (actions + parse forms gerente) |

---

## 10. Arquivos principais alterados

Ver commits na branch `cursor/fechamento-ui-ux-633a`. Resumo (incl. UX-08):

- Hubs/navegação S6/S7 (`components/ui/admin-v2/*Hub*`, `lib/navigation/*`)
- `app/admin/compras/_components/ComprasContent.tsx`
- `app/admin/layout.tsx`, `AdminToastViewport.tsx`
- `app/admin/financeiro/_components/FinanceiroContent.tsx`
- `app/gerente/financeiro/contas-pagar/ContasPagarListClient.tsx` (**UX-08:** DataTable + CrudListShell)
- `app/admin/funcionarios/FuncionariosListClient.tsx`
- `app/admin/fornecedores/page.tsx`
- `app/admin/relatorios/_components/RelatoriosContent.tsx`
- `scripts/ds-coverage.mjs`, `reports/ds-coverage.json`, `reports/ds-legacy-burndown.json`
- `docs/FECHAMENTO_UI_UX_POS_S7.md`, `docs/MISSAO_ADMIN_V2_UI_UX.md`

---

## 11. Supabase / domínio

**Nenhuma** migration, RPC, ou regra de negócio alterada nesta missão UI/UX.
