# Sprint 6 — Engineering Loop (UX estrutural · Jinlong)

**Branch:** `cursor/sprint-6-ux-simplify-633a`  
**Data fechamento:** 2026-08-07  
**Modo:** auditar → decidir → implementar → testar → revisar → medir → documentar

---

## 1. Inventário da arquitetura de telas (admin vivo)

| Rota | Função | Classificação S6 | Notas |
|------|--------|------------------|-------|
| `/admin/dashboard` | Pulso operacional / KPIs | **Redesenhar** (leve) | CTA → Relatórios |
| `/admin/vendas` | Vendas e caixas | Manter | SSOT cancelamento |
| `/admin/catalogo` (+ `?modal=`) | Produtos | **Fundir** (nav) | Hub catálogo |
| `/admin/categorias-produtos` | Taxonomia produto | **Mover** | Aba do hub |
| `/admin/marcas-produtos` | Taxonomia produto | **Mover** | Aba do hub |
| `/admin/clientes` | Clientes | Manter | SSOT |
| `/admin/funcionarios` | Operadores | Manter | |
| `/admin/estoque` | Saldos | **Fundir** (nav) | Hub estoque |
| `/admin/estoque/recebimento` | Entrada mercadoria | **Mover** | Aba hub |
| `/admin/estoque/transferencias` | Transferências | **Mover** | Aba hub |
| `/admin/estoque/importar-nfe` | NF-e | **Mover** | Aba hub |
| `/admin/estoque/imprimir-etiquetas` | Etiquetas | **Mover** | Aba hub |
| `/admin/auditoria` | Timeline | Manter | Distinto de dashboard |
| `/admin/financeiro` | Receber/pagar/fiscal | **Redesenhar** | Hub 4 abas |
| `/admin/financeiro/contas-pagar` | Legado pagar | **Eliminar** (superfície) | Redirect → `?tab=pagar` |
| `/admin/categorias-financeiras` | Plano de contas | **Mover** | Aba financeiro |
| `/admin/relatorios` | Análises período | Manter | Complemento dashboard |
| `/admin/fornecedores` | Fornecedores | Manter | SSOT · “Mais” |
| `/admin/compras` | OC | Manter | “Mais” |
| `/admin/comissoes` | Comissões | Manter | “Mais” |
| `/admin/configuracoes` | Loja/PDV | Manter | Sistema |
| `/admin/suspensao` | Kill switch vendas | Manter | Sistema |
| `/admin/implantacao` · `/provisionamento` · `/diagnostico-caixa` | Interno | Manter | `adminOnly` |
| `/caixa` | PDV | Manter | Fora do escopo S6 |
| `/gerente/*` | Redirect legado | Manter (redirect) | Dívida — não removido |

Rotas `/gerente/*` permanecem como redirects (`LEGACY_GERENTE_REDIRECTS`); árvore morta não foi expurgada nesta sprint (risco/regressão).

---

## 2. Cinco maiores problemas estruturais de UX

1. **Sidebar CORE sobrecarregada (12 itens)** — taxonomias de produto e recebimento competiam com tarefas diárias (vendas, estoque, financeiro).
2. **Domínios fragmentados** — Catálogo/Categorias/Marcas e Estoque/Recebimento/Transferências eram “módulos” na IA do menu, não na operação real.
3. **Financeiro duplicado** — `/financeiro/contas-pagar` convivia com aba “A pagar” do financeiro unificado.
4. **Cadastros financeiros periféricos** — Categorias financeiras escondidas em “Mais”, longe do fluxo de títulos.
5. **Dashboard vs Relatórios sem ponte** — mesma audiência (dono/gerente), descoberta fraca de análises profundas.

---

## 3. Arquitetura UX simplificada (implementada)

```
Sidebar CORE (9 itens)
  Visão geral · Vendas · Catálogo · Clientes · Funcionários · Estoque
  · Auditoria · Financeiro · Relatórios

Sidebar MAIS (3 itens)
  Fornecedores · Compras · Comissões

Hubs (abas horizontais — IDS atualizado em DESIGN_SYSTEM_CONTRACT.md)
  Catálogo: Produtos | Categorias | Marcas
  Estoque: Saldos | Recebimento | Transferências | NF-e | Etiquetas
  Financeiro: A receber | A pagar | Fila fiscal | Categorias
```

RFCs: `docs/rfc/RFC-S6-001-hub-catalogo.md`, `RFC-S6-002-hub-estoque.md`, `RFC-S6-003-hub-financeiro.md`.

---

## 4. Loop de engenharia (ciclos)

