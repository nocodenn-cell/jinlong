import { PageHeader } from '@/components/ui/admin-v2'
import { loadAdminContext } from '@/lib/admin/auth/loadAdminContext'
import { getMessages } from '@/i18n/getMessages'
import { ROUTES } from '@shared-core/navigation/routes'
import { ProvisionamentoWizardClient } from './ProvisionamentoWizardClient'

export default async function AdminProvisionamentoPage() {
  const { session } = await loadAdminContext({
    pathname: ROUTES.admin.provisionamento,
    resource: `route:${ROUTES.admin.provisionamento}`,
  })
  const m = getMessages(session.idioma)
  const ui = m.provisionamento

  if (session.perfil !== 'ADMIN') {
    return (
      <div className="admin-v2-page">
        <PageHeader title={ui.titulo} subtitle={ui.subtitulo} />
        <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {ui.apenas_admin}
        </p>
      </div>
    )
  }

  return (
    <div className="admin-v2-page">
      <PageHeader title={ui.titulo} subtitle={ui.subtitulo} />
      <ProvisionamentoWizardClient
        labels={{
          stepLoja: ui.step_loja,
          stepDono: ui.step_dono,
          stepConfirmar: ui.step_confirmar,
          stepResultado: ui.step_resultado,
          fieldLojaNome: ui.field_loja_nome,
          fieldLojaCodigo: ui.field_loja_codigo,
          fieldLojaCodigoHint: ui.field_loja_codigo_hint,
          fieldDonoNome: ui.field_dono_nome,
          fieldDonoEmail: ui.field_dono_email,
          fieldDonoSenha: ui.field_dono_senha,
          fieldIdioma: ui.field_idioma,
          idiomaPt: ui.idioma_pt,
          idiomaZh: ui.idioma_zh,
          senhaHint: ui.senha_hint,
          btnProximo: ui.btn_proximo,
          btnVoltar: ui.btn_voltar,
          btnProvisionar: ui.btn_provisionar,
          btnProvisionando: ui.btn_provisionando,
          btnNovo: ui.btn_novo,
          avisoInterno: ui.aviso_interno,
          avisoNfce: ui.aviso_nfce,
          resumoTitulo: ui.resumo_titulo,
          okLoja: ui.ok_loja,
          okDono: ui.ok_dono,
          okConfig: ui.ok_config,
          okChecklist: ui.ok_checklist,
          linkImplantacao: ui.link_implantacao,
          reutilizado: ui.reutilizado,
          criado: ui.criado,
        }}
      />
    </div>
  )
}
