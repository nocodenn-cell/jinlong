'use client'

import { useCallback, useRef, useState } from 'react'
import { Plus, Landmark } from 'lucide-react'
import type { CampoFiltro } from '@/components/gerente/cadastro'
import {
  CadastroFormModal,
  CadastroPageShell,
  CadastroRowActions,
  ConfirmExcluirCadastroModal,
  useCadastroListState,
} from '@/components/gerente/cadastro'
import { GerenteStatusBadge } from '@/components/gerente/GerenteStatusBadge'
import { useGerenteMutation } from '@/lib/hooks/useGerenteMutation'
import type { Idioma } from '@/idioma/normalizeIdioma'
import { getMessages } from '@/i18n/getMessages'
import type { CategoriaFinanceiraRow, CategoriaFinanceiraTipo } from './categoriasFinanceirasTypes'
import {
  alternarAtivoCategoriaFinanceira,
  atualizarCategoriaFinanceira,
  criarCategoriaFinanceira,
  excluirCategoriaFinanceira,
  listarCategoriasFinanceiras,
} from './actions'
import type { ListarCategoriasFinInput } from './actions'

type TipoFiltro = 'todos' | CategoriaFinanceiraTipo
type SituacaoFiltro = 'todos' | 'ativos' | 'inativos'
type FiltrosUi = { tipo: TipoFiltro; situacao: SituacaoFiltro; busca: string }
const FILTROS_INICIAL: FiltrosUi = { tipo: 'todos', situacao: 'ativos', busca: '' }

