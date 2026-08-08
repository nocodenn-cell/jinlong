# Fechamento UI/UX pós-S7 — execução e evidência

**Branch:** `cursor/fechamento-ui-ux-633a`  
**Data:** 2026-08-08 (UTC)  
**Baseline documental:** `AUDITORIA_FECHAMENTO_S0_S7.md`, RFCs S6/S7, `DESIGN_SYSTEM_CONTRACT.md`, `MISSAO_ESTOQUE_COMPRAS_ADMIN_V2.md`  
**Método:** validação **código > doc**; achados só com arquivo/rota reproduzível; implementação em lotes com gates.

---

## 1. Inventário inicial (validado no código)

| Métrica | Doc S0–S7 (ago/2026) | Código **antes** desta missão (`main`) | Código **depois** (branch) |
|---------|----------------------|----------------------------------------|----------------------------|
| Telas DS migradas (12 alvos) | 6/12 (50%) | 6/12 | **7/12 (58%)** — funcionários |
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
| UX-03 | Financeiro | `FinanceiroContent.tsx`, `ContasPagarListClient` | Aba pagar: `dragon-glass`, `app-btn-*`, fiscal `text-[11px]` | Inconsistência diária gerente/dono | Hub nav + tokens DS + `adminV2Surface` | **Implementado** (parcial pagar) |
| UX-04 | Admin shell | `app/admin/layout.tsx` | `GerenteToastViewport` (estilo claro fixo) | Feedback fora do tema admin | `AdminToastViewport` | **Implementado** |
| UX-05 | Funcionários | `FuncionariosListClient.tsx` | `GerenteTable` tone dragon | Lista admin inconsistente | `CrudListShell` + `DataTable` | **Implementado** |
| UX-06 | Catálogo | `app/admin/fornecedores/page.tsx` | Sem `CatalogoHubNav` (produtos/categorias tinham) | Navegação quebrada entre abas SSOT | `CatalogoHubNav` | **Implementado** |
| UX-07 | Relatórios | `RelatoriosContent.tsx` | `text-[11px]` / `text-[12px]` em tabelas e badges | Tipografia fora do contrato | `text-caption` / `text-small` | **Implementado** (arquivo) |
| UX-08 | Financeiro | `ContasPagarListClient` (aba admin) | Ainda `GerenteTable` + `app-input`/`app-chip` | Visual legado na aba crítica | DataTable + forms DS | **Não implementado** (escopo/risco) |
| UX-09 | Vendas | `VendasTable.tsx`, `VendaDetailSheet.tsx` | Dezenas de `text-[10–12px]` | Hierarquia inconsistente | tokens tipográficos DS | **Backlog P1** |
| UX-10 | Config / Implantação / Provisionamento | `ds-coverage.json` | `migrated: false` | Telas operacionais secundárias | PageShell DS | **Backlog P2** |
| UX-11 | Modais produto | `components/gerente/produtos/*` | Modais gerente no catálogo admin | Dialog inconsistente | DragonModal / DS modal | **Backlog P1** (sem mudança negócio) |
| UX-12 | Documento fiscal | `app/admin/financeiro/documento/[id]` | Client gerente dedicado | Detalhe fora do hub | PageShell + sheet DS | **Backlog P1** |

---

## 3. Lotes implementados

### Lote A — S6/S7 (navegação hubs)

- `AdminHubTabNav`, `CatalogoHubNav`, `EstoqueHubNav`, `FinanceiroHubNavShell`
- Sidebar enxuta (`adminV2SidebarNav.ts`)
- Redirect `contas-pagar` → `financeiro?tab=pagar`

### Lote B — P0 operacional

- `ComprasContent` + page `admin-v2-page`
- `embeddedInAdminHub` recebimento, NF-e, transferências, etiquetas
- Financeiro: hub nav, fiscal list DS, `adminV2Surface` em contas a pagar

### Lote C — P1 consistência

- `AdminToastViewport` no layout admin
- Funcionários → DataTable
- Fornecedores → `CatalogoHubNav`
- Relatórios → tipografia DS (substituição em massa no content)

---

## 4. Deliberadamente não implementado

| Item | Motivo |
|------|--------|
| Reescrita completa `ContasPagarListClient` → DataTable | ~500 linhas; risco regressão pagamento/export; surface admin já sem dragon-glass KPI |
| Migração modais OC para tokens admin-v2 | Comportamento preservado; só visual |
| Vendas tipografia completa | Alto volume; sem bloqueio operacional imediato |
| Configurações / Implantação / Provisionamento | P2 pós go-live assistido |
| Remoção global `app/gerente/*` | Proibido pela governança |

