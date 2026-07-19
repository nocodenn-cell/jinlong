import * as React from 'react'
import { cn } from '@/lib/utils'

export type InputProps = React.InputHTMLAttributes<HTMLInputElement> & {
  controlSize?: 'default' | 'sm'
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type = 'text', controlSize = 'default', ...props }, ref) => (
    <input
      type={type}
      className={cn(
        'fp-control',
        controlSize === 'sm' && 'fp-control--sm',
        className,
      )}
      ref={ref}
      {...props}
    />
  ),
)
Input.displayName = 'Input'
