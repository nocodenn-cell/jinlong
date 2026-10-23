import { bloqueioPorPlano } from '@/lib/cobranca/bloqueioPorPlano'
import { PageHeader } from '@/components/ui/admin-v2'
import { FinanceiroHubNavShell } from '@/components/ui/admin-v2/FinanceiroHubNavShell'
import { loadAdminContext } from '@/lib/admin/auth/loadAdminContext'
import { getMessages } from '@/i18n/getMessages'
import { listarFalhasComissao } from '@/app/gerente/comissoes/moduloActions'
import { ComissoesModuloNav } from '../_modulo/ComissoesModuloNav'
import { rotulosAbasComissao } from '../_modulo/abas'
import { FalhasComissaoTable } from './FalhasComissaoTable'

export default async function ComissoesFalhasPage() {
  const bloqueio = await bloqueioPorPlano('comissoes')
  if (bloqueio) return bloqueio
  const { session } = await loadAdminContext({ pathname: '/admin/comissoes/falhas', resource: 'route:/admin/comissoes' })
  const m = getMessages(session.idioma)
  const ui = m.admin_ui
  const res = await listarFalhasComissao()
  return (
    <div className="admin-v2-page admin-v2-stack">
      <PageHeader title={ui.comissoes_falhas_titulo} subtitle={ui.comissoes_falhas_sub} />
      <FinanceiroHubNavShell />
      <ComissoesModuloNav ativa="falhas" rotulos={rotulosAbasComissao(m)} />
      <FalhasComissaoTable
        falhas={res.success ? res.data : []}
        erro={res.success ? null : res.error}
        labels={{
          vazio: ui.comissoes_falhas_vazio,
          venda: ui.comissoes_falhas_col_venda,
          etapa: ui.comissoes_falhas_col_etapa,
          motivo: ui.comissoes_falhas_col_motivo,
          tentativas: ui.comissoes_falhas_col_tentativas,
          quando: ui.comissoes_falhas_col_quando,
          reprocessar: ui.comissoes_falhas_reprocessar,
          reprocessado: ui.comissoes_falhas_reprocessado,
          aindaFalha: ui.comissoes_falhas_ainda_falha,
        }}
      />
    </div>
  )
}
