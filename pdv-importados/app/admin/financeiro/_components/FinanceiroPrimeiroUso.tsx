'use client'

import Link from 'next/link'
import { SectionCard } from '@/components/ui/admin-v2'
import { useAdminV2Session } from '@/components/ui/admin-v2/AdminV2SessionContext'
import { getMessages } from '@/i18n/getMessages'
import { ROUTES } from '@/lib/navigation/routes'

export function FinanceiroPrimeiroUso({ semContas }: { semContas: boolean }) {
  const { idioma } = useAdminV2Session()
  const ui = getMessages(idioma).admin_ui
  if (!semContas) return null
  return <SectionCard title={ui.financeiro_inicio_titulo}>
    <p className="text-small">{ui.financeiro_inicio_contas}</p>
    <p className="mt-2 text-small text-jl-fg-3">{ui.financeiro_inicio_saldo}</p>
    <p className="mt-2 text-small text-jl-fg-3">{ui.financeiro_inicio_despesas}</p>
    <div className="mt-3 flex flex-wrap gap-3 text-small">
      <Link className="underline" href={`${ROUTES.admin.financeiro}?tab=contas`}>{ui.financeiro_inicio_cadastrar}</Link>
      <Link className="underline" href={`${ROUTES.admin.financeiro}?tab=pagar`}>{ui.hub_financeiro_pagar}</Link>
      <Link className="underline" href={`${ROUTES.admin.financeiro}?tab=recebiveis`}>{ui.hub_financeiro_recebiveis}</Link>
    </div>
  </SectionCard>
}
