import * as React from 'react'
import { RefreshCw } from 'lucide-react'
import { Button, type ButtonProps } from '@/components/ui/button'

export type RetryButtonProps = Omit<ButtonProps, 'children' | 'variant'> & {
  label?: string
}

export function RetryButton({ label = 'Tentar novamente', ...props }: RetryButtonProps) {
  return (
    <Button type="button" variant="secondary" {...props}>
      <RefreshCw className="h-4 w-4" aria-hidden />
      {label}
    </Button>
  )
}
