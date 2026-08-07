import { Suspense } from 'react'
import { FilterBar, type FilterDef } from '@/components/ui/FilterBar'
import { PageShell } from '@/components/ui/admin-v2'
import { ErrorState } from '@/components/ui/feedback'
import { loadAdminContext } from '@/lib/admin/auth/loadAdminContext'
import { getMessages } from '@/i18n/getMessages'
import { ROUTES } from '@shared-core/navigation/routes'
import { listarFuncionariosAction } from './actions'
import { FuncionariosListClient } from './FuncionariosListClient'

type SearchParams = {
  q?: string
  situacao?: string
}

type PageProps = { searchParams?: Promise<SearchParams> }

function parseSituacao(raw: string | undefined): 'todos' | 'ativos' | 'inativos' {
  if (raw === 'ativos' || raw === 'inativos') return raw
  return 'todos'
}

export default async function AdminFuncionariosPage({ searchParams }: PageProps) {
  const { session } = await loadAdminContext({
    pathname: ROUTES.admin.funcionarios,
    resource: `route:${ROUTES.admin.funcionarios}`,
  })
  const m = getMessages(session.idioma)
  const f = m.funcionarios
  const sp = (await searchParams) ?? {}
  const busca = sp.q ?? ''
  const situacao = parseSituacao(sp.situacao)

  const list = await listarFuncionariosAction()
  const iniciais = list.ok ? list.data : []

  const filters: FilterDef[] = [
    {
      type: 'search',
      key: 'q',
      placeholder: f.busca_placeholder,
      label: f.busca_placeholder,
    },
    {
      type: 'pills',
      key: 'situacao',
      defaultValue: 'todos',
      options: [
        { value: 'todos', label: f.filtro_todos },
        { value: 'ativos', label: f.filtro_ativos },
        { value: 'inativos', label: f.filtro_inativos },
      ],
    },
  ]

  return (
    <PageShell
      title={f.titulo}
      subtitle={f.subtitulo}
      filters={
        <Suspense fallback={<div className="h-9" />}>
          <FilterBar filters={filters} clearLabel={m.comum.limpar_filtros} />
        </Suspense>
      }
    >
      {!list.ok ? (
        <ErrorState dense description={list.error} className="mb-4 items-start text-left" />
      ) : null}
      <FuncionariosListClient
        atorId={session.userId}
        atorPerfil={session.perfil}
        iniciais={iniciais}
        busca={busca}
        situacao={situacao}
        labels={{
          listaTitulo: f.lista_titulo,
          contagem: f.contagem,
          novo: f.novo,
          buscaPlaceholder: f.busca_placeholder,
          colNome: f.col_nome,
          colEmail: f.col_email,
          colPerfil: f.col_perfil,
          colIdioma: f.col_idioma,
          colStatus: f.col_status,
          colAcoes: f.col_acoes,
          ativo: f.ativo,
          inativo: f.inativo,
          vazio: f.vazio,
          ativar: f.ativar,
          desativar: f.desativar,
          editar: f.editar,
          perfilOperador: f.perfil_operador,
          perfilGerente: f.perfil_gerente,
          perfilDono: f.perfil_dono,
          perfilAdmin: f.perfil_admin,
          filtroTodos: f.filtro_todos,
          filtroAtivos: f.filtro_ativos,
          filtroInativos: f.filtro_inativos,
          confirmDesativarTitulo: f.confirm_desativar_titulo,
          confirmDesativarDesc: f.confirm_desativar_desc,
          confirmAtivarTitulo: f.confirm_ativar_titulo,
          confirmAtivarDesc: f.confirm_ativar_desc,
          confirmOk: f.confirm_ok,
          confirmCancel: f.confirm_cancel,
          toastDesativado: f.toast_desativado,
          toastAtivado: f.toast_ativado,
          modal: {
            novo: f.modal_novo,
            editar: f.modal_editar,
            nome: f.field_nome,
            email: f.field_email,
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
          },
        }}
      />
    </PageShell>
  )
}
