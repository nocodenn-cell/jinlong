import * as React from 'react'
import { cn } from '@/lib/utils'

export type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => (
    <textarea
      className={cn('fp-control fp-control--textarea', className)}
      ref={ref}
      {...props}
    />
  ),
)
Textarea.displayName = 'Textarea'
