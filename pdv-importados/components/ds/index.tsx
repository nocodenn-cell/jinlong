/**
 * ============================================================================
 * DESIGN SYSTEM — COMPONENT LAYER (React)
 * ----------------------------------------------------------------------------
 * Componentes estáveis, sem estilo fixo: resolvem visual SÓ por token + variant
 * (classes .ds-* em styles/ds/components.css). Não conhecem tema nem produto.
 * Trocar o tema (DSRoot data-theme) muda a identidade sem refatorar nada aqui.
 * ============================================================================
 */
import * as React from 'react'
import { cn } from '@/lib/utils'

export type DSTheme = 'commercial-gold' | 'default' | 'dragon'
export type DSDensity = 'compact' | 'default' | 'spacious'

/** Escopo de Theme + Density. Aninhável: um trecho pode ter tema/densidade próprios. */
export function DSRoot({
  theme,
  density,
  asChild,
  className,
  children,
  ...rest
}: Readonly<{
  theme?: DSTheme
  density?: DSDensity
  asChild?: boolean
  className?: string
  children: React.ReactNode
}> & React.HTMLAttributes<HTMLDivElement>) {
  const dataAttrs = {
    'data-theme': theme,
    'data-density': density,
  }
  if (asChild && React.isValidElement(children)) {
    return React.cloneElement(children as React.ReactElement, dataAttrs)
  }
  return (
    <div className={className} {...dataAttrs} {...rest}>
      {children}
    </div>
  )
}

/* ------------------------------------------------------------------ Button */
export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
export type ControlSize = 'sm' | 'md' | 'lg'

export const Button = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: ButtonVariant
    size?: ControlSize
    block?: boolean
  }
>(function Button({ variant = 'primary', size = 'md', block, className, ...rest }, ref) {
  return (
    <button
      ref={ref}
      className={cn('ds-btn', className)}
      data-variant={variant}
      data-size={size === 'md' ? undefined : size}
      data-block={block ? 'true' : undefined}
      {...rest}
    />
  )
})

/* -------------------------------------------------------------------- Card */
export function Card({
  elevation = 1,
  recessive,
  className,
  ...rest
}: React.HTMLAttributes<HTMLDivElement> & {
  elevation?: 0 | 1 | 2
  recessive?: boolean
}) {
  return (
    <div
      className={cn('ds-card', className)}
      data-elevation={elevation === 0 ? undefined : String(elevation)}
      data-recessive={recessive ? 'true' : undefined}
      {...rest}
    />
  )
}
export const CardTitle = ({ className, ...p }: React.HTMLAttributes<HTMLHeadingElement>) => (
  <h2 className={cn('ds-card-title', className)} {...p} />
)
export const CardSubtitle = ({ className, ...p }: React.HTMLAttributes<HTMLParagraphElement>) => (
  <p className={cn('ds-card-subtitle', className)} {...p} />
)

/* ------------------------------------------------------------- Field/Input */
export function Field({
  label,
  htmlFor,
  className,
  children,
}: Readonly<{ label: string; htmlFor?: string; className?: string; children: React.ReactNode }>) {
  return (
    <div className={cn('ds-field', className)}>
      <label className="ds-field-label" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
    </div>
  )
}
export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...rest }, ref) {
    return <input ref={ref} className={cn('ds-input', className)} {...rest} />
  },
)
export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ className, ...rest }, ref) {
    return <select ref={ref} className={cn('ds-select ds-input', className)} {...rest} />
  },
)

/* -------------------------------------------------------------- Primitives */
export const Text = ({
  tone,
  as: As = 'span',
  className,
  ...p
}: React.HTMLAttributes<HTMLElement> & { tone?: 'muted' | 'subtle' | 'accent'; as?: React.ElementType }) => (
  <As className={cn('ds-text', className)} data-tone={tone} {...p} />
)
export const Stack = ({ className, ...p }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('ds-stack', className)} {...p} />
)
export const Grid = ({ className, ...p }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('ds-grid', className)} {...p} />
)

/* ------------------------------------------------------------------- Badge */
export type BadgeTone = 'success' | 'danger' | 'warning' | 'info' | 'neutral'
export const Badge = ({
  tone = 'neutral',
  className,
  ...p
}: React.HTMLAttributes<HTMLSpanElement> & { tone?: BadgeTone }) => (
  <span className={cn('ds-badge', className)} data-tone={tone} {...p} />
)
