# Design Tokens — Implementação Técnica

**Referência para Onda 5:** Como estruturar tokens de design para cada componente

---

## Estrutura de Tokens

### 1. Design Token File Pattern

```typescript
// lib/design-tokens/button.tokens.ts
export const buttonTokens = {
  sizes: {
    sm: { padding: '0.5rem 1rem', fontSize: '0.875rem', height: '2rem' },
    md: { padding: '0.75rem 1.5rem', fontSize: '1rem', height: '2.5rem' },
    lg: { padding: '1rem 2rem', fontSize: '1.125rem', height: '3rem' },
  },
  variants: {
    primary: {
      bg: 'var(--color-primary)',
      text: 'var(--color-white)',
      hover: 'var(--color-primary-dark)',
      active: 'var(--color-primary-darker)',
    },
    secondary: {
      bg: 'var(--color-secondary)',
      text: 'var(--color-text)',
      hover: 'var(--color-secondary-light)',
      active: 'var(--color-secondary-dark)',
    },
    ghost: {
      bg: 'transparent',
      text: 'var(--color-text)',
      hover: 'var(--color-bg-hover)',
      active: 'var(--color-bg-active)',
    },
  },
  states: {
    disabled: {
      opacity: 0.5,
      cursor: 'not-allowed',
    },
  },
}
```

### 2. CSS Variables (Theme)

```css
/* pdv-importados/styles/design-system.css */
:root {
  /* Colors — Palette */
  --color-primary: #2563eb;
  --color-primary-dark: #1d4ed8;
  --color-primary-darker: #1e40af;
  
  --color-secondary: #64748b;
  --color-secondary-light: #94a3b8;
  --color-secondary-dark: #475569;
  
  --color-white: #ffffff;
  --color-text: #1f2937;
  --color-bg: #f9fafb;
  --color-bg-hover: #f3f4f6;
  --color-bg-active: #e5e7eb;
  
  --color-success: #10b981;
  --color-error: #ef4444;
  --color-warning: #f59e0b;
  --color-info: #3b82f6;
  
  /* Spacing */
  --space-xs: 0.25rem;
  --space-sm: 0.5rem;
  --space-md: 1rem;
  --space-lg: 1.5rem;
  --space-xl: 2rem;
  --space-2xl: 3rem;
  
  /* Typography */
  --font-family-sans: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  --font-family-mono: 'Courier New', monospace;
  
  --font-size-xs: 0.75rem;
  --font-size-sm: 0.875rem;
  --font-size-base: 1rem;
  --font-size-lg: 1.125rem;
  --font-size-xl: 1.25rem;
  --font-size-2xl: 1.5rem;
  
  --font-weight-normal: 400;
  --font-weight-medium: 500;
  --font-weight-semibold: 600;
  --font-weight-bold: 700;
  
  /* Line Height */
  --line-height-tight: 1.25;
  --line-height-normal: 1.5;
  --line-height-relaxed: 1.75;
  
  /* Border Radius */
  --radius-none: 0;
  --radius-sm: 0.25rem;
  --radius-md: 0.375rem;
  --radius-lg: 0.5rem;
  --radius-xl: 0.75rem;
  --radius-full: 9999px;
  
  /* Shadows */
  --shadow-sm: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
  --shadow-md: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
  --shadow-lg: 0 10px 15px -3px rgba(0, 0, 0, 0.1);
}

/* Dark mode (if needed) */
@media (prefers-color-scheme: dark) {
  :root {
    --color-text: #f3f4f6;
    --color-bg: #1f2937;
    --color-bg-hover: #374151;
    --color-bg-active: #4b5563;
  }
}
```

### 3. Component com Tokens

```typescript
// pdv-importados/components/Button.tsx
import { buttonTokens } from '@/lib/design-tokens/button.tokens'
import type { CSSProperties } from 'react'

interface ButtonProps {
  variant?: 'primary' | 'secondary' | 'ghost'
  size?: 'sm' | 'md' | 'lg'
  disabled?: boolean
  children: React.ReactNode
  onClick?: () => void
}

export function Button({
  variant = 'primary',
  size = 'md',
  disabled = false,
  children,
  onClick,
}: ButtonProps) {
  const sizeTokens = buttonTokens.sizes[size]
  const variantTokens = buttonTokens.variants[variant]
  
  const styles: CSSProperties = {
    padding: sizeTokens.padding,
    fontSize: sizeTokens.fontSize,
    height: sizeTokens.height,
    background: variantTokens.bg,
    color: variantTokens.text,
    border: 'none',
    borderRadius: 'var(--radius-md)',
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.5 : 1,
    transition: 'all 0.2s ease',
  }
  
  return (
    <button
      style={styles}
      disabled={disabled}
      onClick={onClick}
      onMouseEnter={(e) => {
        if (!disabled) e.currentTarget.style.background = variantTokens.hover
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = variantTokens.bg
      }}
    >
      {children}
    </button>
  )
}
```

