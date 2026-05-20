'use client'

import { useCallback, useState } from 'react'
import { Plus, FolderOpen } from 'lucide-react'
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
import type { CategoriaProdutoRow } from './categoriasProdutosTypes'
import {
  alternarAtivoCategoriaProduto,
  atualizarCategoriaProduto,
  criarCategoriaProduto,
  excluirCategoriaProduto,
  listarCategoriasProdutos,
} from './actions'
import type { ListarCategoriasInput } from './actions'

type SituacaoFiltro = 'todos' | 'ativos' | 'inativos'
type FiltrosUi = { situacao: SituacaoFiltro; busca: string }
const FILTROS_INICIAL: FiltrosUi = { situacao: 'ativos', busca: '' }

// ─── Componente principal ─────────────────────────────────────────────────────

type Props = Readonly<{ idioma: Idioma; inicial: { rows: CategoriaProdutoRow[]; total: number } }>

export function CategoriasProdutosPageClient({ idioma, inicial }: Props) {
  const m = getMessages(idioma).categorias_produtos

  const toInput = useCallback(
    (f: FiltrosUi): ListarCategoriasInput => ({ situacao: f.situacao, busca: f.busca, page: 1, pageSize: 50 }),
    [],
  )

  const {
    rows, total, filtros, setFiltros, loadingList,
    modal, setModal, rowParaExcluir, setRowParaExcluir,
    refetch, handleFiltrar, handleLimpar, toggleAtivo,
  } = useCadastroListState<CategoriaProdutoRow, FiltrosUi, ListarCategoriasInput>({
    inicial, filtrosInicial: FILTROS_INICIAL, toInput,
    listarAction: listarCategoriasProdutos,
    toggleAtivoAction: alternarAtivoCategoriaProduto,
    labels: { situacao_atualizada: m.situacao_atualizada },
  })

  const [nomeRapido, setNomeRapido] = useState('')
  const { mutate: criarRapido, loading: criarRapidoLoading } = useGerenteMutation(
    async () => {
      const nome = nomeRapido.trim()
      if (nome.length < 2) throw new Error(m.nome_minimo)
      const r = await criarCategoriaProduto({ nome })
      if (!r.success) throw new Error(r.error)
      setNomeRapido('')
      refetch()
      return null
    },
    { successMessage: m.salvo_sucesso },
  )

  const camposFiltro: CampoFiltro[] = [
    {
      id: 'situacao', label: m.filtro_situacao, tipo: 'radio', valor: filtros.situacao,
      onChange: (v) => setFiltros((prev) => ({ ...prev, situacao: v as SituacaoFiltro })),
      opcoes: [
        { value: 'todos', label: m.filtro_todos },
        { value: 'ativos', label: m.filtro_ativos },
        { value: 'inativos', label: m.filtro_inativos },
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
          <input
            type="text" value={nomeRapido} onChange={(e) => setNomeRapido(e.target.value)}
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
        { key: 'qtd_produtos', header: m.col_qtd_produtos, width: '6rem' },
        { key: 'situacao', header: m.col_situacao, width: '7rem' },
        { key: 'acoes', header: m.col_acoes, width: '8rem' },
      ]}
      modals={
        <>
          <CadastroFormModal<CategoriaProdutoRow>
            state={modal} onClose={() => setModal({ tipo: 'fechado' })} onSaved={refetch}
            modalId="cat-modal-title"
            labels={{ nova: m.nova_categoria, editar: m.editar_categoria, cancelar: m.cancelar, salvando: m.salvando, salvar: m.salvar, salvo_sucesso: m.salvo_sucesso }}
            onSubmit={async (nome, st) => {
              if (st.tipo === 'criar') {
                const r = await criarCategoriaProduto({ nome }); if (!r.success) throw new Error(r.error)
              } else if (st.tipo === 'editar') {
                const r = await atualizarCategoriaProduto({ id: st.row.id, nome }); if (!r.success) throw new Error(r.error)
              }
            }}
            getInitialNome={(st) => st.tipo === 'editar' ? st.row.nome : ''}
            nomeLabel={m.nome_label} nomePlaceholder={m.nome_placeholder}
          />
          <ConfirmExcluirCadastroModal
            row={rowParaExcluir} onClose={() => setRowParaExcluir(null)} onConfirmed={refetch}
            excluirAction={excluirCategoriaProduto}
            labels={{ confirmar_excluir_titulo: m.confirmar_excluir_titulo, confirmar_excluir_texto: m.confirmar_excluir_texto, cancelar: m.cancelar, excluindo: m.excluindo, excluir: m.excluir, excluido_sucesso: m.excluido_sucesso }}
          />
        </>
      }
      tableChildren={
        rows.length === 0 && !loadingList ? (
          <tr>
            <td colSpan={4} className="px-3 py-12 text-center">
              <div className="flex flex-col items-center gap-3 app-muted">
                <FolderOpen className="h-10 w-10 opacity-30" />
                <span className="text-sm">{m.sem_categorias}</span>
                <button type="button" onClick={() => setModal({ tipo: 'criar' })} className="mt-1 rounded-lg border px-4 py-2 text-xs font-semibold transition hover:opacity-90 app-border app-accent-text">
                  {m.nova_categoria}
                </button>
              </div>
            </td>
          </tr>
        ) : (
          rows.map((row) => (
            <tr key={row.id} className="gerente-fin-row-hover border-b border-border/30 transition-colors last:border-0">
              <td className="gerente-fin-cell px-3 py-3 text-sm font-medium">{row.nome}</td>
              <td className="px-3 py-3">
                <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${row.qtd_produtos > 0 ? 'bg-blue-500/10 text-blue-400 ring-1 ring-blue-500/20' : 'app-muted'}`}>
                  {row.qtd_produtos}
                </span>
              </td>
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
