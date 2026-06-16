# Layout Kernel do ERP — Padrão Cognitivo de Interface

> **O que é:** um padrão de consistência que orienta toda tela nova ou já
> modificada do painel admin.
> **O que NÃO é:** framework, design system, redesign global ou camada de
> abstração de layout.
>
> Princípio final: *"ERP não é um conjunto de telas — é repetição consistente
> de um padrão operacional."*

Este documento é **referência**, não código. Ele não introduz nenhuma
abstração nova. Ele apenas descreve a ordem estrutural que as telas devem
seguir e aponta **quais componentes já existem** para reutilização pragmática.

---

## Regras inegociáveis

- ❌ Não alterar regra de negócio, lógica de preço ou de estoque.
- ❌ Não refatorar telas existentes em massa.
- ❌ Não criar engine de UI, design system completo ou framework.
- ❌ Não introduzir abstrações (HOCs, wrappers, layout engines).
- ✔ Permitido: ajustes locais em telas **já tocadas**, padronização
  incremental, reutilização de componentes **já existentes**.

> ⚠️ Maior risco: transformar consistência de UX em arquitetura rígida cedo
> demais. ERP de verdade começa inconsistente, normaliza partes críticas e só
> no fim cria padrão global. Aplique este kernel **apenas onde já está
> mexendo** — nunca como varredura global.

---

## BLOCO 1 — Ordem estrutural (referência obrigatória)

Toda tela nova ou modificada segue esta ordem. **A ordem é estrutural;
variações visuais são permitidas, variações estruturais não.**

```
[Sidebar fixa — domínio do negócio]
  └─> [Header da página]
        └─> [Toolbar de ações]
              └─> [Barra de filtros]
                    └─> [Tabela principal]
                          └─> [Paginação + ações em massa]
```

### Mapa ordem → componente real (já existente)

| # | Camada do kernel            | Componente que JÁ existe                                   | Caminho |
|---|-----------------------------|-----------------------------------------------------------|---------|
| 0 | Sidebar fixa (domínio)      | `AdminV2Shell` + `SidebarNav`                             | `components/ui/admin-v2/` |
| 1 | Header da página            | `PageHeader` (title/subtitle + slot `filters`)            | `components/ui/admin-v2/PageHeader.tsx` |
| 2 | Toolbar de ações            | slot `filters` do `PageHeader` + `AdminV2UtilityBar`     | `components/ui/admin-v2/` |
| 3 | Barra de filtros            | `FilterBar` (pills / select / search via URL params)     | `components/ui/FilterBar.tsx` |
| 4 | Tabela principal            | `DataTable` (≡ "ERPTable": colunas, sort, `rowActions`)  | `components/ui/DataTable.tsx` |
| 5 | Paginação + ações em massa  | **ainda por-tela** (ver Bloco 4) — sem componente compartilhado | — |

---

## BLOCO 2 — Padrão de navegação

- A **sidebar representa domínio de negócio** (Vendas, Estoque, Financeiro,
  Cadastros, Relatórios) — fonte única em `SidebarNav`.
- Submenus hierárquicos e consistentes; sem menus técnicos ou duplicados.
- **Breadcrumb** obrigatório em telas internas — *ver ressalva no Bloco 4: o
  componente compartilhado ainda não existe; criar só quando uma tela interna
  real precisar, nunca especulativamente.*

---

## BLOCO 3 — Padrão de tabelas

Comportamento consistente esperado em toda tabela:

1. **Busca** da entidade — `FilterBar` (`type: 'search'`).
2. **Filtros acima da tabela** — `FilterBar`. *Filtros nunca abaixo da tabela.*
3. **Ordenação previsível** — `DataTable` (`Column.sortValue` + `onSort`).
4. **Ações por linha ("⋮")** — `DataTable` (`rowActions`).
5. **Ações em massa** — quando existir, abaixo/junto da tabela.
6. **Paginação padrão** — hoje por-tela; padronizar quando houver 2ª necessidade.

