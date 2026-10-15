'use client'

import type { ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { DragonModal } from '@/components/ui/DragonModal'

/**
 * Gaveta de drill-down dos KPIs do Dashboard. Abre quando a URL tem `?detalhe=`; fechar
 * (ESC, X, backdrop) troca a URL pela versão sem o detalhe, sem rolar a página.
 */
export function DashboardKpiDrawer({
  open,
  title,
  closeHref,
  closeLabel,
  children,
}: {
  open: boolean
  title: string
  closeHref: string
  closeLabel?: string
  children: ReactNode
}) {
  const router = useRouter()
  return (
    <DragonModal
      open={open}
      placement="drawer"
      title={title}
      closeLabel={closeLabel}
      onClose={() => router.replace(closeHref, { scroll: false })}
    >
      {children}
    </DragonModal>
  )
}
