import * as React from 'react'
import { cn } from '@/lib/utils'

export type CheckboxProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'>

export const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className, ...props }, ref) => (
    <input type="checkbox" className={cn('fp-check', className)} ref={ref} {...props} />
  ),
)
Checkbox.displayName = 'Checkbox'
