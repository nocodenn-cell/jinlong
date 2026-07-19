# Onda 7 — Estoque (teste definitivo do Design System)

## Objetivo

Migrar Estoque **não** como CRUD simples, e sim como prova de que o DS aguenta operações complexas (ajuste, transferência, remessa, kardex, NF-e, etiquetas) **sem** criar uma família exclusiva de componentes.

## Regra

Antes de criar qualquer componente:

> Provar que ele não pode ser uma extensão do Design System.

Se o padrão também servir Financeiro / Funcionários → nasce no DS.

## Primários DS novos (reutilizáveis)

| Componente | Uso |
|---|---|
| `StatusChip` | Status operacional (substitui `GerenteStatusBadge`) |
| `MovementBadge` | Delta assinado (+/−) — kardex / futuros ledgers |
| `QuantityCell` | Quantidade com severidade (zero / baixo / ok) |

`TimelineTable` **não** foi criado: kardex usa `DataTable` + `MovementBadge` + `StatusChip`.

## Superfícies migradas

| Superfície | Contrato |
|---|---|
| Lista `/admin/estoque` | `PageHeader` · `PageActions` · `CrudListShell` · `FilterBar` · `DataTable` |
| Ajuste de saldo | `DragonModal` · `Field`/`Input`/`Select` · `Button` |
| Kardex | `DragonModal` · `DataTable` · `MovementBadge` · `StatusChip` · `EmptyState`/`Loading` |
| Transferências | forms DS · `DragonModal` confirm · `SectionCard` |
| Recebimento | `DataTable` · `StatusChip` · `EmptyState` |
| Importar NF-e | `DataTable` · `StatusChip` · `Button` |
| Imprimir etiquetas | `PageHeader` · forms DS · `SectionCard` |
| Relatório estoque | `DataTable` · `MetricCard` · `QuantityCell` · forms DS |

## Critérios de aceite

- Mesmo padrão visual para todos os tipos de movimentação
- Histórico (kardex) na mesma `DataTable`
- Modais no contrato `DragonModal`
- Nenhuma exceção visual “porque Estoque é diferente”
- Exclusivos de Estoque: **0** (hosts de página/list/modal apenas)
- Zero CSS específico de Estoque

## Checks (fechamento sprint)

```bash
cd pdv-importados
npm run typecheck          # OK
npm run check:ds-burndown  # OK (dívida ≤ baseline)
npm run check:ds-coverage  # 6/12 telas · exclusivos estoque 0
```

| Métrica | Meta Onda 7 | Resultado |
|---|---|---|
| Telas migradas | 6/12 | **6/12 (50%)** |
| `text-[Npx]` | &lt;330 | **326** |
| `app-btn-*` | &lt;40 | **38** |
| `GerenteTable` | &lt;10 | **13** (residual fora do Estoque) |
| Exclusivos Estoque | 0 | **0** |

## Baseline

**Não** atualizar `ds-legacy-burndown.baseline.json` nesta onda.

Só após Onda 6 mergeada e estabilizada:

```bash
npm run check:ds-burndown -- --write-baseline
```

## Próxima sequência

**Onda 8 — Financeiro** → Funcionários → Configurações → Implantação → Provisionamento → PDV polish.
