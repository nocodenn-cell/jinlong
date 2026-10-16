'use client'

import { Suspense, useMemo } from 'react'
import { AdminHubTabNav } from '@/components/ui/admin-v2/AdminHubTabNav'
import { useAdminV2Session } from '@/components/ui/admin-v2/AdminV2SessionContext'
import { getMessages } from '@/i18n/getMessages'
import {
  buildOperationalHubTabs,
  operationalHubLabelsFromAdminUi,
  type OperationalHubId,
} from '@/lib/navigation/operationalHubNav'

function OperationalHubNavInner({ hub }: { hub: OperationalHubId }) {
  const { idioma } = useAdminV2Session()
  const ui = getMessages(idioma).admin_ui
  const tabs = useMemo(
    () => buildOperationalHubTabs(hub, operationalHubLabelsFromAdminUi(ui)),
    [hub, ui],
  )
  const ariaLabel =
    hub === 'vendas' ? ui.hub_aria_vendas : hub === 'compras' ? ui.hub_aria_compras : ui.hub_aria_loja
  return <AdminHubTabNav tabs={tabs} ariaLabel={ariaLabel} />
}

/** Barra de abas dos hubs Vender, Abastecer e Loja e equipe (mesmo padrão visual de Catálogo/Estoque). */
export function OperationalHubNav({ hub }: { hub: OperationalHubId }) {
  return (
    <Suspense fallback={<div className="mb-4 h-9 animate-pulse rounded-lg bg-[var(--color-surface-soft)]" />}>
      <OperationalHubNavInner hub={hub} />
    </Suspense>
  )
}