> Não mudar estrutura de tabelas existentes em massa. Aplicar **só quando a
> tela já estiver sendo modificada** por outro motivo.

---

## BLOCO 4 — Inventário real de componentes

Reutilizar/ajustar **apenas o que já existe**. Este é o estado real do
código hoje — mantenha esta seção honesta ao mexer em componentes.

### ✔ Compartilhados, prontos para reuso

| Componente            | Papel no kernel                  | Caminho |
|-----------------------|----------------------------------|---------|
| `AdminV2Shell`        | shell (sidebar + main)           | `components/ui/admin-v2/AdminV2Shell.tsx` |
| `SidebarNav`          | navegação por domínio            | `components/ui/admin-v2/SidebarNav.tsx` |
| `PageHeader`          | header + slot de toolbar/filtros | `components/ui/admin-v2/PageHeader.tsx` |
| `FilterBar`           | barra de filtros                 | `components/ui/FilterBar.tsx` |
| `DataTable`           | tabela principal (≡ ERPTable)    | `components/ui/DataTable.tsx` |
| `SectionCard` / `ChartCard` / `MetricCard` / `StatCard` | blocos de conteúdo | `components/ui/`, `components/ui/admin-v2/` |
| `MargemCell` / `PriceTooltip` / `StockAlertBadge` | células de observabilidade (flag-gated) | `components/ui/` |

### 〜 Padrões locais (one-off) — NÃO promover ainda

Existem como cópia local em **uma** tela. Não são compartilhados de propósito.
Promover a `components/ui/` **só** quando surgir uma 2ª necessidade real e
concreta (critério: **2+ usos reais cross-module**, provados em código).

| Padrão        | Onde vive hoje | Observação |
|---------------|----------------|------------|
| `StatusPill`  | `app/admin/financeiro/_components/ContasReceberTable.tsx` | 1 uso. `DataTable` também aceita badge na célula. |
| `EmptyState`  | `app/admin/relatorios/_components/RelatoriosContent.tsx` | `DataTable` já tem a prop `emptyState` para o caso tabela. |

### ✘ Ainda NÃO existem — criar só sob necessidade real

Não criar especulativamente (seria design system disfarçado):

| Componente      | Situação hoje | Quando criar |
|-----------------|---------------|--------------|
| `Breadcrumb`    | inexistente   | quando uma tela interna real precisar de trilha |
| `PaginationBar` | paginação feita por-tela via `searchParams` | ao 2º uso real; aí extrair o padrão já existente |
| `ActionToolbar` | coberto pelo slot `filters` do `PageHeader` + `AdminV2UtilityBar` | só se um caso real não couber no `PageHeader` |

---

## BLOCO 5 — Consistência cognitiva

> *"Se o usuário aprende uma tela, ele sabe usar as outras."*

- Mesmas posições de ações (ações de linha sempre no "⋮" à direita).
- Mesma estrutura de filtros (sempre acima, via `FilterBar`).
- Mesmo comportamento de tabela (`DataTable`).
- Mesma lógica de navegação (`SidebarNav` + breadcrumb quando aplicável).

---

## BLOCO 6 — O que NÃO fazer

- ❌ Variações de layout por módulo.
- ❌ Redesenhar telas existentes globalmente.
- ❌ Abstrações de UI genéricas / camadas intermediárias de layout.
- ❌ Otimizar estética às custas de consistência.
- ❌ Criar `Breadcrumb`/`PaginationBar`/`ActionToolbar` "para o futuro".

---

## Critério de sucesso

- Tela nova segue o padrão **porque reusa os componentes existentes**, não
  porque há um framework forçando.
- Telas existentes **não** são reescritas em massa.
- Comportamento de tabela previsível em todos os módulos (via `DataTable`).
- Navegação consistente sem reaprendizado (via `SidebarNav`).
