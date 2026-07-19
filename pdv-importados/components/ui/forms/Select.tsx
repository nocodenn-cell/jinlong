import * as React from 'react'
import { cn } from '@/lib/utils'

export type SelectProps = React.SelectHTMLAttributes<HTMLSelectElement> & {
  controlSize?: 'default' | 'sm'
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, controlSize = 'default', children, ...props }, ref) => (
    <select
      className={cn(
        'fp-control',
        controlSize === 'sm' && 'fp-control--sm',
        className,
      )}
      ref={ref}
      {...props}
    >
      {children}
    </select>
  ),
)
Select.displayName = 'Select'
