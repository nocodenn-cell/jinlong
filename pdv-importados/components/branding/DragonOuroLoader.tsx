import { DragonIcon } from '@/components/icons/DragonIcon'
import { cn } from '@/lib/utils'

type Props = {
  className?: string
  /** Tamanho do ícone em Tailwind (ex.: h-5 w-5) */
  iconClassName?: string
}

/** Estado de carregamento — dragão em órbita (substitui spinner genérico). */
export function DragonOuroLoader({ className, iconClassName }: Props) {
  return (
    <span
      className={cn('dragon-orbit-wrap text-amber-500', className)}
      role="status"
      aria-live="polite"
      aria-label="Carregando"
    >
      <DragonIcon className={cn('h-5 w-5', iconClassName)} aria-hidden />
    </span>
  )
}
