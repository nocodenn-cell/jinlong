# ARIA Implementation Guide — FastProduct Fase 3

**Objetivo**: Referência prática para implementar semântica ARIA em todos os componentes.  
**Conformidade**: WCAG 2.1 AA (mínimo)  
**Data**: 2026-07-03

---

## 1. Essentials: Roles, Labels, Descriptions

### 1.1 Button Component

**Componente**: `components/ui/button.tsx`

#### Checklist ARIA
- [x] Role (implícito em `<button>`)
- [ ] aria-label para icon-only buttons
- [ ] aria-pressed para toggle buttons
- [ ] aria-expanded para dropdown triggers
- [ ] aria-disabled (deprecated, use `disabled` attr)

#### Exemplos de Implementação

**Icon-only button** (ANTES - sem label):
```tsx
<button className="icon-button">
  <SearchIcon className="h-4 w-4" aria-hidden />
</button>
```

**Icon-only button** (DEPOIS - com label):
```tsx
<button 
  className="icon-button"
  aria-label="Buscar movimentações"
>
  <SearchIcon className="h-4 w-4" aria-hidden />
</button>
```

**Toggle button** (ANTES):
```tsx
<button onClick={toggleVisibility}>
  {isVisible ? <EyeIcon /> : <EyeOffIcon />}
</button>
```

**Toggle button** (DEPOIS):
```tsx
<button 
  onClick={toggleVisibility}
  aria-pressed={isVisible}
  aria-label={isVisible ? "Ocultar" : "Mostrar"}
>
  {isVisible ? <EyeIcon /> : <EyeOffIcon />}
  aria-hidden
</button>
```

**Dropdown trigger** (ANTES):
```tsx
<button onClick={() => setOpen(!open)}>
  Ações ⋮
</button>
```

**Dropdown trigger** (DEPOIS):
```tsx
<button 
  onClick={() => setOpen(!open)}
  aria-expanded={open}
  aria-haspopup="menu"
>
  Ações ⋮
</button>
```

#### Atualizar `button.tsx`

```tsx
export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
  /** aria-label para icon-only buttons */
  ariaLabel?: string
  /** Indica se é um toggle button */
  ariaPressed?: boolean
  /** Indica se dispara dropdown/menu */
  ariaExpanded?: boolean
  ariaHasPopup?: 'menu' | 'dialog' | 'listbox' | 'tree' | 'grid'
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ 
    className, 
    variant, 
    size, 
    asChild = false,
    ariaLabel,
    ariaPressed,
    ariaExpanded,
    ariaHasPopup,
    ...props 
  }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        aria-label={ariaLabel}
        aria-pressed={ariaPressed !== undefined ? ariaPressed : undefined}
        aria-expanded={ariaExpanded !== undefined ? ariaExpanded : undefined}
        aria-haspopup={ariaHasPopup}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"
```

---

### 1.2 Input Component

**Componente**: `components/ui/FormField.tsx` (wrapper) e componentes de input

#### Checklist ARIA
- [ ] Label associada (via htmlFor ou aria-labelledby)
- [ ] aria-describedby para hints e erros
- [ ] aria-invalid para estados de erro
- [ ] aria-required se necessário
- [ ] aria-placeholder não substitui placeholder attr

#### Exemplo Correto

**ANTES (sem ARIA):
```tsx
<div>
  <label>Email</label>
  <input type="email" placeholder="seu@email.com" />
  <span className="text-red-500">Email inválido</span>
</div>
```

**DEPOIS (com ARIA):
```tsx
<div>
  <label htmlFor="email-input">Email</label>
  <input 
    id="email-input"
    type="email"
    placeholder="seu@email.com"
    aria-describedby="email-hint email-error"
    aria-invalid={hasError}
    aria-required="true"
  />
  <span id="email-hint" className="text-sm text-gray-400">
    Use seu email corporativo
  </span>
  {hasError && (
    <span id="email-error" className="text-red-500">
      Email inválido
    </span>
  )}
</div>
```

#### Template FormField.tsx

```tsx
interface FormFieldProps {
  id: string
  label: string
  hint?: string
  error?: string
  required?: boolean
  children: React.ReactNode
}

export function FormField({
  id,
  label,
  hint,
  error,
  required,
  children,
}: FormFieldProps) {
  const hintId = hint ? `${id}-hint` : undefined
  const errorId = error ? `${id}-error` : undefined
  const describedBy = [hintId, errorId].filter(Boolean).join(' ')

  return (
    <div>
      <label htmlFor={id}>
        {label}
        {required && <span aria-label="obrigatório">*</span>}
      </label>
      
      {React.cloneElement(children as React.ReactElement, {
        id,
        'aria-describedby': describedBy || undefined,
        'aria-invalid': !!error,
        'aria-required': required || undefined,
      })}
      
      {hint && (
        <span id={hintId} className="text-sm text-muted-foreground">
          {hint}
        </span>
      )}
      
      {error && (
        <span 
          id={errorId} 
          className="text-sm text-destructive"
          role="alert"
        >
          {error}
        </span>
      )}
    </div>
  )
}
```

