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

> ⚠️ Dois limites que andam juntos:
> 1. **Escopo local:** aplique este kernel **apenas onde já está mexendo** —
>    nunca como varredura global nem padronização retroativa em lote.
> 2. **Aplicação imediata:** dentro desse escopo local, o padrão estrutural é
>    **obrigatório já na primeira implementação** — não se espera "2+ usos" nem
>    convergência tardia. Consistência não emerge por repetição: ela é aplicada
>    no momento em que o contexto da tela permite.

---

## Regra de execução — aplicação imediata e obrigatória

> O Layout Kernel **não é** design system. É um **contrato de consistência
> estrutural obrigatória no momento da implementação local.**

Sempre que uma tela for criada **ou** modificada, ela deve aplicar
imediatamente os padrões estruturais do kernel **quando houver oportunidade
local de uso** — sem esperar repetição. São obrigatórios, cada um quando seu
gatilho existir na tela:

| Padrão estrutural        | Gatilho (aplica-se quando…)            | É obrigatório já no 1º uso |
|--------------------------|----------------------------------------|----------------------------|
| Toolbar de ações         | a tela tem ação primária               | sim |
| Barra de filtros         | a tela tem listagem ou busca           | sim (filtros sempre acima) |
| Estrutura de tabela padrão | a tela tem listagem                  | sim (`DataTable`)          |
| Paginação                | há paginação natural                   | sim |
| Breadcrumb               | há navegação hierárquica               | sim |

**Como isso muda o tratamento de componentes ainda inexistentes:** se o
gatilho ocorre numa tela real e o componente compartilhado ainda não existe
(ex.: `Breadcrumb`, `PaginationBar`), cria-se **a versão compartilhada mínima
já nesse primeiro uso** — em `components/ui/` — em vez de uma cópia local que
diverge. O gatilho é "esta tela precisa agora", **não** "duas telas já
precisaram".

### O que NÃO é aceito

- ❌ Esperar "2+ usos" para consolidar um padrão **estrutural**.
- ❌ Deixar padrões divergirem por módulo até refatoração futura.
- ❌ Criar variação local de estrutura de tabela ou de filtros.
- ❌ Adiar padronização de layout básico sob a justificativa de "evitar
  design system".

### Onde o limite continua valendo (mantido)

A aplicação imediata **não** autoriza: framework de UI, abstrações globais
(HOCs/wrappers/layout engines), redesign massivo de telas existentes, nem
padronização retroativa em lote. Criar o componente estrutural no 1º uso real
≠ construir um catálogo especulativo de componentes não usados.

> **Distinção-chave:** a regra antiga "não criar componente sem 2+ usos" era
> contra **componentes especulativos sem nenhum consumidor**. Ela **não** se
> aplica a padrão estrutural com um consumidor real presente: aí a versão
> compartilhada nasce já no primeiro uso.

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

### 〜 Padrões locais (one-off) que já existem hoje

Existem como cópia local em **uma** tela (dívida pré-kernel). Não há
refatoração retroativa em lote: eles ficam onde estão até a própria tela ser
tocada por outro motivo. Mas a regra de aplicação imediata vale daqui pra
frente:

- **Tela nova / outra tela** que precise do padrão: usar/criar a versão
  **compartilhada** (não copiar localmente de novo).
- **Tocou a tela que contém o one-off** por outro motivo: promover
  oportunisticamente o padrão para `components/ui/` (sem virar um refactor
  dedicado).

| Padrão        | Onde vive hoje | Nota |
|---------------|----------------|------|
| `StatusPill`  | `app/admin/financeiro/_components/ContasReceberTable.tsx` | `DataTable` aceita badge na célula. |
| `EmptyState`  | `app/admin/relatorios/_components/RelatoriosContent.tsx` | `DataTable` já tem a prop `emptyState` para o caso tabela. |

### ✘ Ainda NÃO existem — criar no 1º uso real (não especulativo)

Não criar antes de haver uma tela real consumindo. Mas, havendo a tela e o
gatilho, criar **a versão compartilhada já no primeiro uso** (não cópia local,
não esperar 2º uso):

| Componente      | Situação hoje | Quando criar |
|-----------------|---------------|--------------|
| `Breadcrumb`    | inexistente   | **1º** uso: tela interna real com navegação hierárquica |
| `PaginationBar` | paginação por-tela via `searchParams` | **1º** uso: tela real com paginação natural → nasce já compartilhada |
| `ActionToolbar` | coberto pelo slot `filters`/ações do `PageHeader` + `AdminV2UtilityBar` | reusar o `PageHeader` primeiro; componente próprio só se um caso real não couber nele |

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

- Consistência **desde o primeiro ponto de contato**: a tela já nasce no
  padrão estrutural, sem depender de convergência futura.
- Tela nova segue o padrão **porque reusa (ou cria já compartilhado) os
  componentes estruturais**, não porque há um framework forçando.
- Telas existentes **não** são reescritas em massa.
- Comportamento de tabela previsível em todos os módulos (via `DataTable`).
- Navegação consistente sem reaprendizado (via `SidebarNav`).
