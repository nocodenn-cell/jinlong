import type { ReactNode } from 'react'
import { bloqueioPorPlano } from '@/lib/cobranca/bloqueioPorPlano'
import { PageHeader } from '@/components/ui/admin-v2'
import { FinanceiroHubNavShell } from '@/components/ui/admin-v2/FinanceiroHubNavShell'
import { loadAdminContext } from '@/lib/admin/auth/loadAdminContext'
import { getMessages } from '@/i18n/getMessages'
import { ComissoesModuloNav, type AbaComissao } from './ComissoesModuloNav'
import { rotulosAbasComissao } from './abas'
import { textosComissao } from './textos'

/** Casca comum das páginas do módulo: plano, sessão gerencial, cabeçalho, abas. */
export async function paginaComissao(aba: AbaComissao, render: (t: Record<string, string>) => Promise<ReactNode> | ReactNode) {
  const bloqueio = await bloqueioPorPlano('comissoes')
  if (bloqueio) return bloqueio
  const { session } = await loadAdminContext({ pathname: `/admin/comissoes/${aba}`, resource: 'route:/admin/comissoes' })
  const m = getMessages(session.idioma)
  const t = textosComissao(m)
  return (
    <div className="admin-v2-page admin-v2-stack">
      <PageHeader title={t[`${aba}_titulo`] ?? ''} subtitle={t[`${aba}_sub`]} />
      <FinanceiroHubNavShell />
      <ComissoesModuloNav ativa={aba} rotulos={rotulosAbasComissao(m)} />
      {await render(t)}
    </div>
  )
}