---

### 1.3 Select/Combobox Component

**Componente**: `components/ui/Select.tsx` (com Radix UI Select)

#### Checklist ARIA
- [x] role="combobox" (Radix fornece)
- [x] aria-expanded (Radix fornece)
- [x] aria-haspopup (Radix fornece)
- [x] aria-labelledby/aria-label (Radix fornece)
- [ ] aria-describedby para hints adicionais

#### Exemplo com Radix UI

```tsx
import * as SelectPrimitive from "@radix-ui/react-select"

interface SelectProps {
  label?: string
  placeholder?: string
  description?: string
  items: { value: string; label: string }[]
  value?: string
  onChange?: (value: string) => void
  required?: boolean
}

export function Select({
  label,
  placeholder,
  description,
  items,
  value,
  onChange,
  required,
}: SelectProps) {
  const descId = description ? useId() : undefined

  return (
    <div>
      {label && <label>{label}</label>}
      <SelectPrimitive.Root value={value} onValueChange={onChange}>
        <SelectPrimitive.Trigger
          aria-required={required}
          aria-describedby={descId}
          aria-label={label}
        >
          <SelectPrimitive.Value placeholder={placeholder} />
        </SelectPrimitive.Trigger>
        
        <SelectPrimitive.Content>
          <SelectPrimitive.Viewport>
            {items.map(item => (
              <SelectPrimitive.Item key={item.value} value={item.value}>
                <SelectPrimitive.ItemText>
                  {item.label}
                </SelectPrimitive.ItemText>
              </SelectPrimitive.Item>
            ))}
          </SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
      </SelectPrimitive.Root>
      
      {description && (
        <span id={descId} className="text-sm text-muted">
          {description}
        </span>
      )}
    </div>
  )
}
```

---

### 1.4 Checkbox Component

**Componente**: `components/ui/checkbox.tsx`

#### Checklist ARIA
- [x] role="checkbox" (implícito ou via Radix)
- [x] aria-checked (Radix fornece)
- [ ] aria-labelledby ou label associada
- [ ] aria-describedby para hints

#### Exemplo com Label Correto

```tsx
import * as CheckboxPrimitive from "@radix-ui/react-checkbox"

interface CheckboxProps {
  id: string
  label: string
  description?: string
  checked?: boolean
  onChange?: (checked: boolean) => void
}

export function Checkbox({
  id,
  label,
  description,
  checked,
  onChange,
}: CheckboxProps) {
  const descId = description ? `${id}-desc` : undefined

  return (
    <div className="flex items-start gap-3">
      <CheckboxPrimitive.Root
        id={id}
        checked={checked}
        onCheckedChange={onChange}
        aria-describedby={descId}
      />
      
      <div>
        <label htmlFor={id}>{label}</label>
        {description && (
          <p id={descId} className="text-sm text-muted">
            {description}
          </p>
        )}
      </div>
    </div>
  )
}
```

---

## 2. Modals e Dialogs

### 2.1 DragonModal (Parcialmente implementado)

**Status**: ✅ Parcialmente implementado, melhorias necessárias

#### Melhorias Sugeridas

**1. Suportar role="alertdialog" para modais críticas**

```tsx
type DragonModalRole = 'dialog' | 'alertdialog'

interface DragonModalProps {
  // ... existentes ...
  modalRole?: DragonModalRole // default 'dialog'
}

export function DragonModal({
  // ... props ...
  modalRole = 'dialog',
}: DragonModalProps) {
  const titleId = useId()
  const subtitleId = useId()
  
  return (
    <div
      role={modalRole}
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={subtitle ? subtitleId : undefined}
      // Novo: aria-controls para indicar elemento controlado
      aria-controls={modalRole === 'alertdialog' ? 'main' : undefined}
    >
      {/* ... */}
    </div>
  )
}
```

**2. Garantir foco inicial correto**

```tsx
// Já implementado em DragonModal, mas melhorar documentação:
useEffect(() => {
  if (!open) return
  
  const card = cardRef.current
  if (card && !card.contains(document.activeElement)) {
    // Procurar autofocus primeiro
    const autoFocus = card.querySelector('[autofocus]') as HTMLElement
    if (autoFocus) {
      autoFocus.focus()
    } else {
      card.focus()
    }
  }
}, [open])
```

**3. Adicionar aria-label para icon (redundante se houver título)**