| Ciclo | Missão | Validação |
|-------|--------|-----------|
| 1 | Inventário + baseline métricas/gates | `check:ds-burndown`, `check:entity-ssot` |
| 2 | RFCs hubs catálogo/estoque/financeiro | Revisão contra Entity-SSOT |
| 3 | Implementação nav + componentes hub | `adminV2SidebarNav.test`, `hubNavModel.test` |
| 4 | Integração páginas admin + redirect contas-pagar | `SidebarNav.behavior.test` |
| 5 | IDS + script `check:ds-sprint0` | `guard:design-system` + burndown + coverage |
| 6 | Gates finais + build | typecheck, lint, vitest, build |

---

## 5. Entregáveis objetivos (fechamento)

### Telas eliminadas (como superfície)

- **`/admin/financeiro/contas-pagar`** — substituída por redirect 307-style (`redirect()`) para `/admin/financeiro?tab=pagar`.

### Telas fundidas (navegação)

- **Hub Catálogo** — 3 rotas, 1 entrada sidebar + abas.
- **Hub Estoque** — 5 rotas logísticas, 1 entrada sidebar + abas.
- **Hub Financeiro** — 4 abas incluindo categorias financeiras.

### Telas redesenhadas

- Páginas dos hubs (headers + `CatalogoHubNav` / `EstoqueHubNav` / `FinanceiroHubNav`).
- **`/admin/categorias-financeiras`** — contexto “Financeiro” + abas.
- **`/admin/dashboard`** — ação secundária para Relatórios.

### Telas movidas (descoberta)

- Categorias/marcas produto: sidebar → abas catálogo.
- Recebimento/transferências: CORE/MAIS → abas estoque.
- Categorias financeiras: MAIS → aba financeiro.

### Principais ganhos de UX

- **−25% itens no menu CORE** (12 → 9).
- **−40% itens em “Mais”** (5 → 3).
- Fluxos logísticos e de taxonomia **co-localizados** com o hub pai.
- Financeiro **uma superfície** para receber, pagar, fiscal e categorias.

### Deliberadamente não feito (S6)

- Fundir **Relatórios** dentro do Dashboard (overlap parcial, mas perfis de uso distintos).
- Remover árvore **`app/gerente/*`** ou unificar actions (dívida PMO — fora do escopo reversível curto).
- Redesign completo dos **PageClients legados** em recebimento/NF-e (só wrapper + abas).
- Devolução/troca RPC, kardex avançado, consolidação Tauri, Sprint 7+ backlog.
- Alteração de **regras de negócio**, RLS, RPCs ou Entity-SSOT.

---

## 6. Métricas antes / depois

| Métrica | Antes (main) | Depois (S6) |
|---------|--------------|-------------|
| Itens sidebar CORE | 12 | **9** |
| Itens sidebar “Mais” | 5 | **3** |
| DS Coverage — app TSX com DS | 82/165 (50%) | **86/165 (52%)** |
| DS Coverage — telas migradas | 6/12 (50%) | 6/12 (50%) |
| DS burndown `.app-btn-*` hits | 38 | 38 (≈) |
| DS burndown `text-[Npx]` hits | 331 | 331 (≈) |
| Vitest | — | **851 passed** |
| Entity-SSOT | OK | **OK** (6 avisos legado) |

> Objetivo da sprint **não** foi inflar % DS; ganho principal é **complexidade de navegação**. Pequeno ↑ em TSX com DS veio de componentes hub novos.

---

## 7. Gates (execução local)

| Gate | Resultado |
|------|-----------|
| `npm run check:ds-sprint0 -w pdv-importados` | ✅ (guard + burndown + coverage) |
| `npm run typecheck -w pdv-importados` | ✅ |
| `npm run lint -w pdv-importados` | ✅ (3 warnings e2e pré-existentes) |
| `npm run test -w pdv-importados` | ✅ |
| `npm run check:entity-ssot -w pdv-importados` | ✅ |
| `npm run build -w pdv-importados` | ✅ |

`check:ds-sprint0` foi **formalizado** nesta sprint como alias de `guard:design-system` + `check:ds-burndown` + `check:ds-coverage`.

---

## 8. Riscos residuais

- Páginas estoque legado podem exibir **padding duplo** (`admin-v2-page` + shell gerente).
- Operadores com **memória muscular** da sidebar antiga precisam re-aprender hubs (mitigação: abas persistentes + URLs antigas).
- **Relatórios** ainda exigem item CORE — candidato a hub “Análises” em sprint futura.

---

## 9. PR

Ver pull request aberto a partir de `cursor/sprint-6-ux-simplify-633a` → `main`.

---

## 10. Próximo candidato (fora S6 — não iniciado)

- Hub **Análises** (Dashboard + Relatórios) com critério de não duplicar queries pesadas.
- Polish visual dos PageClients legados dentro dos hubs estoque.
- Remoção arquivada de `app/gerente/*` após janela de estabilidade.

**Pós-S7:** ver inventário **`docs/AUDITORIA_FECHAMENTO_S0_S7.md`**.
