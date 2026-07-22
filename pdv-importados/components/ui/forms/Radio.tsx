import * as React from 'react'
import { cn } from '@/lib/utils'

export type RadioProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'>

export const Radio = React.forwardRef<HTMLInputElement, RadioProps>(
  ({ className, ...props }, ref) => (
    <input type="radio" className={cn('fp-radio', className)} ref={ref} {...props} />
  ),
)
Radio.displayName = 'Radio'