```tsx
{Icon && (
  <span 
    className={...}
    aria-hidden={!!title} // aria-hidden se há título
    aria-label={!title ? ariaIconLabel : undefined}
  >
    <Icon className="h-5 w-5" aria-hidden />
  </span>
)}
```

---

### 2.2 Confirmation Modal Pattern

**Novo componente** a criar: `components/ui/ConfirmationModal.tsx`

```tsx
interface ConfirmationModalProps {
  open: boolean
  onClose: () => void
  onConfirm: () => void | Promise<void>
  title: string
  description?: string
  confirmLabel?: string
  cancelLabel?: string
  variant?: 'default' | 'danger'
}

export function ConfirmationModal({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  variant = 'default',
}: ConfirmationModalProps) {
  return (
    <DragonModal
      open={open}
      onClose={onClose}
      title={title}
      subtitle={description}
      variant={variant === 'danger' ? 'danger' : 'default'}
      modalRole="alertdialog" // ARIA: alertdialog para confirmações
      footer={
        <>
          <button 
            onClick={onClose}
            className="ghost"
          >
            {cancelLabel}
          </button>
          <button 
            onClick={onConfirm}
            className={variant === 'danger' ? 'destructive' : 'default'}
          >
            {confirmLabel}
          </button>
        </>
      }
    />
  )
}
```

---

## 3. Landmarks Estruturais

### 3.1 Main Layout Pattern

**Arquivo**: `pdv-importados/app/layout.tsx` (RootLayout)

```tsx
export function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <head>
        {/* ... */}
      </head>
      <body>
        {/* LANDMARK: Banner/Header */}
        <header role="banner" className="...">
          {/* Logo, skip link */}
          <a 
            href="#main-content"
            className="sr-only focus:not-sr-only"
          >
            Ir para conteúdo principal
          </a>
          
          {/* Navigation */}
          <nav 
            aria-label="Navegação principal"
            className="..."
          >
            {/* Links de navegação */}
          </nav>
        </header>

        {/* LANDMARK: Main */}
        <main 
          id="main-content"
          role="main"
          className="..."
        >
          {children}
        </main>

        {/* LANDMARK: Sidebar (complementary) */}
        <aside 
          role="complementary"
          aria-label="Filtros"
          className="..."
        >
          {/* Filtros, sidebar */}
        </aside>

        {/* LANDMARK: Footer */}
        <footer role="contentinfo" className="...">
          {/* Copyright, links legais */}
        </footer>
      </body>
    </html>
  )
}
```

### 3.2 Skip Link

Implementar "Skip to main content" para navegação por teclado:

```tsx
// Adicionar ao header
<a 
  href="#main-content"
  className="
    fixed top-0 left-0 -translate-y-full 
    focus:translate-y-0 focus:bg-black focus:text-white focus:p-2
    transition-transform
    z-50
  "
>
  Ir para conteúdo principal
</a>
```

**CSS Utility (sr-only)**:
```css
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border-width: 0;
}

.focus\:not-sr-only:focus {
  position: static;
  width: auto;
  height: auto;
  padding: inherit;
  margin: inherit;
  overflow: visible;
  clip: auto;
  white-space: normal;
}
```

---

## 4. Live Regions (Dinâmicas)

### 4.1 Toast/Alert System

**Arquivo**: `components/ui/Toast.tsx` (novo ou atualização)

```tsx
interface ToastProps {
  open: boolean
  title: string
  description?: string
  variant?: 'default' | 'success' | 'error' | 'warning'
  duration?: number
  onClose: () => void
}

export function Toast({
  open,
  title,
  description,
  variant = 'default',
  duration = 5000,
  onClose,
}: ToastProps) {
  const ariaLive = variant === 'error' ? 'assertive' : 'polite'

  return open ? (
    <div
      role="status"
      aria-live={ariaLive}
      aria-atomic="true"
      className="..."
    >
      <div className="...">
        <h3>{title}</h3>
        {description && <p>{description}</p>}
      </div>
      <button 
        onClick={onClose}
        aria-label="Fechar notificação"
      >
        ✕
      </button>
    </div>
  ) : null
}
```

**Padrão Live Region**:
- `role="status"`: Para status/notificações
- `aria-live="polite"`: Notificações normais (espera ler)
- `aria-live="assertive"`: Erros críticos (interrompe leitura)
- `aria-atomic="true"`: Lê conteúdo inteiro, não incremento

---

### 4.2 CaixaTotais com aria-live

**Arquivo**: `components/caixa/CaixaTotais.tsx`

