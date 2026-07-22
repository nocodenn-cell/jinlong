# 🎨 Design System — Jīn Lóng

> ⚠️ **Arquivo legado** — referência em [[03_ARQUITETURA]] (2026-07-10)
> [[Home]] | [[Arquitetura]]

---

## Visão Geral

O design system é construído sobre **Tailwind CSS 3.4 + shadcn/ui + tokens CSS customizados (`--fp-*`)**.
shadcn/ui garante que o código dos componentes pertence ao projeto (não a uma lib externa), permitindo customização total.

---

## Tokens CSS (`--fp-*`)

Definidos em `pdv-importados/globals.css`:

```css
:root {
  /* Cores primárias */
  --fp-primary: hsl(...)
  --fp-primary-foreground: hsl(...)
  
  /* Cores secundárias */
  --fp-secondary: hsl(...)
  --fp-secondary-foreground: hsl(...)
  
  /* Estados */
  --fp-destructive: hsl(...)
  --fp-destructive-foreground: hsl(...)
  --fp-accent: hsl(...)
  --fp-accent-foreground: hsl(...)
  
  /* Neutros */
  --fp-muted: hsl(...)
  --fp-muted-foreground: hsl(...)
  --fp-background: hsl(...)
  --fp-foreground: hsl(...)
  
  /* Bordas */
  --fp-border: hsl(...)
  --fp-input: hsl(...)
  --fp-ring: hsl(...)
  
  /* Superfícies */
  --fp-card: hsl(...)
  --fp-card-foreground: hsl(...)
  --fp-popover: hsl(...)
  --fp-popover-foreground: hsl(...)
}
```

**Variante tokenizada do Button:**
`components/ui/button-tokenized.tsx` — variante que usa os tokens `--fp-*` diretamente.

---

## Cores

| Token | Uso | Status |
|---|---|---|
| `--fp-primary` | Ações principais, botão primário | 🟢 Ativo |
| `--fp-secondary` | Ações secundárias | 🟢 Ativo |
| `--fp-destructive` | Cancelar, deletar, erro | 🟢 Ativo |
| `--fp-accent` | Destaque, badge atacado | 🟢 Ativo |
| `--fp-muted` | Textos secundários, placeholders | 🟢 Ativo |
| `--fp-border` | Bordas gerais | 🟢 Ativo |
| Tailwind `green-*` | Estoque OK, badge "ATAC" | 🟡 Direto (não tokenizado) |
| Tailwind `yellow-*` | Estoque baixo, atenção | 🟡 Direto (não tokenizado) |
| Tailwind `red-*` | Estoque zero, erro crítico | 🟡 Direto (não tokenizado) |
| Hex/RGB hardcoded | Componentes legados | 🔴 Inconsistência — eliminar |

---

## Tipografia

| Elemento | Configuração |
|---|---|
| Font family | Padrão Tailwind (Inter / system-ui) |
| Escala | `text-xs`, `text-sm`, `text-base`, `text-lg`, `text-xl`, `text-2xl` |
| Peso | `font-medium` para labels, `font-semibold` para títulos |
| Cor base | `--fp-foreground` |
| Cor secundária | `--fp-muted-foreground` |

---

## Bordas e Radius

| Token Tailwind | Uso |
|---|---|
| `rounded` | Inputs, cards gerais |
| `rounded-md` | Botões, badges |
| `rounded-lg` | Modais, cards destacados |
| `rounded-full` | Badges de status circular |

---

## Espaçamentos

Segue a escala padrão Tailwind (4px base):
- `p-2` (8px) — Compacto (botões ícone)
- `p-4` (16px) — Padrão (cards, seções)
- `p-6` (24px) — Espaçoso (modais, telas)
- `gap-2`/`gap-4` — Espaço entre elementos em flex/grid

---

## Sombras

| Tailwind | Uso |
|---|---|
| `shadow-sm` | Cards passivos |
| `shadow-md` | Cards interativos, dropdowns |
| `shadow-lg` | Modais, overlays |
| `shadow-xl` | Painel lateral, dialogs |

---

## Componentes

### Base (shadcn/ui)

| Componente | Arquivo | Variantes |
|---|---|---|
| Button | `components/ui/button.tsx` | default, secondary, destructive, ghost, outline |
| Button tokenizado | `components/ui/button-tokenized.tsx` | Usa tokens `--fp-*` |
| Input | `components/ui/input.tsx` | — |
| Textarea | `components/ui/textarea.tsx` | — |
| Select | `components/ui/select.tsx` | — |
| Badge | `components/ui/badge.tsx` | default, secondary, destructive, outline, status |
| Card | `components/ui/card.tsx` | CardContent, CardHeader, CardTitle, CardFooter |
| Dialog | `components/ui/dialog.tsx` | — |
| AlertDialog | `components/ui/alert-dialog.tsx` | — |
| Popover | `components/ui/popover.tsx` | — |
| Tooltip | `components/ui/tooltip.tsx` | — |
| DataTable | `components/ui/DataTable.tsx` | Genérica com sort + paginação |
| Table | `components/ui/table.tsx` | Base HTML |

