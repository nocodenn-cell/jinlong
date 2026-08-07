# Sprint 4 — Engineering Loop (Cadastros / Relatórios / Config / Admin)

| Campo | Valor |
|--------|--------|
| **Abertura** | 2026-08-07 (autorização explícita pós Sprint 3) |
| **Fechamento** | 2026-08-07 |
| **RFCs** | [`UI_UX_RFC.md`](./UI_UX_RFC.md) 015–020 |
| **Branch** | `feat/sprint-ux-go-live` |
| **Estado** | **FECHADA** |

## Escopo entregue

| ID | Item | Status |
|----|------|--------|
| UX-P1-13 | Funcionários PageShell + FilterBar + CrudListShell + EntityTable + askConfirm | ✅ |
| UX-P1-14 | Cat. financeiras paridade + taxonomia tipo + atalho no hub Financeiro | ✅ |
| UX-P1-15 | Relatórios TabNav + FilterBar daterange + EmptyState + donut honesto + ExportAction | ✅ |
| UX-P1-16 | Suspensão PageShell + InlineAlert + askConfirm + emitToast | ✅ |
| UX-P1-17 | Implantação PageShell + InlineAlert no gate | ✅ |
| UX-P1-18 | `/gerente/*` redirect no middleware (zero flash de shell) | ✅ |
| UX-P1-19 | `AdminToastViewport` (+ alias deprecated) | ✅ |
| UX-P1-20 | Config TabNav URL + FormSection + emitToast | ✅ |

## Decisões arquiteturais (auditoria crítica)

| Tema | Decisão | Motivo |
|------|---------|--------|
| Funcionários × Config | **Não fundir** | Identidade/RBAC ≠ parâmetros de loja/PDV |
| Suspensão × Config | **Manter rota própria** | Kill-switch operacional precisa de visibilidade lateral e confirmação forte |
| Cat. financeiras × Financeiro hub | **CRUD próprio + atalho no hub** | Taxonomia é cadastro de referência (como categorias de produto) |
| Relatórios × Dashboard | **Não fundir** | Dashboard = snapshot; Relatórios = análise por período |
| Donut “pagamentos” | **Renomear + remover fatia fabricada** | `ajustes = concluidas * 0.08` mentia ao operador |
| `/gerente` | **Redirect no edge** | Layout shim sem `GerenteLayoutShell` |

## Métricas (antes → depois)

| Indicador | Pré-S4 | Pós-S4 |
|-----------|-------:|-------:|
| `GerenteTable` imports (burndown) | 3 | **2** (Δ−1 Funcionários) |
| text-[Npx] hits (burndown) | 232 | **202** |
| Funcionários paradigma | GerenteTable + DataTablePage | **EntityTable + CrudListShell** |
| Cat. financeiras tipo na UI | ausente (create quebrava schema) | **select RECEITA/DESPESA/AMBOS** |
| Relatórios FilterBar | form ad hoc | **daterange canônico** |
| Relatórios seções | scroll único | **TabNav vendas/estoque/margem** |
| Toast viewport admin | `GerenteToastViewport` | **`AdminToastViewport`** |
| Aderência DS (roadmap) | ~85 | **~88** |

## Segunda passagem crítica

Revisão pós-gates (não só “verde”):

1. Título da lista Funcionários era `contagem` → corrigido para `lista_titulo` (“Equipe”).
2. Confirm de suspensão só ao **ativar** suspensão (não ao liberar).
3. Donut sem fatia sintética; empty DS quando zero vendas.
4. Config banners de sucesso removidos → `emitToast`.
5. Financeiro ganhou CTA de categorias sem inventar segundo CRUD.
6. Provisionamento Stepper (UX-P1-22) **fora** — próximo polish/S5 se sponsor priorizar.

## Validação

| Gate | Resultado |
|------|-----------|
| `check:ds-sprint0` | ✅ |
| `check:ds-burndown` | ✅ (snapshot atualizado) |
| `tsc --noEmit` | ✅ |
| eslint | ✅ 0 errors (warnings e2e pré-existentes) |
| vitest (UI + auth + consolidação + policies) | ✅ |
| `check:entity-ssot` | ✅ (1 aviso legado FornecedorCombobox) |

## DoD

- [x] Prioridades S4 entregues com simplificação real (não só troca de componente)
- [x] RFCs 015–020
- [x] Segunda passagem + correções
- [x] Gates verdes
- [x] Relatório + métricas roadmap
- [x] **Sprint 5** — autorizada e **FECHADA** (ver [`SPRINT_5_ENGINEERING_LOOP.md`](./SPRINT_5_ENGINEERING_LOOP.md))

## Sucesso em S5

- Provisionamento Stepper, burndown GerenteTable=0, polish Admin — entregues na S5.