```tsx
export function CaixaTotais({ saldo, totalMovimentacoes }: CaixaTotaisProps) {
  const descId = useId()

  return (
    <div
      role="region"
      aria-live="polite"
      aria-atomic="false" // Apenas mudanças, não tudo
      aria-labelledby={descId}
      className="..."
    >
      <h2 id={descId}>Resumo Financeiro</h2>
      
      <div className="...">
        <div>
          <span className="text-muted">Saldo Atual</span>
          <strong className="text-lg">
            {formatCurrency(saldo)}
          </strong>
        </div>
        
        <div>
          <span className="text-muted">Total de Movimentações</span>
          <strong className="text-lg">
            {formatCurrency(totalMovimentacoes)}
          </strong>
        </div>
      </div>
    </div>
  )
}
```

---

## 5. Keyboard Navigation Patterns

### 5.1 Dropdown Menu com Teclado

```tsx
export function DropdownMenu({ items, onSelect }: Props) {
  const [open, setOpen] = useState(false)
  const [focusedIndex, setFocusedIndex] = useState(0)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!open) return

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setFocusedIndex(prev => 
          prev < items.length - 1 ? prev + 1 : 0
        )
        break
      case 'ArrowUp':
        e.preventDefault()
        setFocusedIndex(prev => 
          prev > 0 ? prev - 1 : items.length - 1
        )
        break
      case 'Enter':
      case ' ':
        e.preventDefault()
        onSelect(items[focusedIndex])
        setOpen(false)
        break
      case 'Escape':
        e.preventDefault()
        setOpen(false)
        triggerRef.current?.focus()
        break
      case 'Home':
        e.preventDefault()
        setFocusedIndex(0)
        break
      case 'End':
        e.preventDefault()
        setFocusedIndex(items.length - 1)
        break
    }
  }

  return (
    <div>
      <button
        ref={triggerRef}
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen(!open)}
      >
        Ações ⋮
      </button>

      {open && (
        <div
          ref={menuRef}
          role="menu"
          onKeyDown={handleKeyDown}
        >
          {items.map((item, idx) => (
            <button
              key={idx}
              role="menuitem"
              aria-current={idx === focusedIndex}
              onClick={() => {
                onSelect(item)
                setOpen(false)
              }}
              autoFocus={idx === focusedIndex}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
```

---

## 6. Testing ARIA

### 6.1 Automated Testing com axe-core

```tsx
// vitest + axe-core
import { injectAxe, checkA11y } from 'axe-playwright'

describe('CaixaForm ARIA', () => {
  test('form should be accessible', async ({ page }) => {
    await page.goto('/caixa')
    await injectAxe(page)
    await checkA11y(page)
  })
})
```

### 6.2 Manual Testing Checklist

**NVDA (Windows)**
- [ ] Abrir página, ler header
- [ ] Tab até main content, ler título
- [ ] Tab pelos inputs, ouvir labels e hints
- [ ] Tab para botão, ler aria-label se icon-only
- [ ] Escape em modal, ouço "modal fechado"
- [ ] Atualização de total, ouço mudança em time real

**Keyboard Only (todos os browsers)**
- [ ] Tab navega fluidamente
- [ ] Shift+Tab volta
- [ ] Enter em botões
- [ ] Escape em modals
- [ ] Setas em menus/selects

---

## 7. Checklist Final por Componente

### Button.tsx
- [ ] aria-label para icon-only
- [ ] aria-pressed para toggles
- [ ] aria-expanded para dropdowns
- [ ] Test com axe ✅

### Input/FormField.tsx
- [ ] aria-label ou label htmlFor
- [ ] aria-describedby para hints
- [ ] aria-invalid para erros
- [ ] aria-required se necessário
- [ ] Test com axe ✅

### DragonModal.tsx
- [x] role="dialog"
- [x] aria-modal="true"
- [x] aria-labelledby + aria-describedby
- [ ] Suportar role="alertdialog"
- [ ] Test com NVDA ✅

### Layout.tsx
- [ ] header role="banner"
- [ ] nav aria-label
- [ ] main role="main"
- [ ] aside role="complementary"
- [ ] footer role="contentinfo"
- [ ] Skip link ✅

### CaixaTotais.tsx
- [ ] aria-live="polite"
- [ ] aria-atomic="false"
- [ ] role="region"
- [ ] Test com NVDA ✅

### Toast/Alerts
- [ ] role="status"
- [ ] aria-live (polite/assertive)
- [ ] aria-atomic="true"
- [ ] Test com NVDA ✅

---

## Referências

- [WCAG 2.1 Guidelines](https://www.w3.org/WAI/WCAG21/quickref/)
- [ARIA Authoring Practices](https://www.w3.org/WAI/ARIA/apg/)
- [MDN: ARIA](https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA)
- [Radix UI: Accessibility](https://radix-ui.com/)

---

*Documento ativo — Atualizar conforme implementação progride.*