### Admin v2

| Componente | Arquivo | Propósito |
|---|---|---|
| AdminV2Shell | `components/ui/admin-v2/AdminV2Shell.tsx` | Layout principal do painel admin |
| SidebarNav | `components/ui/admin-v2/SidebarNav.tsx` | Navegação com `aria-current` |
| PageHeader | `components/ui/admin-v2/PageHeader.tsx` | Cabeçalho com título e ações |
| MetricCard | `components/ui/admin-v2/MetricCard.tsx` | Card de KPI com sparkline |

### Caixa (PDV)

| Componente | Arquivo | Propósito |
|---|---|---|
| CaixaLoadingStates | `components/caixa/CaixaLoadingStates.tsx` | Skeleton de loading |
| CaixaMotivoMinModal | `components/caixa/CaixaMotivoMinModal.tsx` | Modal de motivo de desconto |
| CaixaMessageBanner | `components/caixa/CaixaMessageBanner.tsx` | Banner de mensagem/alerta |
| CaixaValorNumericoModal | `components/caixa/CaixaValorNumericoModal.tsx` | Teclado numérico modal |

### Gerente

| Componente | Arquivo | Propósito |
|---|---|---|
| DataTablePage | `components/gerente/DataTablePage.tsx` | Tela genérica de listagem |
| GerenteTable | `components/gerente/GerenteTable.tsx` | Tabela com ações |
| GerenteFilterBar | `components/gerente/GerenteFilterBar.tsx` | Filtros + busca |
| CadastroFormModal | `components/gerente/cadastro/CadastroFormModal.tsx` | Modal CRUD genérico |
| ProdutoFormModal | `components/gerente/produtos/ProdutoFormModal.tsx` | Modal específico de produto |
| MetricCard (gerente) | `components/gerente/MetricCard.tsx` | Card de KPI painel gerente |
| Sparkline | `components/gerente/Sparkline.tsx` | Mini-gráfico de tendência |
| ExportCsvButton | `components/gerente/ExportCsvButton.tsx` | Botão de export CSV |

### Acessibilidade

| Elemento | Implementação |
|---|---|
| Screen reader | `.sr-only` em `globals.css` |
| Skip link | `.skip-link` — pula para conteúdo principal |
| FormField | `components/forms/FormField.tsx` — `aria-label`, `aria-required`, `aria-invalid`, `aria-describedby` |
| Landmarks | `<main>`, `<nav>`, `<aside role="complementary">`, `<section role="search">` |
| Navegação | `aria-current="page"` no SidebarNav |

---

## Componentes Legados / Duplicados

| Componente | Problema | Localização |
|---|---|---|
| `MetricCard` | Existe em `components/gerente/` E em `components/ui/admin-v2/` | Duplicado; versões ligeiramente diferentes |
| `Button` vs `button-tokenized` | Dois botões base; tokenized é experimental | `components/ui/button.tsx` vs `button-tokenized.tsx` |
| Cores diretas Tailwind | Usadas diretamente em vez de tokens (`green-500`, `red-600`) | Vários arquivos em `app/caixa/` e `app/gerente/` |

---

## Inconsistências Visuais

| Inconsistência | Evidência | Prioridade |
|---|---|---|
| Cores hardcoded fora dos tokens | `text-green-600`, `bg-red-100` sem tokens | 🔴 P2 — Feature Freeze |
| Dois sistemas de card (gerente vs admin-v2) | AdminV2Shell vs layout do gerente diferente | 🟡 P2 |
| Badge "ATAC" com cor direta | Badge de atacado usa `bg-green-*` diretamente | 🟡 P2 |
| `button-tokenized` não é o padrão | Convivência com `button` padrão causa inconsistência | 🟡 P2 |

---

## Tema (Modo Escuro)

Gerenciado por `components/theme/AppThemeProvider.tsx` (React Context).
Tailwind suporta `dark:` variants, mas não foi confirmado se o tema escuro está completamente implementado em todas as telas.

---

## Design Tokens vs Tailwind Puro

| Abordagem | Onde | Observação |
|---|---|---|
| Tokens CSS `--fp-*` | Componentes shadcn/ui base | Correto — fonte única |
| Classes Tailwind diretas | Telas de caixa, gerente | Parcialmente correto — cores semânticas OK, valores hardcoded não |
| Hex/RGB no código | Componentes legados antigos | ❌ Eliminar em P2 |

---

> Ver componentes em uso no [[PDV]] e [[Cadastro Produto]] · Inconsistências completas em [[Dívida Técnica]]
