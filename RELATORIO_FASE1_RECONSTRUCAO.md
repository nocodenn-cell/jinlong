# Relatório — Fase 1 (Reconstrução Controlada do Jinlong)

**Data:** 2026-07-15
**Branch:** `claude/jinlong-rebuild-9c9sq2`
**Escopo:** Fase 1 da missão de reconstrução (estabilização), com Operação Clean Slate aplicada ao módulo Compras.

---

## 1.1 Gráficos — eliminação definitiva de `width(-1)/height(-1)`

O warning do recharts (`The width(-1) and height(-1) of chart should be greater than 0`) ocorre quando `ResponsiveContainer` mede um contêiner sem dimensões (primeiro paint, aba oculta, flex sem altura). O guard rail `ChartLayoutGate` (ResizeObserver, só renderiza com `width > 0 && height > 0`) já existia, mas 2 de 4 gráficos não o usavam.

| Arquivo | Antes | Depois |
|---|---|---|
| `app/admin/relatorios/_components/RelatoriosBarChart.tsx` | `ResponsiveContainer` sem gate | Envolvido em `ChartLayoutGate` |
| `app/gerente/relatorios/vendas/RelatorioVendasChart.tsx` | `ResponsiveContainer` sem gate | Envolvido em `ChartLayoutGate` |
| `app/admin/dashboard/SalesTrendChart.tsx` | Gate **duplicado**: `useState(ready)` + `useEffect` + `ChartLayoutGate` | Estado de montagem removido; só `ChartLayoutGate` com `fallback` custom (menos 1 estado, menos 1 efeito) |
| `app/admin/dashboard/_components/PaymentDonutChart.tsx` | Já usava gate | Sem alteração |

Nenhum gráfico é renderizado em aba oculta (auditado: `RelatoriosContent`, dashboard).

## 1.2 Loader entre abas

Navegação entre telas do admin mostrava um retângulo vazio (`app/admin/loading.tsx` era um `div` de 40vh sem conteúdo); no shell gerente não havia `loading.tsx` algum (tela congelada durante RSC fetch).

- `app/admin/loading.tsx`: skeleton estrutural que espelha o layout Admin V2 (PageHeader + grid de KPIs + SectionCard com linhas de tabela) — feedback imediato e sem layout shift.
- `app/gerente/loading.tsx`: novo, skeleton equivalente para o shell gerente.

Ambos usam o primitivo `Skeleton` existente — nenhum componente novo.

## 1.3 Tela Compras — reconstrução (Clean Slate)

`/admin/compras` era um wrapper fino sobre o shell **legado** do gerente (`ComprasGerentePageClient`, marcado `@legacy — NÃO reutilizar em fluxos novos`): client component com estado de filtros duplicando a URL, `useEffect` com debounce manual, KPIs em `dragon-glass-card`, tabela `GerenteTable` e modais fora do primitivo `DragonModal`.

Reconstruído no padrão Admin V2 (espelhado de Estoque/Vendas):

**Novos arquivos**
- `app/admin/compras/page.tsx` — Server Component; searchParams (`q`, `status`, `page`) são a única fonte de verdade dos filtros; `PageHeader` + `MetricCard` (4 KPIs) + `FilterBar` (busca debounced + pills de status) + `SectionCard` + paginação numerada server-side.
- `app/admin/compras/actions.ts` — actions movidas de `app/gerente/compras/actions.ts` sem mudança de lógica de domínio; `revalidatePath` agora aponta para as rotas canônicas (`ROUTES.admin.compras`, `ROUTES.admin.estoque`).
- `app/admin/compras/_components/ComprasClient.tsx` — orquestrador cliente mínimo: `DataTable` (ordenação client-side, linha → detalhe) + estado dos dois modais + `router.refresh()` pós-mutação.
- `app/admin/compras/_components/OcFormModal.tsx` — formulário de OC portado para o primitivo `DragonModal` (único caminho aceito para diálogo) com inputs `admin-v2-input` e botões `admin-v2-btn-*`; labels associados por `htmlFor`.
- `app/admin/compras/_components/OcDetalheModal.tsx` — detalhe/transições de status/recebimento no `DragonModal`; badges `admin-v2-badge-*`.
- `app/admin/compras/_components/comprasFormat.tsx` — badge de status + formatadores compartilhados (uma responsabilidade por arquivo).

**Legado removido (sem segunda implementação)**
- `app/gerente/compras/ComprasGerentePageClient.tsx`
- `app/gerente/compras/OcFormModal.tsx`
- `app/gerente/compras/OcDetalheModal.tsx`
- `app/gerente/compras/actions.ts` (movido, não duplicado)

**Ganhos mensuráveis**
- Filtros/paginação saem de estado React duplicado → URL (deep-link, voltar/avançar funcionam).
- KPIs e primeira página renderizados no servidor (menos JS, sem flash de loading para dados iniciais).
- Estados eliminados no cliente: `statusFiltro`, `busca`, `pagina`, `dados`, `loading` + 1 `useEffect` com debounce manual.
- Modais no primitivo único `DragonModal` (foco, Escape, scroll-lock e ciclo de Tab de graça).

## 1.4 PDV — auditoria (pré-requisito obrigatório antes de reconstruir)

A missão exige auditoria antes de implementação. O PDV é o módulo mais crítico (gates de produção `guard:pdv`, `guard:core`, testes de integração de venda) — reconstruí-lo sem essa auditoria violaria "testes preservados / arquitetura preservada".

**Achados (módulo `app/caixa`):**

| Achado | Evidência | Severidade |
|---|---|---|
| Componente-deus | `CaixaPageClient.tsx` com **1.635 linhas**, 30+ imports de componentes, 16 `useState` | Alta |
| Orquestração de modais no topo | 12+ modais/sheets controlados por estados booleanos no mesmo componente | Alta |
| Camadas já corretas no server | `app/caixa/server/*.impl.ts` bem separado (domínio fora da UI) | OK — preservar |
| Atalhos já existem | `useCaixaKeyboardShortcuts` + `CaixaKeyboardShortcutsReference` | OK — preservar |
| Scan pipeline isolado | `scan-pipeline/` com testes próprios | OK — preservar |
| Banner de preview de layout | `CaixaPdvLayoutPreviewBanner` + env flag — código transitório | Média |

**Plano recomendado (próximo ciclo, incremental):**
1. Extrair de `CaixaPageClient` um hook por preocupação (`useVendaEmEspera`, `useCheckoutFlow`, `useModaisCaixa`) sem alterar comportamento — cobertos pelos testes de integração existentes.
2. Reduzir informação visível por padrão (detalhes avançados atrás de `CaixaPdvOperacoesMenu`, que já existe).
3. Remover o banner de preview quando o layout PDV atual for promovido a definitivo.

Nenhuma linha do PDV foi alterada neste ciclo — decisão consciente: estabilizar interface administrativa primeiro (ordem oficial), reconstruir o PDV somente com auditoria aprovada.

---

## Critérios de aprovação (estado neste ciclo)

- Sem componentes/layouts/estilos antigos no módulo Compras ✔ (legado apagado)
- Sem duplicações ✔ (actions movidas, não copiadas; gate de gráfico único)
- TypeScript sem erros / build limpa / testes — ver evidências no PR
- Arquitetura preservada ✔ (Server Components + actions existentes; nenhuma lib nova)
- SSoT fortalecido ✔ (filtros na URL; rotas canônicas em `revalidatePath`)