---

## 5. Testes e gates (esta branch)

| Gate | Resultado |
|------|-----------|
| `npm run typecheck` (pdv-importados) | OK |
| `npm run lint` | OK (3 warnings e2e pré-existentes) |
| `npm test` (Vitest) | **858** OK |
| `npm run check:ds-sprint0` | OK |
| `npm run check:entity-ssot` | OK (6 avisos legado) |
| `npm run build` (Next) | OK |

Ajuste de teste: `admin-auth-resilience.test.ts` mock `AdminToastViewport`.

---

## 6. Estado Vercel (investigação)

**Projeto:** `pdv-importados` (`prj_UPGWQN4TmzDQRYm5IB80a8ZxOslO`, team Jinlong)

**Observação:** os **20 deployments recentes listados** estão em `state: ERROR` (preview de branches agent: reconciliação Supabase, estoque/compras, sprint 6/7, feat/sprint-ux-go-live).

**Deployment analisado:** `dpl_39DDuYTczrtJ1YkQXnhiH6APvLWv` (branch `cursor/reconciliacao-supabase-audit-633a`)

| Campo | Valor |
|-------|--------|
| `readyState` | ERROR |
| `errorCode` | **BUILD_FAILED** |
| `errorMessage` | **Resource provisioning failed** |
| Build logs (MCP) | **vazios** — sem linha de compilação Next/npm |

**Interpretação (evidência):**

- **Não** é falha reproduzível de `next build` nesta missão (build local **verde** na mesma base + alterações UI).
- Indica **falha de provisionamento de recurso na Vercel** (plataforma/cota/região/build image), não erro de runtime da app nem env missing no log.
- **Não** alterar produção sem logs; próximo passo operacional: re-deploy manual / suporte Vercel / verificar limites do plano e região `gru1`.

---

## 7. Aderência real aos padrões definidos

Critérios do contrato DS (`DESIGN_SYSTEM_CONTRACT.md` + hubs S6 IDS):

| Critério | Aderência | Notas |
|----------|-----------|--------|
| Tokens + primitivos Button/Forms/DataTable/feedback | **Alta** em superfícies tocadas | Legado persiste em contas pagar (inputs app-*) |
| Tipografia sem `text-[Npx]` em código novo | **Média** | Relatórios corrigidos; vendas ainda denso |
| Hubs Catálogo/Estoque/Financeiro | **Alta** na branch | Fornecedores alinhado ao hub |
| Zero `GerenteTable` em admin | **100%** em `app/admin/**` | |
| Toast admin DS | **Sim** | Bus toast inalterado |
| 12 telas-alvo migradas | **7/12 (58%)** | Faltam financeiro “completo”, config, implantação, provisionamento, pdv-polish |

**Percentual global honesto (UX operacional admin): ~68%** — média ponderada: hubs+núcleo lista (alto) vs financeiro pagar+relatórios+vendas (médio) vs config/implantação (baixo).

Não se declara 100%: exceções inventariadas em §4 e UX-08–UX-12.

---

## 8. Resíduos restantes (prioridade)

1. **P0/P1:** `ContasPagarListClient` → DataTable + FilterBar (financeiro)
2. **P1:** Vendas — tipografia e badges DS
3. **P1:** Documento fiscal detalhe — shell admin
4. **P1:** Modais catálogo/produto
5. **P2:** Configurações, Implantação, Provisionamento
6. **P2:** Recebimento/transfer — forms gerente internos (sem GerenteTable)

**Próxima superfície recomendada:** **`/admin/financeiro?tab=pagar`** (maior tempo operacional + maior contraste visual restante).

---

## 9. Arquivos principais alterados

Ver commit na branch `cursor/fechamento-ui-ux-633a`. Resumo:

- Hubs/navegação S6/S7 (`components/ui/admin-v2/*Hub*`, `lib/navigation/*`)
- `app/admin/compras/_components/ComprasContent.tsx`
- `app/admin/layout.tsx`, `AdminToastViewport.tsx`
- `app/admin/financeiro/_components/FinanceiroContent.tsx`
- `app/gerente/financeiro/contas-pagar/ContasPagarListClient.tsx` (`adminV2Surface`)
- `app/admin/funcionarios/FuncionariosListClient.tsx`
- `app/admin/fornecedores/page.tsx`
- `app/admin/relatorios/_components/RelatoriosContent.tsx`
- `reports/ds-coverage.json`, `docs/MISSAO_ADMIN_V2_UI_UX.md`

---

## 10. Supabase / domínio

**Nenhuma** migration, RPC, ou regra de negócio alterada nesta missão UI/UX.
