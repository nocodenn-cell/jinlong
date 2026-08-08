# Auditoria de fechamento — S0–S7 (UX · Design System · Hubs)

**Data:** 2026-08-08  
**Método:** inspeção do repositório real (`pdv-importados`, `shared-core`, `docs`), gates locais (`check:ds-sprint0`, `check:ds-burndown`, `check:ds-coverage`, `check:entity-ssot`), cruzamento com `SPRINT_6/7_ENGINEERING_LOOP.md`, `AUDITORIA_CONSISTENCIA_VISUAL.md`, `GOVERNANCA_PMO_JINLONG.md`.  
**Escopo:** resíduos UX/UI, navegação, DS, fluxos operacionais. **Sem implementação** nesta etapa.  
**Nota de baseline git:** S6/S7 estão mergeadas na branch `cursor/sprint-7-hub-ux-633a` (PRs #264/#265); **`main` ainda não contém hubs** no momento da auditoria (`adminV2SidebarNav.ts` em `main` ainda lista categorias/recebimento no CORE).

---

## 1. Mapa S0–S7 (o que cada “sprint” significa aqui)

| ID | Escopo declarado | Artefato / gate | Aderência real (honesta) |
|----|------------------|---------------|---------------------------|
| **S0** | Fundação DS Fase 0 + contrato visual; gate `check:ds-sprint0` | `DESIGN_SYSTEM_CONTRACT.md`, `guard:design-system`, `styles/tokens/*`, `app/globals.css` import tokens | **Parcial (~65%)** — gate verde; tokens carregam em produção (`globals.css:1`); burndown legado longe de zero; docs históricos (FASE_6) parcialmente obsoletos |
| **S1** | Onda DS: Login | `ONDA3_LOGIN_PDV_MIGRATION.md` | **Alto (~85%)** — tela marcada migrada em `ds-coverage.json` |
| **S2** | Onda DS: PDV 1ª passagem | Onda 3 | **Alto (~80%)** — migrada; polish final pendente (item 12 do contrato DS) |
| **S3** | Onda DS: Dashboard | Onda 4 | **Médio (~70%)** — migrada; 5 componentes exclusivos dashboard (`ds-coverage`) |
| **S4** | Onda DS: Catálogo (produtos + taxonomias + fornecedores) | Onda 5 | **Médio (~75%)** — catálogo admin-v2; modais ainda em `components/gerente/produtos/*`; 2 exclusivos catálogo |
| **S5** | Onda DS: Clientes + Estoque | Ondas 6–7 | **Médio (~60%)** — clientes migrados (0 exclusivos); estoque lista admin-v2 mas **subfluxos hub ainda PageClients gerente** |
| **S6** | IA de navegação — hubs Catálogo/Estoque/Financeiro | `SPRINT_6_*`, RFC-S6-* | **Entregue na branch** — sidebar −25% CORE; hubs documentados no IDS; **não verificável em `main` até merge** |
| **S7** | UX operacional dos hubs (cliques, i18n abas, financeiro query, ponte relatórios) | `SPRINT_7_*` | **Entregue na branch** — testes 858; **não verificável em `main` até merge** |

**Aderência global S0–S7 (UX/DS): ~62%** — gates automatizados passam, mas **50% das telas-alvo DS migradas**, **52% dos TSX admin com import DS**, e **superfície gerente ainda acoplada** ao admin vivo.

*(Sprints PMO 1–5 do `PLANO_EXECUTIVO_EXECUCAO_JINLONG.md` são programa banco/P0/fiscal/PDV — fora deste score UX; bloqueadores Go-Live continuam listados na §8.)*

---

## 2. Métricas objetivas (snapshot 2026-08-08, branch S7)

| Métrica | Valor | Meta declarada | Gap |
|---------|-------|----------------|-----|
| Telas DS migradas | **6/12 (50%)** | 12/12 | Financeiro, Funcionários, Configurações, Implantação, Provisionamento, PDV polish |
| App TSX com import DS | **86/165 (52%)** | ~100% pós-migração | 79 arquivos sem padrão DS explícito |
| Exclusivos por módulo | **8** | 0 | dashboard 5, catalogo 2, estoque 1 |
| Burndown `.app-btn-*` | 38 hits / 22 files | 0 | Legado ativo |
| Burndown `text-[Npx]` | **331 hits / 73 files** | 0 | Tipografia arbitrária em admin vivo |
| Burndown `GerenteTable` | 13 hits | 0 | Funcionários, compras, legado |
| Entity-SSOT | **OK** (6 avisos) | 0 avisos | Orphans `@legacy` gerente |
| Vitest (branch S7) | **858** | — | — |

---

## 3. Inventário de resíduos UX (classificação P0 / P1 / P2)

### P0 — Impacto operacional ou usabilidade silenciosa antes Go-Live (UX)

| ID | Resíduo | Evidência | Go-Live |
|----|---------|-----------|---------|
| UX-P0-01 | **Hub Estoque: subfluxos ainda UI legado** (densidade, tipografia, `GerenteTable`/padrões gerente) dentro de rotas admin | `app/admin/estoque/recebimento/page.tsx` → `RecebimentoGerentePageClient`; `importar-nfe` → `ImportarNfePageClient`; `imprimir-etiquetas` → `ImprimirEtiquetasPageClient` (`app/gerente/...`) | **Corrigir** (shell admin-v2 consistente; S7 só removeu back link) |
| UX-P0-02 | **Compras (`/admin/compras`) fora do Admin V2** — tela inteira `ComprasGerentePageClient` + `GerenteTable` | `app/admin/compras/page.tsx:32-38` renderiza só client gerente, sem `AdminV2Shell` chrome local | **Corrigir** (fluxo “Mais” ainda crítico para reposição) |
| UX-P0-03 | **Financeiro marcado não migrado no DS** — mix admin-v2 + `ContasPagarListClient` + badges `text-[11px]` | `reports/ds-coverage.json` `"financeiro".migrated: false`; `FinanceiroContent.tsx:69-88` | **Corrigir** (tarefa diária gerente/dono) |
| UX-P0-04 | **Toast global admin = `GerenteToastViewport`** — feedback visual fora do contrato feedback DS | `app/admin/layout.tsx:7,54` | **Corrigir** ou formalizar exceção IDS (hoje não documentada como exceção) |

### P1 — Fricção relevante; não bloqueia caixa, bloqueia confiança do operador

| ID | Resíduo | Evidência |
|----|---------|-----------|
| UX-P1-01 | **Duplicação de camada `app/gerente/*`** — actions + PageClients ainda SSOT de dados para admin | 50+ imports `@/app/gerente/` sob `app/admin/**` (grep 2026-08-08) |
| UX-P1-02 | **Fornecedores: UI 100% gerente** | `app/admin/fornecedores/page.tsx:3` → `FornecedoresListClient` |
| UX-P1-03 | **Funcionários: `GerenteTable` + `DataTablePage`** | `app/admin/funcionarios/FuncionariosListClient.tsx:6-7` |
| UX-P1-04 | **Catálogo: modais CRUD em `components/gerente/produtos/*`** | `CatalogoTable.tsx:20-22` (`NovoProdutoModal`, `ProdutosEditarCatalogoModal`, …) |
| UX-P1-05 | **Relatórios: tipografia arbitrária + tabelas HTML cruas** | `RelatoriosContent.tsx` múltiplos `text-[11px]`, `text-[12px]` (ex.: L91, L155) |
| UX-P1-06 | **Dashboard vs Relatórios — overlap de KPIs/gráficos** sem hub “Análises” | Dashboard charts + `RelatoriosContent` charts; S6/S7 só ponte 1 clique |
| UX-P1-07 | **Etiquetas: sem `embeddedInAdminHub`** (S7 aplicou só recebimento/transfer/NF-e) | `ImprimirEtiquetasPageClient` — props só `idioma` (`ImprimirEtiquetasPageClient.tsx:24-28`) |
| UX-P1-08 | **Documento fiscal detalhe — client gerente** | `app/admin/financeiro/documento/[id]/page.tsx:10` |
| UX-P1-09 | **Acessibilidade Fase 3 incompleta** — sem axe-core gate CI | `GOVERNANCA_SPRINT_FASE_3.md` P0-1; grep `axe-core` só em docs/`ARIA_IMPLEMENTATION.md` |
| UX-P1-10 | **`theme-oriental.css` ainda redefine `--accent` em hex** após tokens | `styles/theme-oriental.css:13,34` vs `styles/tokens/aliases.css:15` — risco de cascata (parcialmente mitigado: `tailwind.config.js:54-56` usa `--color-brand`) |

### P2 — Dívida visual/navegação; pode aguardar pós Go-Live assistido

| ID | Resíduo | Evidência |
|----|---------|-----------|
| UX-P2-01 | Árvore `app/gerente/*` órfã (sem `page.tsx`) — ruído de manutenção | `AUDITORIA_CONSISTENCIA_VISUAL.md` §0; `check:entity-ssot` orphans |
| UX-P2-02 | **Configurações / Implantação / Provisionamento** não migrados DS | `ds-coverage.json` migrated: false |
| UX-P2-03 | **Dois caminhos Importar NF-e** (aba hub + botão saldos) — intencional S6/S7 | `app/admin/estoque/page.tsx` PageActions + `ESTOQUE_HUB_TABS` |
| UX-P2-04 | Hub tabs: sem navegação por setas (só Tab entre links) | `AdminHubTabNav.tsx` — links, não `tablist` (decisão S7) |
| UX-P2-05 | Vendas admin — badges `text-[11px]` | `VendasTable.tsx`, `vendas/page.tsx` |
| UX-P2-06 | Cores semânticas hex em charts/PDV (legado auditoria visual) | `SalesTrendChart.tsx`, `CaixaMovimentacaoModal.tsx` — `AUDITORIA_CONSISTENCIA_VISUAL.md` P1-03 |
| UX-P2-07 | `FornecedorCombobox` atalho SSOT exceção | `check:entity-ssot` `[ssot:shortcut]` |
| UX-P2-08 | Docs duplicados/conflitantes (amber vs blue Bling) | `FASE_6_DESIGN_SYSTEM_AUDIT.md` §62-68; `UX_AUDIT.md` |

---

## 4. Duplicações (telas, rotas, componentes, padrões)

### Rotas / superfícies

| Tipo | Descrição | Evidência | Status |
|------|-----------|-----------|--------|
| Redirect | `/admin/financeiro/contas-pagar` → `?tab=pagar` | `contas-pagar/page.tsx` (S6) | OK — não é duplicação operacional |
| Redirect | `/admin/catalogo/novo` → `?modal=novo` | `catalogo/novo/page.tsx` | OK |
| Paralelo morto | `/gerente/*` catch-all → admin | `routes.ts` `LEGACY_GERENTE_REDIRECTS` | Redirect OK; **código fonte duplicado** permanece |
| Sobreposição funcional | Dashboard KPIs ↔ Relatórios resumo | Duas implementações de charts | **Duplicação de informação**, não de rota |

### Componentes / padrões

| Padrão A | Padrão B | Onde |
|----------|----------|------|
| `DataTable` (DS) | `GerenteTable` | Funcionários, Compras, legado |
| `PageHeader` + `CrudListShell` | `GerenteStickyToolbar` + `GerenteTable` | Compras vs Catálogo/Estoque lista |
| `components/ui/feedback/*` | `emitGerenteToast` + `GerenteToastViewport` | Admin layout + ações financeiro/catálogo |
| `Field`/`forms` DS | Formulários gerente inline | Recebimento, transferências, NF-e |
| Hub `AdminHubTabNav` | Sidebar CORE | S6 — **complementar**, não duplicado |

---

## 5. Inconsistências Design System (restantes)

| Área | Problema | Severidade | Evidência |
|------|----------|------------|-----------|
| Cobertura | 50% telas migradas | P1 | `ds-coverage.json` |
| Tipografia | `text-[Npx]` massivo em admin | P1 | burndown 331 hits; relatórios/vendas/financeiro |
| Botões legado | `.app-btn-*` | P2 | burndown 38 hits |
| Tokens | `--accent` hex em `theme-oriental.css` | P2 | conflito potencial com aliases |
| Feedback | Toast não é `feedback/Toast` DS | P0 | `GerenteToastViewport` |
| Charts | Componentes exclusivos dashboard | P2 | 5 arquivos listados em coverage |
| Modais produto | `DragonModal` vs modais gerente custom | P1 | `components/gerente/produtos/*` |

---

## 6. Navegação · acessibilidade · responsividade

| Tema | Estado pós-S7 (branch) | Resíduo |
|------|------------------------|---------|
| Navegação hubs | CORE 9 itens; abas sticky + scroll horizontal | Compras/Fornecedores fora de hub; etiquetas sem paridade `embeddedInAdminHub` |
| Descoberta | Ponte Dashboard ↔ Relatórios | Overlap conteúdo permanece |
| Teclado | Focus ring abas hub | Sem roving tabindex/setas; modais legados não auditados nesta passagem |
| Mobile | `overflow-x-auto` abas | PageClients gerente podem overflow horizontal próprio |
| ARIA / WCAG | Landmarks admin-v2 shell | Fase 3.2+ pendente; sem gate axe CI |
| i18n | Abas hub pt/zh (S7) | Títulos de página legado recebimento/NF-e ainda via `m.gerente.*` only |

---

## 7. Fluxos operacionais críticos — atrito remanescente

| Fluxo | Cliques / descoberta (pós-S7 branch) | Atrito principal |
|-------|--------------------------------------|------------------|
| Cadastrar produto + categoria | Sidebar Catálogo → aba Categorias (1) | Modal produto ainda gerente; lote/tags deferido (`catalogo/page.tsx` comentário L15) |
| Receber mercadoria | Estoque → aba Recebimento (1) | UI legado; empty state OK link catálogo (`RecebimentoGerentePageClient.tsx:156-168`) |
| Importar NF-e | Aba ou botão saldos (1) | Wizard denso legado; erros via toast gerente |
| Pagar fornecedor | Financeiro → aba Pagar (1) | `ContasPagarListClient` visual gerente |
| Compras OC | Sidebar Mais → Compras (2+) | **Tela gerente completa** — maior outlier pós-hubs |
| Fechamento dia | Dashboard → Relatórios (1) | Dois módulos com métricas similares |
| Etiquetas | Estoque → aba Etiquetas (1) | Client legado; `bg-blue-600` histórico (auditoria visual) |

---

## 8. Dívida UX **deliberadamente preservada** (S6–S7)

Registro explícito das RFCs/relatórios S6/S7 — **não é backlog esquecido**:

| Decisão | Motivo | Referência |
|---------|--------|------------|
| Manter rotas SSOT separadas por aba | Entity-SSOT | RFC-S6-001/002/003 |
| Não fundir Dashboard + Relatórios | IA de informação distinta | SPRINT_6 § deliberadamente não feito |
| Dois caminhos Importar NF-e | Atalho saldos + descoberta aba | SPRINT_7 §5 |
| Não redesenhar PageClients legados hub | Escopo/risco | SPRINT_7 §5 |
| Não expandir hubs (novas abas/módulos) | Sprint 7 fechada | instrução produto |
| `FornecedorCombobox` inline | Exceção SSOT documentada | entity-ssot |
| Redirect contas-pagar | Superfície única financeiro | RFC-S6-003 |

---

## 9. Go-Live vs pode aguardar (somente eixo UX)

### Corrigir antes do Go-Live (UX operacional)

1. **UX-P0-02 Compras** — única rota “Mais” ainda 100% gerente.  
2. **UX-P0-01 Estoque hub subfluxos** — consistência mínima admin-v2 (recebimento, NF-e, etiquetas).  
3. **UX-P0-03 Financeiro** — migração DS alinhada ao hub (incl. pagar/receber/fiscal).  
4. **UX-P0-04 Toast admin** — padronizar feedback ou exceção IDS assinada.  
5. **Merge S6+S7 para `main`** — senão operadores em produção não recebem hubs.

*(Bloqueadores não-UX de Go-Live permanecem em `GOVERNANCA_PMO_JINLONG.md` §6: migrations, P0 checklist, fiscal, RLS, E2E mutadores, etc.)*

### Pode aguardar (pós Go-Live assistido)

- Remoção árvore `app/gerente/*` (P2-01)  
- Configurações/Implantação/Provisionamento DS (P2-02)  
- Hub “Análises” Dashboard+Relatórios (P1-06)  
- Axe CI / Fase 3 ARIA completa (P1-09)  
- Burndown `text-[Npx]` global (P1-05 espalhado)  
- Polish PDV final (contrato DS item 12)

---

## 10. Próxima frente recomendada (maior impacto operacional)

**Frente única sugerida (pré-Sprint 8): “Estoque hub + Compras — paridade Admin V2 operacional”**

1. **Recebimento · Importar NF-e · Etiquetas · Compras** — substituir chrome gerente por composição `PageHeader` + `SectionCard` + `DataTable`/`forms` DS, **sem mover actions/RLS** (mesmo padrão S5 lista estoque).  
2. **Critério de sucesso:** operador conclui T2–T4 + OC (§7) com **mesma contagem de cliques** pós-S7, porém **zero `GerenteTable`/back link** e **toast DS ou exceção documentada**.  
3. **Por que esta frente:** concentra o atrito diário pós-hubs (logística + reposição); Financeiro pode ser onda seguinte em paralelo se capacidade permitir.

**Não iniciar Sprint 8** até aprovação deste inventário e priorização explícita desta frente (ou alternativa).

---

## 11. Documentos atualizados / referências

| Documento | Papel |
|-----------|--------|
| **Este arquivo** | Fechamento auditoria S0–S7 |
| `docs/SPRINT_6_ENGINEERING_LOOP.md` | Entrega hubs IA |
| `docs/SPRINT_7_ENGINEERING_LOOP.md` | Entrega operacional hubs |
| `docs/architecture/DESIGN_SYSTEM_CONTRACT.md` | IDS hubs (S6) |
| `docs/AUDITORIA_CONSISTENCIA_VISUAL.md` | Baseline visual 2026-07-09 (vários itens parcialmente mitigados) |
| `docs/GOVERNANCA_PMO_JINLONG.md` | Go-Live não-UX |

---

## 12. Gates executados nesta auditoria (sem alteração de código)

```bash
cd pdv-importados && npm run check:ds-sprint0
npm run check:entity-ssot
# (branch S7) npm run test → 858 passed [executado no ciclo S7]
```

**Resultado:** gates DS/SSOT **verdes**; aderência **qualitativa** conforme §1–2.
