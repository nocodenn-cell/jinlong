# Design System - FastProduct Dragon POS

## 🎯 Visão Geral

O Design System do Dragon POS (FastProduct) garante consistência visual, escalabilidade e manutenção eficiente. O projeto usa um **tema claro único** como contrato visual desde a Fase 0 - Layout Compiler.

**Status**: ✅ Tema claro consolidado | ⚠️ Tema escuro aposentado (Fase 1)

---

## 🌈 Paleta de Cores Vigente

### Tema Único: "Clássico" (Claro)

O projeto está **travado em tema claro**. Nenhum modo escuro está em produção.

| Token | Valor | Uso |
|-------|-------|-----|
| `--surface` | `#ffffff` | Fundo principal |
| `--surface-soft` | `#f8fafc` | Fundo secundário (soft) |
| `--surface-text` | `rgb(15 23 42)` | Texto principal (slate-900) |
| `--border` | `#e2e8f0` | Bordas padrão |
| `--accent` | `#2563eb` | Azul Bling (botões, links) |
| `--accent-strong` | `#1d4ed8` | Azul Bling (estado ativo) |
| `--accent-contrast` | `#ffffff` | Texto sobre acento |

### Cores Primitivas Dragon (Utilidades)

```css
/* Jade (Success) */
--color-dragon-jade-50: #ecfdf5
--color-dragon-jade-500: #10b981
--color-dragon-jade-700: #047857
--color-dragon-jade-900: #064e3b

/* Gold (Warning/Realce) */
--color-dragon-gold-50: #fffbeb
--color-dragon-gold-400: #fbbf24
--color-dragon-gold-500: #f59e0b
--color-dragon-gold-luxury: #d4af37  /* Login ceremonial */
--color-dragon-gold-warm: #c9a227   /* Gráficos */

/* Imperial Red (Danger) */
--color-dragon-imperial-red-50: #fef2f2
--color-dragon-imperial-red-500: #ef4444
--color-dragon-imperial-red-700: #b91c1c
```

### Tokens FastProduct (--fp-*)

Tokens semânticos para componentes UI admin:

```css
--fp-text-muted: color-mix(in srgb, var(--color-text-primary) 65%, transparent)
--fp-text-secondary: var(--color-text-secondary)
--fp-text-primary: var(--color-text-primary)
--fp-bg-card: var(--color-background-surface)      /* #ffffff */
--fp-bg-card-soft: var(--color-background-surface-soft)  /* #f8fafc */
--fp-border: var(--color-border-primary)
--fp-border-subtle: color-mix(in srgb, var(--color-border-primary) 50%, transparent)

/* Status Indicators */
--fp-success: var(--color-dragon-jade-500)         /* #10b981 */
--fp-danger: var(--color-dragon-imperial-red-500)  /* #ef4444 */
--fp-warning: var(--color-dragon-gold-500)         /* #f59e0b */
--fp-info: #3b82f6                                  /* Bling Blue */
--fp-purple: #8b5cf6                                /* Purple accent */

/* Com variações de background + border */
--fp-success-bg, --fp-success-border
--fp-danger-bg, --fp-danger-border
--fp-warning-bg, --fp-warning-border
--fp-info-bg, --fp-info-border
--fp-purple-bg, --fp-purple-border
```

---

## 📁 Estrutura de Tokens CSS

```
pdv-importados/styles/tokens/
├── base.css              # Primitivos: cores, espaçamento, tipografia
├── component.css         # Tokens por componente (buttons, inputs, etc)
├── theme.css             # Tema claro único (VIGENTE)
├── theme-oriental.css    # Design system completo (1361 linhas)
├── admin-v2.css          # Escopo administrativo com --admin-v2-*
├── theme-fix-aggressive.css  # Aliases JinLong (--jl-*)
├── semantic.css          # DEPRECATED (Fase 1, agendado para remoção Sprint 3)
└── index.css             # Import centralizado
```

### Ordem de Importação
1. **base.css** — Primitivos do Dragon
2. **component.css** — Tokens por componente
3. **theme.css** — Tema claro (substitui semantic.css)

---

## 🎨 Usando Tokens de Cores

### ✅ Recomendado

```tsx
// Inline style com variável CSS
<div style={{ color: 'var(--surface-text)', background: 'var(--surface)' }}>
  Conteúdo
</div>

// Classe Tailwind com token
<div className="bg-[var(--surface)]">Fundo</div>

// Componentes que usam --fp-* tokens
<MetricCard
  label="Vendas"
  tone="success"  // Resolvido para --fp-success (#10b981)
  sparkData={[1, 2, 3]}
/>
```

### ❌ Evitar

```tsx
// Cores hexadecimais diretas (violam tema)
<div className="bg-[#0f0f0f]">❌ Dark background</div>

// Utilitários dark: (tema escuro está aposentado)
<div className="dark:bg-gray-900">❌ Dark mode</div>

// Fallbacks hardcoded em JavaScript
const color = getCSSVar('--fp-success') || '#22c55e' // ❌ Duplica token
```

---

## 📚 Componentes e Variantes

