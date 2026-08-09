'use client'

import { useRouter } from 'next/navigation'
import { ErrorState } from '@/components/ui/feedback'

type Props = Readonly<{
  description: string
  retryLabel: string
}>

/** Erro de carga do catálogo com retry via refresh RSC (sem nova API). */
export function CatalogoLoadError({ description, retryLabel }: Props) {
  const router = useRouter()
  return (
    <ErrorState
      dense
      description={description}
      retryLabel={retryLabel}
      onRetry={() => router.refresh()}
      className="mb-4 items-start text-left"
    />
  )
}
