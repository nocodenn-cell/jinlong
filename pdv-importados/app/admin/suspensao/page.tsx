/**
 * FastProduct Admin — Suspensão de Vendas (Sprint 4 / RFC-UX-018)
 */

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
  const m = getMessages(session.idioma)
  const ui = m.admin_ui
  const res = await carregarSuspensaoVendas()
  const status = res.success ? res.data : { suspensas: false, motivo: '' }

  return (
    <SuspensaoContent
      statusInicial={status}
      labels={{
        titulo: ui.suspensao_titulo,
        subtitulo: ui.suspensao_subtitulo,
        statusTitulo: ui.suspensao_status_titulo,
        alertTitulo: ui.suspensao_alert_titulo,
        alertDesc: ui.suspensao_alert_desc,
        labelSuspensas: ui.suspensao_label_suspensas,
        labelAtivas: ui.suspensao_label_ativas,
        motivoLabel: ui.suspensao_motivo_label,
        motivoPlaceholder: ui.suspensao_motivo_placeholder,
        charsTemplate: ui.suspensao_chars_template,
        btnSalvar: ui.suspensao_btn_salvar,
        btnSalvando: ui.suspensao_btn_salvando,
        confirmTitulo: ui.suspensao_confirm_titulo,
        confirmDesc: ui.suspensao_confirm_desc,
        confirmOk: ui.suspensao_confirm_ok,
        confirmCancel: m.comum.cancelar,
        toastOk: ui.suspensao_toast_ok,
      }}
    />
  )
}
