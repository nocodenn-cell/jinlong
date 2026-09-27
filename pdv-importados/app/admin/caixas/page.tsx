/**
 * FastProduct Admin — Histórico de caixas (S9, G-01)
 *
 * Server Component. SOMENTE-LEITURA sobre `caixas` (status FECHADO) — nenhuma
 * tabela/RPC nova. Corrige o item de menu "Caixas", que antes apontava para
 * `/admin/vendas` (lista de vendas, não de turnos) sem nenhuma tela real de
 * histórico de fechamento existir.
 */

import { ROUTES } from '@shared-core/navigation/routes'
import { loadAdminContext } from '@/lib/admin/auth/loadAdminContext'
import { PageHeader } from '@/components/ui/admin-v2'
import { localeFromIdioma } from '@/lib/idioma/localeFromIdioma'
import { getMessages } from '@/i18n/getMessages'
import { listarHistoricoCaixas } from '@/app/gerente/caixas/actions'
import { CaixasHistoricoTable } from './_components/CaixasHistoricoTable'

export default async function AdminCaixasPage() {
  const { session } = await loadAdminContext({
    pathname: ROUTES.admin.caixas,
    resource: `route:${ROUTES.admin.caixas}`,
  })
  const m = getMessages(session.idioma)
  const ui = m.admin_ui
  const locale = localeFromIdioma(session.idioma)

  const resultado = await listarHistoricoCaixas()
  const linhas = resultado.ok ? resultado.data : []

  return (
    <div className="admin-v2-page">
      <PageHeader title={ui.caixas_titulo} subtitle={ui.caixas_subtitulo} />
      <CaixasHistoricoTable
        linhas={linhas}
        erro={resultado.ok ? null : resultado.error}
        locale={locale}
        labels={{
          colOperador: ui.caixas_col_operador,
          colAbertura: ui.caixas_col_abertura,
          colFechamento: ui.caixas_col_fechamento,
          colValorSistema: ui.caixas_col_valor_sistema,
          colValorContado: ui.caixas_col_valor_contado,
          colDiferenca: ui.caixas_col_diferenca,
          colMotivo: ui.caixas_col_motivo,
          semMotivo: ui.caixas_sem_motivo,
          vazioTitulo: ui.caixas_vazio_titulo,
          vazioSub: ui.caixas_vazio_sub,
          detalheTitulo: ui.caixas_detalhe_titulo,
          detalheValorInicial: ui.caixas_detalhe_valor_inicial,
          detalheMovimentacoes: ui.caixas_detalhe_movimentacoes,
          detalheSemMovimentacoes: ui.caixas_detalhe_sem_movimentacoes,
          movTipoSangria: ui.caixas_mov_tipo_sangria,
          movTipoSuprimento: ui.caixas_mov_tipo_suprimento,
          fecharAria: ui.caixas_fechar_aria,
          erroTitulo: ui.caixas_erro_titulo,
        }}
      />
    </div>
  )
}
