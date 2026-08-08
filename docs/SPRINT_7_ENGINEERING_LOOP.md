# Sprint 7 — Engineering Loop (UX operacional dos hubs S6)

**Branch:** `cursor/sprint-7-hub-ux-633a`  
**Data fechamento:** 2026-08-08  
**Escopo:** operação real nos hubs **Catálogo**, **Estoque**, **Financeiro** e ponte **Dashboard ↔ Relatórios**. Sem alteração de SSOT, rotas canônicas, backend ou regras de negócio.

---

## 1. Tarefas operacionais auditadas

| ID | Tarefa real | Hub |
|----|-------------|-----|
| T1 | Ajustar categoria de produto enquanto revisa catálogo | Catálogo |
| T2 | Conferir recebimento após ver saldo crítico | Estoque |
| T3 | Importar NF-e após recebimento | Estoque |
| T4 | Transferir entre lojas | Estoque |
| T5 | Alternar “A receber” → “A pagar” com filtros | Financeiro |
| T6 | Editar categorias financeiras a partir do fluxo de títulos | Financeiro |
| T7 | Ir do pulso diário (dashboard) para análise por período | Análises |
| T8 | Voltar ao dashboard após relatório | Análises |

**Método:** revisão de fluxo no código (PageClients legados + hubs S6), testes de regressão (`AdminHubTabNav`, `financeiroHubQuery`, `hubOperationalPaths`), gates CI locais. Não se alterou estrutura de hubs S6 (quantidade de abas/rotas).

---

## 2. Inventário de problemas encontrados

| # | Problema | Severidade operacional | Hub |
|---|----------|------------------------|-----|
| P1 | Link “← Início/voltar” **duplicava** abas do hub estoque (+1 clique, foco errado) | Alta | Estoque |
| P2 | `admin-v2-page` **duplicado** (server wrapper + PageClient) — padding/confusão visual | Média | Estoque |
| P3 | Troca de aba no financeiro **herdava query params** de outra aba (filtros fantasma) | Alta | Financeiro |
| P4 | Abas do hub **só em PT** — operadores CN perdiam paridade com sidebar | Média | Todos |
| P5 | Abas sem **focus-visible** consistente com Admin V2 (teclado) | Média | Todos |
| P6 | 5 abas estoque em mobile **quebravam linha** sem scroll horizontal | Média | Estoque |
| P7 | Abas sumiam ao rolar listas longas (catálogo/financeiro) | Média | Catálogo/Financeiro |
| P8 | Ponte Dashboard → Relatórios **sem retorno** simétrico | Média | Análises |
| P9 | CTA Relatórios no dashboard sem **hint** de conteúdo | Baixa | Análises |

---

## 3. Evidência por problema

| Problema | Evidência |
|----------|-----------|
| P1 | `RecebimentoGerentePageClient.tsx:152-154`, `TransferenciasGerentePageClient.tsx:204-206`, `ImportarNfePageClient.tsx:402-404` — `gerente-nav-back` para `/admin/estoque` com `EstoqueHubNav` já renderizado em `app/admin/estoque/*/page.tsx`. |
| P2 | `recebimento/page.tsx:58-66` envolvia `admin-v2-page` + client com `admin-v2-page` interno. |
| P3 | `AdminHubTabNav.tsx` (S6) `FinanceiroHubNav` usava `new URLSearchParams(searchParams.toString())` ao trocar aba — propagava `cliente`, `status`, etc. |
| P4 | Labels hardcoded PT em `catalogoHubNav.ts` / `FinanceiroHubNav` (S6). |
| P5 | Links das abas sem `focus-visible:ring-*` (contraste com `SidebarNav` / `PageHeader`). |
| P6 | `flex-wrap` nas abas — em viewport estreita, abas quebram ordem visual. |
| P7 | Hub não sticky — scroll em `CatalogoTable` / listas financeiras escondia navegação. |
| P8 | `dashboard/page.tsx` (S6) link para relatórios; `RelatoriosContent.tsx:257` sem ação inversa. |
| P9 | Botão dashboard sem `title`/hint (`dashboard_link_relatorios_hint` ausente). |

---

## 4. Correções realizadas