**Ou com CSS Modules (preferível):**

```typescript
// pdv-importados/components/Button.module.css
.button {
  border: none;
  border-radius: var(--radius-md);
  cursor: pointer;
  font-family: var(--font-family-sans);
  font-weight: var(--font-weight-medium);
  transition: all 0.2s ease;
}

.button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.sm {
  padding: var(--space-sm) var(--space-md);
  font-size: var(--font-size-sm);
  height: 2rem;
}

.md {
  padding: var(--space-md) var(--space-lg);
  font-size: var(--font-size-base);
  height: 2.5rem;
}

.lg {
  padding: var(--space-lg) var(--space-xl);
  font-size: var(--font-size-lg);
  height: 3rem;
}

.primary {
  background-color: var(--color-primary);
  color: var(--color-white);
}

.primary:hover:not(:disabled) {
  background-color: var(--color-primary-dark);
}

.primary:active:not(:disabled) {
  background-color: var(--color-primary-darker);
}

/* ... secondary, ghost */
```

```typescript
// pdv-importados/components/Button.tsx (com CSS Module)
import styles from './Button.module.css'

interface ButtonProps {
  variant?: 'primary' | 'secondary' | 'ghost'
  size?: 'sm' | 'md' | 'lg'
  disabled?: boolean
  children: React.ReactNode
  onClick?: () => void
}

export function Button({
  variant = 'primary',
  size = 'md',
  disabled = false,
  children,
  onClick,
}: ButtonProps) {
  return (
    <button
      className={`${styles.button} ${styles[size]} ${styles[variant]}`}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  )
}
```

---

## Validação de Tokens

### Design Guard — Regra Adicional (Onda 5)

Adicionar ao `scripts/design-guard.mjs`:

```javascript
/**
 * REGRA 6: Validar que novos componentes usam design tokens.
 * Detectar hardcoded colors, spacing (sem var(--*))
 */
const hardcodedValuesRe = /(?:color|background|padding|margin|font-size):\s*['"]?(?!var\()(?:#[0-9a-f]{3,6}|[0-9.]+px|[0-9.]+rem)/i

for (const file of tsxFiles) {
  const text = fs.readFileSync(file, 'utf8')
  const lines = text.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    // Pula comentários e imports
    if (line.trim().startsWith('//') || /^import\s+/.test(line)) continue
    
    if (hardcodedValuesRe.test(line)) {
      violations.push(`${path.relative(root, file)}:${i + 1}: Regra 6 — hardcoded value sem design token (use var(--*))`)
    }
  }
}
```

---

## Checklist de Design Tokens (Por Componente)

- [ ] `lib/design-tokens/[component].tokens.ts` criado
- [ ] CSS variables documentadas (`--color-*`, `--space-*`, `--font-*`)
- [ ] Componente usa apenas vars (sem hardcoded values)
- [ ] Storybook mostra todas as variações de tokens
- [ ] Teste verifica que tokens são aplicados corretamente
- [ ] Design guard passa (Regra 6)
- [ ] Figma tokens sincronizados (se available)

---

## Referência Rápida

| Token Type | Exemplo | CSS Variable |
|-----------|---------|---------------|
| Color | Primary blue | `var(--color-primary)` |
| Spacing | Medium gap | `var(--space-md)` |
| Typography | Base font size | `var(--font-size-base)` |
| Radius | Medium border | `var(--radius-md)` |
| Shadow | Medium shadow | `var(--shadow-md)` |
| Duration | Transition | `var(--duration-normal)` |

---

## Próximo Passo

1. Definir paleta de cores final (com design/produto)
2. Criar `pdv-importados/styles/design-system.css` com todas as vars
3. Lote 1 (Button): usar este template
4. Validar com design guard
5. Iterar para próximos componentes

