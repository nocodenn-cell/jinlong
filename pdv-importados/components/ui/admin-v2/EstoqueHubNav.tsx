'use client'

import { Suspense, useMemo } from 'react'
import { AdminHubTabNav } from '@/components/ui/admin-v2/AdminHubTabNav'
import { useAdminV2Session } from '@/components/ui/admin-v2/AdminV2SessionContext'
import { getMessages } from '@/i18n/getMessages'
import { buildEstoqueHubTabs, hubLabelsFromAdminUi } from '@/lib/navigation/hubNavLabels'

function EstoqueHubNavInner() {
  const { idioma } = useAdminV2Session()
  const ui = getMessages(idioma).admin_ui
  const tabs = useMemo(
    () => buildEstoqueHubTabs(hubLabelsFromAdminUi(ui)),
    [ui],
  )
  return <AdminHubTabNav tabs={tabs} ariaLabel={ui.hub_aria_estoque} />
}

export function EstoqueHubNav() {
  return (
    <Suspense fallback={<div className="mb-4 h-9 animate-pulse rounded-lg bg-[var(--color-surface-soft)]" />}>
      <EstoqueHubNavInner />
    </Suspense>
  )
}
