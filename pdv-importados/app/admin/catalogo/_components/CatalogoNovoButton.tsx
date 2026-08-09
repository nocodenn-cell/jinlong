'use client'

import { Plus } from 'lucide-react'
import { usePathname, useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'

export function CatalogoNovoButton({
  label,
  titleHint,
}: {
  label: string
  /** Ex.: “Atalho: N” — aparece no title do botão. */
  titleHint?: string
}) {
  const router = useRouter()
  const pathname = usePathname()

  return (
    <Button
      type="button"
      variant="secondary"
      className="gap-1.5"
      title={titleHint ? `${label} (${titleHint})` : label}
      onClick={() => {
        // Evita useSearchParams no header (fora de Suspense): lê a query atual no clique.
        const params = new URLSearchParams(
          typeof window !== 'undefined' ? window.location.search : '',
        )
        params.set('modal', 'novo')
        router.push(`${pathname}?${params.toString()}`, { scroll: false })
      }}
    >
      <Plus size={14} aria-hidden />
      {label}
    </Button>
  )
}
