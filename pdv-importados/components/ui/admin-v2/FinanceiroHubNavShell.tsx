'use client'

import { Suspense, useMemo } from 'react'
import { FinanceiroHubNav } from '@/components/ui/admin-v2/AdminHubTabNav'
import { useAdminV2Session } from '@/components/ui/admin-v2/AdminV2SessionContext'
import { getMessages } from '@/i18n/getMessages'
import type { FinanceiroTabId } from '@/lib/navigation/financeiroTabId'

type Props = {
  activeTab?: FinanceiroTabId
}

function FinanceiroHubNavInner({ activeTab }: { activeTab: FinanceiroTabId }) {
  const { idioma } = useAdminV2Session()
  const ui = getMessages(idioma).admin_ui
  const labels = useMemo(
    () => ({
      resumo: ui.hub_financeiro_resumo,
      resultado: ui.hub_financeiro_resultado,
      receber: ui.hub_financeiro_receber,
      pagar: ui.hub_financeiro_pagar,
      contasConciliacao: ui.hub_financeiro_contas_conciliacao,
      contas: ui.hub_financeiro_contas,
      recebiveis: ui.hub_financeiro_recebiveis,
      conciliacao: ui.hub_financeiro_conciliacao,
      fiscal: ui.hub_financeiro_fiscal,
      comissoes: ui.hub_financeiro_comissoes,
    }),
    [ui],
  )
  return (
    <FinanceiroHubNav activeTab={activeTab} labels={labels}
      ariaLabel={ui.hub_aria_financeiro}
      subAriaLabel={ui.hub_aria_financeiro_vistas}
    />
  )
}

export function FinanceiroHubNavShell({ activeTab = 'receber' }: Props) {
  return (
    <Suspense fallback={<div className="mb-4 h-9 animate-pulse rounded-lg bg-[var(--color-surface-soft)]" />}>
      <FinanceiroHubNavInner activeTab={activeTab} />
    </Suspense>
  )
}