| Problema | Correção | Arquivos principais |
|----------|----------|---------------------|
| P1, P2 | Prop `embeddedInAdminHub` oculta back link e evita wrapper `admin-v2-page` duplicado | `RecebimentoGerentePageClient`, `TransferenciasGerentePageClient`, `ImportarNfePageClient`, páginas admin estoque |
| P3 | Whitelist de query params por aba (`financeiroHrefForTab`) | `lib/navigation/financeiroHubQuery.ts` |
| P4 | i18n `admin_ui.hub_*` (pt/zh) + `CatalogoHubNav` / `EstoqueHubNav` / `FinanceiroHubNavShell` via `getMessages` | `pt.json`, `zh.json`, `hubNavLabels.ts`, hub nav components |
| P5–P7 | Sticky hub bar, `overflow-x-auto`, `focus-visible:ring`, `data-hub-tab-nav` | `AdminHubTabNav.tsx` |
| P8 | Botão “Visão geral” em Relatórios | `RelatoriosContent.tsx`, `relatorios/page.tsx` |
| P9 | `title={ui.dashboard_link_relatorios_hint}` no CTA dashboard | `dashboard/page.tsx` |

**Testes novos/atualizados:** `financeiroHubQuery.test.ts`, `AdminHubTabNav.test.tsx`, `hubOperationalPaths.test.ts` (orçamento de cliques).

---

## 5. Problemas deliberadamente não corrigidos

| Item | Motivo |
|------|--------|
| Redesign completo dos PageClients legados (recebimento/NF-e) | Fora S7; risco alto, não bloqueia tarefa com hubs |
| Arrow-key navigation estilo `role="tablist"` | Navegação por rotas reais; tabs ARIA seria falso padrão |
| Unificar botão “Importar NF-e” no header de saldos com aba hub | Dois caminhos **intencionais** (atalho vs descoberta) — S6 |
| Fundir Dashboard + Relatórios | Mudaria arquitetura de informação; S6/S7 limitam-se à ponte |
| Imprimir etiquetas PageClient (sem back link) | Já OK; só recebeu hub wrapper S6 |

---

## 6. Métricas antes / depois (operacionais + gates)

### Caminhos (cliques após entrar no módulo via sidebar)

| Fluxo | Antes (S6) | Depois (S7) |
|-------|------------|-------------|
| Estoque saldos → Recebimento | 1 aba **ou** 1 back + scroll | **1 aba** (back removido no hub) |
| Estoque recebimento → Saldos | 1 back + 0 aba = **1** (competia com aba) | **1 aba** |
| Financeiro receber → pagar (sem ruído de filtro) | 1 aba, params incorretos possíveis | **1 aba**, params whitelist |
| Dashboard ↔ Relatórios | 1 → ; volta **sidebar** (~2+) | **1 + 1** CTAs simétricos |

### Gates / qualidade

| Métrica | Antes S7 | Depois S7 |
|---------|----------|-----------|
| Vitest | 851 | **858** |
| TSX com DS (`check:ds-coverage`) | 86/165 (52%) | **86/165 (52%)** |
| Telas migradas DS | 6/12 | 6/12 |
| `check:ds-sprint0` | ✅ | ✅ |
| entity-ssot | ✅ | ✅ |
| typecheck / lint / build | ✅ | ✅ |

---

## 7. Classificação por hub (pós-correção)

| Hub | Manter | Ajuste S7 |
|-----|--------|-----------|
| Catálogo | Abas + rotas SSOT | i18n, sticky/focus/scroll abas |
| Estoque | Abas + rotas SSOT | embeddedInAdminHub, i18n abas |
| Financeiro | Abas + redirect contas-pagar (S6) | query whitelist, i18n abas |
| Dashboard ↔ Relatórios | Dois módulos | Ponte bidirecional + hint |

---

## 8. PR

Draft PR a partir de `cursor/sprint-7-hub-ux-633a` → `main` (inclui base Sprint 6 mergeada na branch).

---

## 9. Como validar em produção/staging

1. **T2:** Estoque → aba Recebimento — não deve aparecer “← Início”.
2. **T5:** Financeiro receber com `?cliente=` → aba Pagar — URL **sem** `cliente`.
3. **T7/T8:** Dashboard botão Relatórios (hint no hover) ↔ Relatórios botão Visão geral.
4. Idioma CN: abas do hub em chinês alinhadas ao restante do admin.
5. Teclado: Tab nas abas mostra anel de foco âmbar.

---

## 10. Riscos residuais

- PageClients legados mantêm densidade visual diferente do admin-v2 “puro”.
- Sticky hub pode sobrepor conteúdo se z-index conflitar com modais (não observado em testes unitários).
