import { PageHeader } from '@/components/ui/admin-v2'
import { OperationalHubNav } from '@/components/ui/admin-v2/OperationalHubNav'
import { loadAdminContext } from '@/lib/admin/auth/loadAdminContext'
import { getMessages } from '@/i18n/getMessages'
import { ROUTES } from '@/lib/navigation/routes'
import { dadosComplementaresDisponiveisAction, listarFuncionariosAction } from './actions'
import { FuncionariosListClient } from './FuncionariosListClient'

export default async function AdminFuncionariosPage() {
  const { session } = await loadAdminContext({
    pathname: ROUTES.admin.funcionarios,
    resource: `route:${ROUTES.admin.funcionarios}`,
  })
  const m = getMessages(session.idioma)
  const f = m.funcionarios

  const [list, dadosDisponiveis] = await Promise.all([
    listarFuncionariosAction(),
    dadosComplementaresDisponiveisAction(),
  ])
  const iniciais = list.ok ? list.data : []

  return (
    <div className="admin-v2-page">
      <PageHeader title={f.titulo} subtitle={f.subtitulo} />
      <OperationalHubNav hub="loja" />
      {!list.ok ? (
        <p className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {list.error}
        </p>
      ) : null}
      <FuncionariosListClient
        atorId={session.userId}
        atorPerfil={session.perfil}
        iniciais={iniciais}
        dadosDisponiveis={dadosDisponiveis}
        labels={{
          contagem: f.contagem,
          novo: f.novo,
          buscaPlaceholder: f.busca_placeholder,
          colNome: f.col_nome,
          colEmail: f.col_email,
          colPerfil: f.col_perfil,
          colStatus: f.col_status,
          colAcoes: f.col_acoes,
          colContato: f.col_contato,
          ativo: f.ativo,
          inativo: f.inativo,
          vazioTitulo: f.vazio_titulo,
          vazioSub: f.vazio_sub,
          vazioBuscaTitulo: f.vazio_busca_titulo,
          vazioBuscaSub: f.vazio_busca_sub,
          limparFiltros: f.limpar_filtros,
          ativar: f.ativar,
          desativar: f.desativar,
          editar: f.editar,
          verComissoes: f.ver_comissoes,
          perfilOperador: f.perfil_operador,
          perfilGerente: f.perfil_gerente,
          perfilDono: f.perfil_dono,
          filtroStatusLabel: f.filtro_status_label,
          filtroTodos: f.filtro_todos,
          filtroAtivos: f.filtro_ativos,
          filtroInativos: f.filtro_inativos,
          confirmarDesativar: f.confirmar_desativar,
          confirmarReativar: f.confirmar_reativar,
          confirmarTituloDesativar: f.confirmar_titulo_desativar,
          confirmarTituloReativar: f.confirmar_titulo_reativar,
          confirmarAcao: f.confirmar_acao,
          somenteLeitura: f.somente_leitura,
          bloqueioDonoAdmin: f.bloqueio_dono_admin,
          bloqueioSemPermissao: f.bloqueio_sem_permissao,
          bloqueioSiMesmo: f.bloqueio_si_mesmo,
          atalhoBusca: f.atalho_busca,
          atalhoNovo: f.atalho_novo,
          grupoEquipe: f.grupo_equipe,
          grupoEquipeSub: f.grupo_equipe_sub,
          grupoProtegido: f.grupo_protegido,
          grupoProtegidoSub: f.grupo_protegido_sub,
          modal: {
            novo: f.modal_novo,
            editar: f.modal_editar,
            nome: f.field_nome,
            email: f.field_email,
            emailHint: f.field_email_hint,
            emailHintNovo: f.field_email_hint_novo,
            perfil: f.field_perfil,
            idioma: f.field_idioma,
            senha: f.field_senha,
            senhaNovaOpcional: f.field_senha_nova,
            senhaHint: f.field_senha_hint,
            salvar: f.salvar,
            salvando: f.salvando,
            cancelar: f.cancelar,
            perfilOperador: f.perfil_operador,
            perfilGerente: f.perfil_gerente,
            idiomaPt: f.idioma_pt,
            idiomaZh: f.idioma_zh,
            secaoDados: f.secao_dados,
            secaoDadosSub: f.secao_dados_sub,
            telefone: f.field_telefone,
            telefonePlaceholder: f.field_telefone_ph,
            cpf: f.field_cpf,
            cpfHint: f.field_cpf_hint,
            cpfInvalido: f.cpf_invalido,
            cargo: f.field_cargo,
            cargoPlaceholder: f.field_cargo_ph,
            admissao: f.field_admissao,
            observacoes: f.field_observacoes,
          },
        }}
      />
    </div>
  )
}
