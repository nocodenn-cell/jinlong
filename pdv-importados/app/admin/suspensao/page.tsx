/**
 * FastProduct Admin — Suspensão de Vendas (Fase 9)
 *
 * Server Component. Carrega status de suspensão via action.
 * Zero query nova — reutiliza actions existentes de /gerente/suspensao.
 */

import { PageHeader } from '@/components/ui/admin-v2'
import { carregarSuspensaoVendas } from '@/app/gerente/suspensao/actions'
import { loadAdminContext } from '@/lib/admin/auth/loadAdminContext'
import { getMessages } from '@/i18n/getMessages'
import { ROUTES } from '@shared-core/navigation/routes'
import { SuspensaoContent } from './_components/SuspensaoContent'

export default async function AdminSuspensaoPage() {
  const { session } = await loadAdminContext({
    pathname: ROUTES.admin.suspensao,
    resource: `route:${ROUTES.admin.suspensao}`,
  })
  const ui = getMessages(session.idioma).admin_ui

  const res = await carregarSuspensaoVendas()
  const status = res.success ? res.data : { suspensas: false, motivo: '' }
  // res.error: falha real de carga — nunca deve ser tratada como "vendas ativas".
  const loadError = res.success ? null : res.error

  return (
    <div className="admin-v2-page">
      <PageHeader title={ui.suspensao_titulo} subtitle={ui.suspensao_subtitulo} />
      <SuspensaoContent
        statusInicial={status}
        loadError={loadError}
        labels={{
          titulo: ui.suspensao_titulo,
          subtitulo: ui.suspensao_subtitulo,
          erroCarregar: ui.suspensao_erro_carregar,
          alertaTitulo: ui.suspensao_alerta_titulo,
          alertaTexto: ui.suspensao_alerta_texto,
          statusSuspensas: ui.suspensao_status_suspensas,
          statusAtivas: ui.suspensao_status_ativas,
          motivoLabel: ui.suspensao_motivo_label,
          motivoPlaceholder: ui.suspensao_motivo_placeholder,
          motivoContador: ui.suspensao_motivo_contador,
          sucesso: ui.suspensao_sucesso,
          salvarBtn: ui.suspensao_salvar_btn,
          salvando: ui.suspensao_salvando,
        }}
      />
    </div>
  )
}