### Admin Dashboard
- **MetricCard** — KPI com sparkline (suporta tons: success, danger, info, warning, purple)
- **StatCard** — Estatística com delta percentual
- **ActivityFeed** — Feed de eventos com severidade
- **DeltaChip** — Indicador de variação (+/- %)
- **StatusBadge** — Badge de status (CONCLUIDA, CANCELADA, PENDENTE, DEVOLVIDA)
- **PaymentBadge** — Forma de pagamento (DINHEIRO, PIX, CRÉDITO, DÉBITO)
- **FiscalBadge** — Status NF-e (EMITIDA, PENDENTE, CANCELADA, ERRO)

### PDV/Caixa
- **CaixaPdvTopBar** — Barra superior com status (turno, operador, fundo, impressora)
- **CaixaFooter** — Resumo financeiro colapsável
- **CaixaPdvOperacoesButtons** — Suprimento, Sangria, Validação Gerente
- **CaixaKeyboardShortcutsReference** — Modal de atalhos de teclado

---

## 🎯 Convenções de Design

### Cores em Componentes
1. **Sempre usar tokens CSS** — nunca cores hex diretas em JSX
2. **Prefixo do token indica escopo**:
   - `--surface`, `--border`, `--accent` — Sistema base (theme.css)
   - `--fp-*` — Componentes FastProduct Admin (theme.css)
   - `--jl-*` — Aliases JinLong (theme-fix-aggressive.css)
   - `--admin-v2-*` — Escopo administrativo (admin-v2.css)
3. **Sem utilitários Tailwind dark:** — tema escuro aposentado
4. **Use color-mix() para variações** — não hardcode alpha/blend

### Exemplo: Novo componente
```tsx
// ✅ Correto
export function MyComponent() {
  return (
    <div
      style={{
        background: 'var(--fp-bg-card)',
        border: '1px solid var(--fp-border)',
        color: 'var(--fp-text-primary)',
      }}
    >
      Conteúdo
    </div>
  )
}
```

---

## 📋 Mudanças da Fase 1 (2026-06-27)

### ✅ Concluído

1. **Adicionados 16 novos tokens `--fp-*`** em `theme.css`
   - Substituem fallbacks hardcoded em MetricCard, ActivityFeed, StatCard, badges
   - Exemplo: `--fp-success` (#10b981), `--fp-danger` (#ef4444)

2. **Removida importação de semantic.css** em `index.css`
   - Arquivo marcado como DEPRECATED
   - Agendado para remoção na Sprint 3

3. **Consolidadas cores hexadecimais em componentes admin**
   - 0 cores hex diretas em UI (bg/border/hover/text)
   - Todas as cores agora usam variáveis CSS

4. **Validação completa**
   - ✓ 0 utilitários `dark:` em componentes admin
   - ✓ 0 cores literais em inline styles (exceto gráficos de dados)
   - ✓ 100% uso de tokens CSS/variáveis

### ⚠️ DEPRECATED

- **semantic.css** — Continha mapeamentos de tema escuro
- **[data-gerente-ui-theme='dragon-dark']** — UI escura do gerente
- **Todos os tokens `--color-night-*`** — Não usar (ainda em base.css por compatibilidade)
- **Modo dark do Tailwind** — Não ativo no projeto

**Scheduler**: Remover completamente na Sprint 3 (2026-07-XX)

---

## 🔄 Migração do Legado

Se você encontrar código usando tokens deprecated:

### De `semantic.css` → Para `theme.css`

| Antes | Depois |
|-------|--------|
| `--color-success-500` | `var(--color-dragon-jade-500)` |
| `--color-danger-500` | `var(--color-dragon-imperial-red-500)` |
| `--color-warning-500` | `var(--color-dragon-gold-500)` |
| `--color-text-primary` | `var(--surface-text)` |
| `--color-background-surface` | `var(--surface)` |
| `--color-border-primary` | `var(--border)` |

### De cores hex diretas → Para tokens

| Antes | Depois |
|-------|--------|
| `bg-[#0f0f0f]` | `bg-jl-surface-soft` |
| `border-[#242424]` | `border-[var(--color-border-secondary)]` |
| `text-[#c9a227]` | `style={{ color: 'var(--color-dragon-gold-warm)' }}` |

---

## 📖 Recursos

- **Arquivo de temas**: `pdv-importados/styles/tokens/theme-oriental.css`
- **Tokens base**: `pdv-importados/styles/tokens/base.css`
- **Storybook**: `npm run storybook` (se configurado)
- **Issue/PR de refatoração**: Fase 1 - Consolidação de Paleta Clara

---

## ✨ Checklist para Novos Componentes

- [ ] Use variáveis CSS para cores (nunca hex direto)
- [ ] Prefixe tokens com `--fp-` se for admin, `--jl-` se for gerente
- [ ] Teste em tema claro (único vigente)
- [ ] Sem utilitários `dark:` do Tailwind
- [ ] Documente qual token cada cor usa
- [ ] Valide com `grep -r "bg-\[#\|border-\[#" .` (deve retornar 0)

---

**Última atualização**: 2026-06-27 (Fase 1 - Consolidação de Tema Claro)
