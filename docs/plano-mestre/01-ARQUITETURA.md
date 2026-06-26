# Pilar 1 — Arquitetura

> Define **shell, navegação, estrutura, layouts e responsividade**.
> Não descreve cores nem componentes (ver [Pilar 2](./02-DESIGN-SYSTEM.md)).

## 1. AppShell

Toda tela administrativa utiliza obrigatoriamente a seguinte estrutura. Nenhuma
página pode alterá-la.

```
<AppShell>
 ├── Header        (global, fixo)
 ├── Sidebar       (retrátil)
 ├── Breadcrumb
 ├── ModuleTabs    (abas do módulo)
 ├── PageHeader
 ├── Toolbar
 ├── Filters       (FilterBar)
 ├── Content
 └── Footer
```

**Mapa no código** (`pdv-importados/`):

| Primitiva | Implementação atual |
|-----------|---------------------|
| AppShell (gerente) | `app/gerente` + `components/gerente/*` (ex.: `GerenteLayoutShell`) |
| AppShell (admin) | `app/admin` + `components/ui/admin-v2/*` |
| Shell do PDV | `app/caixa` (shell **independente** — ver §6) |
| Header | `components/branding/*`, header do shell de cada área |
| Sidebar / ModuleTabs | navegação do shell por área |
| FilterBar | `components/ui/FilterBar.tsx` |
| Content / Table | `components/ui/DataTable.tsx` |

> **Convergência:** hoje existem três shells (`gerente`, `admin`, `caixa`). O
> alvo é um único `AppShell` administrativo compartilhado por `gerente` e
> `admin`, com o PDV mantido separado por contrato. Novos módulos administrativos
> devem reutilizar as primitivas existentes — nunca criar um quarto shell.

## 2. Layout Primitives

Todo o sistema é construído **apenas** com estes blocos estruturais:

- `AppShell`
- `Header`
- `Sidebar`
- `Breadcrumb`
- `ModuleTabs`
- `Page`
- `Section`
- `Toolbar`
- `FilterBar`
- `Content`
- `Footer`

Novos layouts **devem reutilizar** estas primitivas. É proibido criar layouts
paralelos.

## 3. Cabeçalho Global (Header)

Sempre fixo. Três regiões:

- **Esquerda:** Logo JinLong + nome da empresa.
- **Centro:** Busca Global.
- **Direita:** Idioma · Tema¹ · Notificações · Perfil · Menu do usuário.

> ¹ O seletor de **Tema** é parte do contrato de arquitetura, mas está
> **desativado** enquanto o tema único claro for o contrato vigente (ver Pilar 2,
> §Temas, e a tabela de divergências no README).

## 4. Sidebar

Retrátil. **Recolher nunca altera a navegação** — apenas a apresentação
(expandido = ícone + nome; recolhido = somente ícone).

Itens de nível 1 (alvo):

| Item | Rota base | Status no código |
|------|-----------|------------------|
| Dashboard | `/gerente` (dashboard) | ✅ |
| Vendas | `/gerente/vendas` | ✅ |
| Produtos | `/gerente/produtos` | ✅ |
| Estoque | `/gerente/estoque` | ✅ |
| Financeiro | `/gerente/financeiro` | ✅ |
| Fiscal | — | ⏳ planejado |
| Cadastros | `/gerente/clientes`, `/gerente/fornecedores`, categorias… | ✅ (agrupar sob "Cadastros") |
| Relatórios | `/gerente/relatorios` | ✅ |
| Configurações | `/gerente/configuracoes` | ✅ |

> O módulo **Fiscal** consta no Plano como item de nível 1, mas ainda não tem
> rota. Tratá-lo como backlog até existir (não criar item morto na sidebar).

## 5. Navegação dos Módulos (ModuleTabs)

Cada módulo possui abas próprias. A **estrutura das abas permanece consistente**
entre módulos (mesma posição, mesmo comportamento). Exemplos:

**Produtos:** Lista · Cadastro · Categorias · Variações · Etiquetas · Importação

**Estoque:** Estoque · Entrada · Inventário · Ajustes · Transferências · Movimentações

**Financeiro:** Caixa · Contas a Receber · Contas a Pagar · Fluxo de Caixa

> As abas concretas seguem as rotas existentes em `app/gerente/<modulo>/*`. Onde
> uma aba do Plano ainda não existe (ex.: "Etiquetas", "Variações"), ela é
> backlog do módulo — documentada no [Pilar 4](./04-MODULOS.md), não inventada na UI.

## 6. PDV — arquitetura independente

O PDV (`app/caixa`) possui **arquitetura própria**, por contrato. Características:

- Operação por teclado.
- Scanner de código de barras (ver `app/caixa/scan-pipeline`).
- Fluxo contínuo, poucos cliques, interface limpa, grande área útil.

**Não utiliza:** Dashboard, cards gerenciais, gráficos.

**Prioridade absoluta:** rapidez da venda.

O PDV é o único ambiente autorizado a **não** seguir o AppShell administrativo.
Ele segue seu próprio shell, descrito junto às invariantes operacionais em
`docs/CIRCUITO_OPERACIONAL.md` e `docs/SCAN_PIPELINE_STATE_MACHINE.md`.

> **Subsistema independente:** a especificação consolidada do PDV (objetivo,
> limites de responsabilidade, fluxos, relação com os demais módulos, integração
> com o Bling e roadmap) está no documento complementar
> [`05-ARQUITETURA-PDV.md`](./05-ARQUITETURA-PDV.md).

## 7. Contrato de Página

Toda página administrativa possui, obrigatoriamente, nesta ordem:

```
PageHeader → Toolbar → FilterBar → Content → Pagination → Footer
```

Nenhuma página administrativa pode fugir desse padrão. A **localização dos
elementos nunca muda** entre telas.

## 8. Responsividade

| Ambiente | Papel |
|----------|-------|
| Desktop | Ambiente principal. |
| Notebook | Suporte completo. |
| Tablet | Uso administrativo. |
| Mobile | Consultas rápidas. |

O **PDV é otimizado prioritariamente para desktop**. Otimizações mobile do
restante constam em `pdv-importados/MOBILE_OPTIMIZATIONS.md`.

## 9. Referências cruzadas no repositório

- `docs/LAYOUT_KERNEL_ERP.md` — kernel de layout do ERP.
- `pdv-importados/ARCHITECTURE.md` — arquitetura do front.
- `pdv-importados/VISUAL_PHILOSOPHY.md` — "Quiet Power" (filosofia visual).
- `docs/MULTI_AUTHORITY_ARCHITECTURE_AUDIT.md` — autoridades e fronteiras.
