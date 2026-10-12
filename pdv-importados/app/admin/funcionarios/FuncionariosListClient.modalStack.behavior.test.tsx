/** @vitest-environment jsdom */
import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getMessages } from '@/i18n/getMessages'
import type { FuncionariosListLabels } from './FuncionariosListClient'

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) =>
    React.createElement('a', { href, ...rest }, children),
}))

vi.mock('./actions', () => ({
  definirAtivoFuncionarioAction: vi.fn(),
  criarFuncionarioAction: vi.fn(),
  atualizarFuncionarioAction: vi.fn(),
  verificarEmailDisponiveAction: vi.fn(async () => ({ ok: true, data: true })),
}))

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const { FuncionariosListClient } = await import('./FuncionariosListClient')

const f = getMessages('pt').funcionarios

function labels(): FuncionariosListLabels {
  return {
    contagem: f.contagem,
    novo: f.novo,
    buscaPlaceholder: f.busca_placeholder,
    colNome: f.col_nome,
    colEmail: f.col_email,
    colPerfil: f.col_perfil,
    colStatus: f.col_status,
    colAcoes: f.col_acoes,
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
    perfilAdmin: f.perfil_admin,
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
    grupoAdminOnde: f.grupo_admin_onde,
    grupoAdminLink: f.grupo_admin_link,
    menuMais: f.menu_mais,
    filtroPerfilLabel: f.filtro_perfil_label,
    filtroPerfilTodos: f.filtro_perfil_todos,
    filtroPerfilOperador: f.filtro_perfil_operador,
    filtroPerfilGerente: f.filtro_perfil_gerente,
    colFuncionario: f.col_funcionario,
    modal: {
      novo: f.modal_novo,
      editar: f.modal_editar,
      nome: f.field_nome,
      email: f.field_email,
      emailHint: f.field_email_hint,
      emailAvisoCriar: f.email_aviso_criar,
      emailEmUso: f.email_em_uso,
      perfil: f.field_perfil,
      idioma: f.field_idioma,
      idiomaHintCriar: f.idioma_hint_criar,
      idiomaHintEditar: f.idioma_hint_editar,
      senha: f.field_senha,
      senhaNovaOpcional: f.field_senha_nova,
      senhaHint: f.field_senha_hint,
      senhaAceita: f.senha_aceita,
      salvar: f.salvar,
      salvarAlteracoes: f.salvar_alteracoes,
      cadastrar: f.modal_cadastrar,
      salvando: f.salvando,
      cancelar: f.cancelar,
      perfilOperador: f.perfil_operador,
      perfilGerente: f.perfil_gerente,
      perfilDono: f.perfil_dono,
      perfilAdmin: f.perfil_admin,
      idiomaPt: f.idioma_pt,
      idiomaZh: f.idioma_zh,
      grupoDados: f.grupo_dados,
      grupoAcesso: f.grupo_acesso,
      redefinirSenha: f.redefinir_senha,
      redefinirSenhaSalvar: f.redefinir_senha_salvar,
      verPermissoes: f.ver_permissoes,
      ocultarPermissoes: f.ocultar_permissoes,
      introOperador: f.intro_operador,
      introGerente: f.intro_gerente,
      destinoLabel: f.destino_label,
      semPainel: f.sem_painel,
      rotasLabel: f.rotas_label,
      tambemPdv: f.tambem_pdv,
      gerenteNaoEditaGerente: f.gerente_nao_edita_gerente,
      atribuidoPor: f.atribuido_por,
    },
  }
}

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  sessionStorage.clear()
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

describe('Funcionários — modal acima do cabeçalho', () => {
  it('o diálogo de novo funcionário usa z-modal e não fica dentro do thead sticky', () => {
    act(() => {
      root.render(
        <FuncionariosListClient
          atorId="dono-1"
          atorPerfil="DONO"
          iniciais={[{
            id: 'op-1',
            nome: 'Lia',
            email: 'lia@loja.test',
            perfil: 'OPERADOR',
            idioma_preferido: 'pt',
            ativo: true,
            created_at: '2026-01-01',
          }]}
          labels={labels()}
        />,
      )
    })
    const novo = Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.includes(f.novo))
    act(() => novo?.click())
    const dialog = document.querySelector('[role="dialog"]')
    const thead = container.querySelector('thead')
    expect(dialog?.className).toContain('z-[var(--z-modal)]')
    expect(thead?.contains(dialog ?? null)).toBe(false)
    expect(thead?.className).toContain('z-[var(--z-sticky)]')
  })
})
