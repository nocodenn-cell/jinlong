import { Suspense } from 'react'
import { FinanceiroHubNav } from '@/components/ui/admin-v2/AdminHubTabNav'
import type { FinanceiroTabId } from '@/app/admin/financeiro/_components/financeiroTabs'

type Props = {
  activeTab?: FinanceiroTabId
}

export function FinanceiroHubNavShell({ activeTab = 'receber' }: Props) {
  return (
    <Suspense fallback={<div className="mb-4 h-9 animate-pulse rounded-lg bg-[var(--color-surface-soft)]" />}>
      <FinanceiroHubNav activeTab={activeTab} />
    </Suspense>
  )
}