function TipoBadge({ tipo }: { tipo: CategoriaFinanceiraTipo }) {
  const classes: Record<CategoriaFinanceiraTipo, string> = { RECEITA: 'app-badge-positive', DESPESA: 'app-badge-danger', AMBOS: 'app-badge-warn' }
  const labels: Record<CategoriaFinanceiraTipo, string> = { RECEITA: 'Receita', DESPESA: 'Despesa', AMBOS: 'Ambos' }
  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${classes[tipo]}`}>{labels[tipo]}</span>
}

function TipoSelectorField({ tipoRef, opcoes, label }: {
  tipoRef: React.MutableRefObject<CategoriaFinanceiraTipo>
  opcoes: { value: CategoriaFinanceiraTipo; label: string }[]
  label: string
}) {
  const [selected, setSelected] = useState<CategoriaFinanceiraTipo>(tipoRef.current)
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[11px] font-medium app-muted">{label}</span>
      <div className="flex gap-2">
        {opcoes.map((op) => (
          <button key={op.value} type="button" onClick={() => { setSelected(op.value); tipoRef.current = op.value }}
            className={`flex-1 rounded-lg border py-2 text-xs font-semibold transition ${
              selected === op.value
                ? op.value === 'RECEITA' ? 'app-badge-positive border-emerald-500/40'
                  : op.value === 'DESPESA' ? 'app-badge-danger border-red-500/40' : 'app-badge-warn border-amber-500/40'
                : 'app-border opacity-50 hover:opacity-80'
            }`}>
            {op.label}
          </button>
        ))}
      </div>
    </div>
  )
}

// ─── Componente principal ─────────────────────────────────────────────────────

type Props = Readonly<{ idioma: Idioma; inicial: { rows: CategoriaFinanceiraRow[]; total: number } }>

export function CategoriasFinanceirasPageClient({ idioma, inicial }: Props) {
  const m = getMessages(idioma).categorias_financeiras

  const toInput = useCallback(
    (f: FiltrosUi): ListarCategoriasFinInput => ({ tipo: f.tipo, situacao: f.situacao, busca: f.busca, page: 1, pageSize: 50 }),
    [],
  )

  const {
    rows, total, filtros, setFiltros, loadingList,
    modal, setModal, rowParaExcluir, setRowParaExcluir,
    refetch, handleFiltrar, handleLimpar, toggleAtivo,
  } = useCadastroListState<CategoriaFinanceiraRow, FiltrosUi, ListarCategoriasFinInput>({
    inicial, filtrosInicial: FILTROS_INICIAL, toInput,
    listarAction: listarCategoriasFinanceiras,
    toggleAtivoAction: alternarAtivoCategoriaFinanceira,
    labels: { situacao_atualizada: m.situacao_atualizada },
  })

  const tipoModalRef = useRef<CategoriaFinanceiraTipo>('AMBOS')

  const tipoOpcoes: { value: CategoriaFinanceiraTipo; label: string }[] = [
    { value: 'RECEITA', label: m.tipo_receita }, { value: 'DESPESA', label: m.tipo_despesa }, { value: 'AMBOS', label: m.tipo_ambos },
  ]

  const [nomeRapido, setNomeRapido] = useState('')
  const [tipoRapido, setTipoRapido] = useState<CategoriaFinanceiraTipo>('RECEITA')
  const { mutate: criarRapido, loading: criarRapidoLoading } = useGerenteMutation(
    async () => {
      const nome = nomeRapido.trim()
      if (nome.length < 2) throw new Error(m.nome_minimo)
      const r = await criarCategoriaFinanceira({ nome, tipo: tipoRapido })
      if (!r.success) throw new Error(r.error)
      setNomeRapido('')
      refetch()
      return null
    },
    { successMessage: m.salvo_sucesso },
  )

  const camposFiltro: CampoFiltro[] = [
    {
      id: 'tipo', label: m.filtro_tipo, tipo: 'radio', valor: filtros.tipo,
      onChange: (v) => setFiltros((prev) => ({ ...prev, tipo: v as TipoFiltro })),
      opcoes: [
        { value: 'todos', label: m.filtro_todos }, { value: 'RECEITA', label: m.tipo_receita },
        { value: 'DESPESA', label: m.tipo_despesa }, { value: 'AMBOS', label: m.tipo_ambos },
      ],
    },
    {
      id: 'situacao', label: m.filtro_situacao, tipo: 'radio', valor: filtros.situacao,
      onChange: (v) => setFiltros((prev) => ({ ...prev, situacao: v as SituacaoFiltro })),
      opcoes: [
        { value: 'todos', label: m.filtro_situacao_todos },
        { value: 'ativos', label: m.filtro_ativos }, { value: 'inativos', label: m.filtro_inativos },
      ],
    },
    {
      id: 'busca', label: m.filtro_busca, tipo: 'search', valor: filtros.busca,
      placeholder: m.filtro_busca_placeholder,
      onChange: (v) => setFiltros((prev) => ({ ...prev, busca: String(v) })),
    },
  ]

  return (
    <CadastroPageShell
      titulo={m.titulo}
      novoLabel={m.nova_categoria}
      onNovo={() => setModal({ tipo: 'criar' })}
      filtrosTitulo={m.filtros_titulo}
      camposFiltro={camposFiltro}
      onFiltrar={handleFiltrar}
      onLimpar={handleLimpar}
      labelFiltrar={m.filtrar}
      labelLimpar={m.limpar_filtros}
      cadastroRapidoTitle={m.cadastro_rapido}
      cadastroRapidoSubtitle={m.cadastro_rapido_hint}
      cadastroRapidoContent={
        <div className="flex flex-col gap-2">
          <div className="flex gap-1">
            {tipoOpcoes.map((op) => (
              <button key={op.value} type="button" onClick={() => setTipoRapido(op.value)}
                className={`flex-1 rounded-md border py-1 text-[10px] font-semibold transition ${
                  tipoRapido === op.value
                    ? op.value === 'RECEITA' ? 'app-badge-positive border-emerald-500/40'
                      : op.value === 'DESPESA' ? 'app-badge-danger border-red-500/40' : 'app-badge-warn border-amber-500/40'
                    : 'app-border opacity-40 hover:opacity-70'
                }`}>
                {op.label}
              </button>
            ))}
          </div>
          <input type="text" value={nomeRapido} onChange={(e) => setNomeRapido(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') criarRapido(undefined) }}
            placeholder={m.nome_placeholder} maxLength={120}
            className="h-9 rounded-md border px-3 text-xs app-input app-border focus:border-amber-500/80 focus:outline-none focus:ring-1 focus:ring-amber-500/40"
          />
          <button type="button" onClick={() => criarRapido(undefined)} disabled={criarRapidoLoading || nomeRapido.trim().length < 2}
            className="app-btn-accent flex items-center justify-center gap-2 rounded-lg py-2 text-xs font-semibold shadow-sm transition disabled:opacity-50">
            <Plus className="h-3.5 w-3.5" />
            {criarRapidoLoading ? m.salvando : m.criar}
          </button>
        </div>
      }
      listaTitulo={m.lista_titulo}
      listaMeta={
        loadingList
          ? <span className="gerente-fin-muted text-xs">{m.carregando}</span>
          : <span className="gerente-fin-muted text-xs">{total} {total === 1 ? m.categoria_singular : m.categorias_plural}</span>
      }
      colunas={[
        { key: 'nome', header: m.col_nome },
        { key: 'tipo', header: m.col_tipo, width: '7rem' },
        { key: 'situacao', header: m.col_situacao, width: '7rem' },
        { key: 'acoes', header: m.col_acoes, width: '8rem' },
      ]}
      modals={
        <>
          <CadastroFormModal<CategoriaFinanceiraRow>
            state={modal} onClose={() => setModal({ tipo: 'fechado' })} onSaved={refetch}
            modalId="catfin-modal-title"
            labels={{ nova: m.nova_categoria, editar: m.editar_categoria, cancelar: m.cancelar, salvando: m.salvando, salvar: m.salvar, salvo_sucesso: m.salvo_sucesso }}
            onSubmit={async (nome, st) => {
              const tipo = tipoModalRef.current
              if (st.tipo === 'criar') {
                const r = await criarCategoriaFinanceira({ nome, tipo }); if (!r.success) throw new Error(r.error)
              } else if (st.tipo === 'editar') {
                const r = await atualizarCategoriaFinanceira({ id: st.row.id, nome, tipo }); if (!r.success) throw new Error(r.error)
              }
            }}
            getInitialNome={(st) => st.tipo === 'editar' ? st.row.nome : ''}
            nomeLabel={m.nome_label} nomePlaceholder={m.nome_placeholder}
            extraFields={(st) => {
              const tipo = st.tipo === 'editar' ? st.row.tipo : 'AMBOS'
              tipoModalRef.current = tipo
              return <TipoSelectorField key={st.tipo === 'editar' ? st.row.id : 'new'} tipoRef={tipoModalRef} opcoes={tipoOpcoes} label={m.tipo_label} />
            }}
          />
          <ConfirmExcluirCadastroModal
            row={rowParaExcluir} onClose={() => setRowParaExcluir(null)} onConfirmed={refetch}
            excluirAction={excluirCategoriaFinanceira}
            labels={{ confirmar_excluir_titulo: m.confirmar_excluir_titulo, confirmar_excluir_texto: m.confirmar_excluir_texto, cancelar: m.cancelar, excluindo: m.excluindo, excluir: m.excluir, excluido_sucesso: m.excluido_sucesso }}
          />
        </>
      }
      tableChildren={
        rows.length === 0 && !loadingList ? (
          <tr>
            <td colSpan={4} className="px-3 py-12 text-center">
              <div className="flex flex-col items-center gap-3 app-muted">
                <Landmark className="h-10 w-10 opacity-30" />
                <span className="text-sm">{m.sem_categorias}</span>
                <button type="button" onClick={() => setModal({ tipo: 'criar' })} className="mt-1 rounded-lg border px-4 py-2 text-xs font-semibold transition hover:opacity-90 app-border app-accent-text">
                  {m.nova_categoria}
                </button>
              </div>
            </td>
          </tr>
        ) : (
          rows.map((row) => (
            <tr key={row.id} className="gerente-fin-row-hover border-b border-white/10 transition-colors last:border-0">
              <td className="gerente-fin-cell px-3 py-3 text-sm font-medium">{row.nome}</td>
              <td className="px-3 py-3"><TipoBadge tipo={row.tipo} /></td>
              <td className="px-3 py-3"><GerenteStatusBadge status={row.ativo ? 'ATIVO' : 'INATIVO'} /></td>
              <td className="px-3 py-3">
                <CadastroRowActions row={row}
                  onEditar={(r) => setModal({ tipo: 'editar', row: r })}
                  onExcluir={(r) => setRowParaExcluir(r)}
                  onToggleAtivo={(r) => toggleAtivo(r)}
                  labels={{ inativar: m.inativar, ativar: m.ativar, editar: m.editar_categoria, excluir: m.excluir }}
                />
              </td>
            </tr>
          ))
        )
      }
    />
  )
}
