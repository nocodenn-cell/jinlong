import { Suspense } from 'react'
import { AdminHubTabNav } from '@/components/ui/admin-v2/AdminHubTabNav'
import { ESTOQUE_HUB_TABS } from '@/lib/navigation/estoqueHubNav'

export function EstoqueHubNav() {
  return (
    <Suspense fallback={<div className="mb-4 h-9 animate-pulse rounded-lg bg-[var(--color-surface-soft)]" />}>
      <AdminHubTabNav tabs={ESTOQUE_HUB_TABS} ariaLabel="Hub estoque" />
    </Suspense>
  )
}
