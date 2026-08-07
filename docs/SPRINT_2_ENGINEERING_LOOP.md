# Sprint 2 — Engineering Loop (Financeiro + Catálogo/PDV)

| Campo | Valor |
|--------|--------|
| **Abertura** | 2026-08-07 (autorização sponsor após S0+S1) |
| **Fechamento** | 2026-08-07 |
| **RFCs** | [`UI_UX_RFC.md`](./UI_UX_RFC.md) 007–010 |
| **Branch** | `feat/sprint-ux-go-live` |
| **Estado** | **FECHADA** |

## Problema (antes)

| Paradigma | Onde | Dor operacionalacional |
|-----------|------|------------------|
| Tabs ad hoc | `FinanceiroTabNav` local | Não usa `TabNav` SSOT |
| GerenteTable + DataTablePage + dragon-glass + app-btn | Contas a pagar | Segunda pele visual no hub |
| Fila fiscal duplicada | Lateral da aba Receber **e** aba Fiscal | Dois lugares, mesma fila |
| Rota paralela | `/admin/financeiro/contas-pagar` | Navegação desnecessária |
| Documento fiscal | dragon-glass / GerenteStatusBadge | Detalhe fora do DS |

## Decisões (RFCs)

1. **RFC-007** — Um hub, três abas TabNav; fetch por aba; fiscal só em `tab=fiscal`; `/contas-pagar` → redirect `?tab=pagar`.
2. **RFC-008** — Documento fiscal em PageShell + InlineAlert + StatusChip.
3. **RFC-009** — Catálogo: confirmar contratos S0 (sem nova tela; BulkActionBar/ExportAction).
4. **RFC-010** — PDV: F3 no empty do carrinho (descoberta do atalho).

## Entregas

| ID | Item | Status |
|----|------|--------|
| UX-P0-04 | Hub TabNav + EntityTable pagar/receber/fiscal | ✅ |
| UX-P0-05 | Documento PageShell + InlineAlert | ✅ |
| UX-P1-11 | Alias contas-pagar → `?tab=pagar` | ✅ |
| Catálogo | Contratos S0 mantidos (S1+confirmação) | ✅ |
| PDV | F3 no empty | ✅ |

## Métricas (antes → depois)

| Indicador | Pré-S2 (pós-S1) | Pós-S2 | Nota |
|-----------|----------------:|-------:|------|
| Famílias tabela no Financeiro | 2 (DataTable + GerenteTable) | **1** (EntityTable) | AP migrado |
| Portas para Contas a pagar | 2 rotas | **1** hub | redirect alias |
| Locais da fila fiscal | 2 (receber+fiscal) | **1** | lateral removida |
| `GerenteTable` import (repo) | 5 | **4** | Δ−1 (AP) |
| `.app-btn-*` hits (burndown) | ~14 | **8** | Δ−6 |
| Aderência DS (proxy hot-path fin.) | ~75 | **~80** | roadmap §6 |
| Páginas P0 | ≤4 | **≤2** | fin+doc tratados |

## Validação (gates)

| Gate | Resultado |
|------|-----------|
| `npm run check:ds-sprint0` | ✅ |
| `tsc --noEmit` | ✅ |
| `eslint` | ✅ 0 errors |
| vitest (homologação P0 + consolidação + cart) | ✅ |
| `check:entity-ssot` | ✅ (1 aviso legado) |

## Revisão crítica UX

- Menos cliques: AP não exige rota separada; tabs limpam filtros cruzados.
- Densidade: Receber foca títulos; Fiscal foca fila; Pagar usa MetricCard + EntityTable.
- Sem “embelezamento” cosmético: removeu GerenteTable/dragon-glass do caminho financeiro admin.

## DoD Sprint 2

- [x] Itens da tabela de entregas ✅
- [x] RFCs 007–010 registradas
- [x] Gates verdes
- [x] Métricas antes/depois documentadas
- [x] **Sprint 3 bloqueada** até aceite explícito do sponsor

## Não feito (fora de escopo / S3+)

- Migrar Compras/Funcionários GerenteTable (S3/S4)
- Stepper NF-e / FileDropzone (S3)
- Burndown global a zero
