import { Suspense } from 'react'
import { AdminHubTabNav } from '@/components/ui/admin-v2/AdminHubTabNav'
import { CATALOGO_HUB_TABS } from '@/lib/navigation/catalogoHubNav'

export function CatalogoHubNav() {
  return (
    <Suspense fallback={<div className="mb-4 h-9 animate-pulse rounded-lg bg-[var(--color-surface-soft)]" />}>
      <AdminHubTabNav tabs={CATALOGO_HUB_TABS} ariaLabel="Hub catálogo" />
    </Suspense>
  )
}
