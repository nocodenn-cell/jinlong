import { cn } from '@/lib/utils'

type SpinnerProps = {
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

const SIZE_CLASS = {
  sm: 'h-4 w-4 border-2',
  md: 'h-6 w-6 border-2',
  lg: 'h-8 w-8 border-[3px]',
}

export function Spinner({ size = 'md', className }: SpinnerProps) {
  return (
    <span
      role="status"
      aria-label="Carregando"
      className={cn(
        'inline-block animate-spin rounded-full border-[#1a56db]/20 border-t-[#1a56db]',
        SIZE_CLASS[size],
        className,
      )}
    />
  )
}
