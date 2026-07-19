import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Button — único primitivo de botão do Design System (Fase 2 · Onda 2).
 *
 * Variantes: primary | secondary | outline | ghost | danger | success
 * Estados: hover | active | disabled | loading | focus
 *
 * @deprecated Não usar classes .app-btn-* em código novo.
 */

const buttonVariants = cva('fp-btn', {
  variants: {
    variant: {
      primary: 'fp-btn--primary',
      secondary: 'fp-btn--secondary',
      outline: 'fp-btn--outline',
      ghost: 'fp-btn--ghost',
      danger: 'fp-btn--danger',
      success: 'fp-btn--success',
      /** @deprecated use primary */
      default: 'fp-btn--primary',
      /** @deprecated use danger */
      destructive: 'fp-btn--danger',
      /** @deprecated use primary */
      link: 'fp-btn--ghost underline underline-offset-4',
    },
    size: {
      default: '',
      sm: 'fp-btn--sm',
      lg: 'fp-btn--lg',
      icon: 'fp-btn--icon',
    },
  },
  defaultVariants: {
    variant: 'primary',
    size: 'default',
  },
})

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
  loading?: boolean
  /** aria-label for icon-only buttons */
  ariaLabel?: string
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant,
      size,
      asChild = false,
      loading = false,
      disabled,
      ariaLabel,
      children,
      ...props
    },
    ref,
  ) => {
    const Comp = asChild ? Slot : 'button'
    const isDisabled = Boolean(disabled || loading)
    const content =
      loading && !asChild ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          <span className="sr-only">Carregando</span>
          {children}
        </>
      ) : (
        children
      )

    return (
      <Comp
        className={cn(buttonVariants({ variant, size }), className)}
        ref={ref}
        aria-label={ariaLabel}
        aria-disabled={isDisabled || undefined}
        data-loading={loading ? 'true' : undefined}
        disabled={asChild ? undefined : isDisabled}
        {...props}
      >
        {content}
      </Comp>
    )
  },
)
Button.displayName = 'Button'

export { Button, buttonVariants }
