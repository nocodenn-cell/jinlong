'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Pencil, Trash2, ToggleLeft, ToggleRight, Plus, FolderOpen } from 'lucide-react'
import type { CampoFiltro } from '@/components/gerente/cadastro'
import {
  CadastroRapidoBlock,
  FiltroLateralCadastro,
  TabelaCadastroPadrao,
} from '@/components/gerente/cadastro'
import { GerenteFilterBar } from '@/components/gerente/GerenteFilterBar'
import { GerenteStickyToolbar } from '@/components/gerente/GerenteStickyToolbar'
import { GerenteStatusBadge } from '@/components/gerente/GerenteStatusBadge'
import { emitGerenteToast } from '@/lib/gerente/toast'
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

// ─── Tipos ───────────────────────────────────────────────────────────────────

type SituacaoFiltro = 'todos' | 'ativos' | 'inativos'

type FiltrosUi = {
  situacao: SituacaoFiltro
  busca: string
}

const FILTROS_INICIAL: FiltrosUi = { situacao: 'ativos', busca: '' }

// ─── Modal de criar/editar ────────────────────────────────────────────────────

type ModalState =
  | { tipo: 'fechado' }
  | { tipo: 'criar' }
  | { tipo: 'editar'; row: CategoriaProdutoRow }

function CategoriaModal({
  state,
  onClose,
  onSaved,
  idioma,
}: Readonly<{
  state: ModalState
  onClose: () => void
  onSaved: () => void
  idioma: Idioma
}>) {
  const m = getMessages(idioma).categorias_produtos
  const [nome, setNome] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (state.tipo === 'fechado') return
    setNome(state.tipo === 'editar' ? state.row.nome : '')
    setTimeout(() => inputRef.current?.focus(), 60)
  }, [state])

  const { mutate: salvar, loading } = useGerenteMutation(
    async () => {
      const nomeTrimmed = nome.trim()
      if (nomeTrimmed.length < 2) throw new Error(m.nome_minimo)

      if (state.tipo === 'criar') {
        const r = await criarCategoriaProduto({ nome: nomeTrimmed })
        if (!r.success) throw new Error(r.error)
      } else if (state.tipo === 'editar') {
        const r = await atualizarCategoriaProduto({ id: state.row.id, nome: nomeTrimmed })
        if (!r.success) throw new Error(r.error)
      }
      onSaved()
      onClose()
      return null
    },
    { successMessage: m.salvo_sucesso },
  )

  if (state.tipo === 'fechado') return null

  const titulo = state.tipo === 'criar' ? m.nova_categoria : m.editar_categoria

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="cat-modal-title"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />

      {/* Card */}
      <div className="dragon-glass-card relative z-10 w-full max-w-md rounded-2xl border p-6 shadow-2xl app-border">
        <h2
          id="cat-modal-title"
          className="mb-5 text-lg font-semibold app-accent-text"
        >
          {titulo}
        </h2>

        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1">
            <span className="gerente-fin-label text-[11px] font-medium app-muted">
              {m.nome_label}
            </span>
            <input
              ref={inputRef}
              type="text"
              value={nome}
              maxLength={120}
              onChange={(e) => setNome(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') salvar(undefined)
                if (e.key === 'Escape') onClose()
              }}
              placeholder={m.nome_placeholder}
              className="h-10 rounded-lg border px-3 text-sm app-input app-border focus:border-amber-500/80 focus:outline-none focus:ring-1 focus:ring-amber-500/40"
            />
          </label>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="rounded-lg px-4 py-2 text-sm font-medium app-muted transition hover:underline"
          >
            {m.cancelar}
          </button>
          <button
            type="button"
            onClick={() => salvar(undefined)}
            disabled={loading || nome.trim().length < 2}
            className="app-btn-accent inline-flex min-w-[120px] items-center justify-center rounded-lg px-5 py-2 text-sm font-semibold shadow-sm transition disabled:opacity-50"
          >
            {loading ? m.salvando : m.salvar}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Confirm de exclusão ──────────────────────────────────────────────────────

function ConfirmExcluirModal({
  row,
  onClose,
  onConfirmed,
  idioma,
}: Readonly<{
  row: CategoriaProdutoRow | null
  onClose: () => void
  onConfirmed: () => void
  idioma: Idioma
}>) {
  const m = getMessages(idioma).categorias_produtos

  const { mutate: excluir, loading } = useGerenteMutation(
    async () => {
      if (!row) return null
      const r = await excluirCategoriaProduto(row.id)
      if (!r.success) throw new Error(r.error)
      onConfirmed()
      onClose()
      return null
    },
    { successMessage: m.excluido_sucesso },
  )

  if (!row) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} aria-hidden />
      <div className="dragon-glass-card relative z-10 w-full max-w-sm rounded-2xl border p-6 shadow-2xl app-border">
        <h2 className="mb-2 text-base font-semibold app-surface-text">{m.confirmar_excluir_titulo}</h2>
        <p className="mb-6 text-sm app-muted">
          {m.confirmar_excluir_texto.replace('{{nome}}', row.nome)}
        </p>
        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="rounded-lg px-4 py-2 text-sm font-medium app-muted transition hover:underline"
          >
            {m.cancelar}
          </button>
          <button
            type="button"
            onClick={() => excluir(undefined)}
            disabled={loading}
            className="inline-flex min-w-[100px] items-center justify-center rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-red-700 disabled:opacity-50"
          >
            {loading ? m.excluindo : m.excluir}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Linha da tabela ──────────────────────────────────────────────────────────

function CategoriaRow({
  row,
  onEditar,
  onExcluir,
  onToggleAtivo,
  idioma,
}: Readonly<{
  row: CategoriaProdutoRow
  onEditar: (row: CategoriaProdutoRow) => void
  onExcluir: (row: CategoriaProdutoRow) => void
  onToggleAtivo: (row: CategoriaProdutoRow) => void
  idioma: Idioma
}>) {
  const m = getMessages(idioma).categorias_produtos

  return (
    <tr className="gerente-fin-row-hover border-b border-border/30 transition-colors last:border-0">
      <td className="gerente-fin-cell px-3 py-3 text-sm font-medium">{row.nome}</td>
      <td className="px-3 py-3">
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
            row.qtd_produtos > 0
              ? 'bg-blue-500/10 text-blue-400 ring-1 ring-blue-500/20'
              : 'app-muted'
          }`}
        >
          {row.qtd_produtos}
        </span>
      </td>
      <td className="px-3 py-3">
        <GerenteStatusBadge status={row.ativo ? 'ATIVO' : 'INATIVO'} />
      </td>
      <td className="px-3 py-3">
        <div className="flex items-center justify-end gap-1">
          {/* Toggle ativo */}
          <button
            type="button"
            title={row.ativo ? m.inativar : m.ativar}
            onClick={() => onToggleAtivo(row)}
            className="gerente-chip-action rounded-md border p-1.5 text-[11px] font-medium opacity-70 transition hover:opacity-100 app-border"
          >
            {row.ativo ? (
              <ToggleRight className="h-4 w-4 text-emerald-400" />
            ) : (
              <ToggleLeft className="h-4 w-4 app-muted" />
            )}
          </button>
          {/* Editar */}
          <button
            type="button"
            title={m.editar_categoria}
            onClick={() => onEditar(row)}
            className="gerente-chip-action rounded-md border p-1.5 opacity-70 transition hover:opacity-100 app-border"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          {/* Excluir */}
          <button
            type="button"
            title={m.excluir}
            onClick={() => onExcluir(row)}
            className="gerente-chip-action rounded-md border p-1.5 opacity-70 transition hover:opacity-100 app-border app-badge-danger"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </td>
    </tr>
  )
}

// ─── Componente principal ─────────────────────────────────────────────────────

type Props = Readonly<{
  idioma: Idioma
  inicial: { rows: CategoriaProdutoRow[]; total: number }
}>

export function CategoriasProdutosPageClient({ idioma, inicial }: Props) {
  const m = getMessages(idioma).categorias_produtos
  const router = useRouter()

  const [rows, setRows] = useState<CategoriaProdutoRow[]>(inicial.rows)
  const [total, setTotal] = useState(inicial.total)
  const [filtros, setFiltros] = useState<FiltrosUi>(FILTROS_INICIAL)
  const [filtrosAplicados, setFiltrosAplicados] = useState<FiltrosUi>(FILTROS_INICIAL)
  const [loadingList, setLoadingList] = useState(false)
  const [modal, setModal] = useState<ModalState>({ tipo: 'fechado' })
  const [rowParaExcluir, setRowParaExcluir] = useState<CategoriaProdutoRow | null>(null)
  const [nomeRapido, setNomeRapido] = useState('')

  const toInput = useCallback(
    (f: FiltrosUi): ListarCategoriasInput => ({
      situacao: f.situacao,
      busca: f.busca,
      page: 1,
      pageSize: 50,
    }),
    [],
  )

  const fetchList = useCallback(async (f: FiltrosUi) => {
    setLoadingList(true)
    try {
      const r = await listarCategoriasProdutos(toInput(f))
      if (!r.success) {
        emitGerenteToast({ kind: 'error', message: r.error })
        return
      }
      setRows(r.data.rows)
      setTotal(r.data.total)
    } finally {
      setLoadingList(false)
    }
  }, [toInput])

  const refetch = useCallback(() => {
    void fetchList(filtrosAplicados)
    router.refresh()
  }, [fetchList, filtrosAplicados, router])

  const handleFiltrar = useCallback(() => {
    setFiltrosAplicados(filtros)
    void fetchList(filtros)
  }, [filtros, fetchList])

  const handleLimpar = useCallback(() => {
    setFiltros(FILTROS_INICIAL)
    setFiltrosAplicados(FILTROS_INICIAL)
    void fetchList(FILTROS_INICIAL)
  }, [fetchList])

  const { mutate: toggleAtivo } = useGerenteMutation(
    async (row: CategoriaProdutoRow) => {
      const novoAtivo = !row.ativo
      const r = await alternarAtivoCategoriaProduto(row.id, novoAtivo)
      if (!r.success) throw new Error(r.error)
      refetch()
      return null
    },
    {
      successMessage: m.situacao_atualizada,
    },
  )

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

  // Campos do filtro lateral
  const camposFiltro: CampoFiltro[] = [
    {
      id: 'situacao',
      label: m.filtro_situacao,
      tipo: 'radio',
      valor: filtros.situacao,
      onChange: (v) => setFiltros((prev) => ({ ...prev, situacao: v as SituacaoFiltro })),
      opcoes: [
        { value: 'todos', label: m.filtro_todos },
        { value: 'ativos', label: m.filtro_ativos },
        { value: 'inativos', label: m.filtro_inativos },
      ],
    },
    {
      id: 'busca',
      label: m.filtro_busca,
      tipo: 'search',
      valor: filtros.busca,
      placeholder: m.filtro_busca_placeholder,
      onChange: (v) => setFiltros((prev) => ({ ...prev, busca: String(v) })),
    },
  ]

  const colunas = [
    { key: 'nome', header: m.col_nome, className: 'w-full' },
    { key: 'qtd_produtos', header: m.col_qtd_produtos, className: 'w-24 text-center' },
    { key: 'situacao', header: m.col_situacao, className: 'w-28' },
    { key: 'acoes', header: m.col_acoes, className: 'w-32 text-right' },
  ]

  return (
    <>
      {/* Modais */}
      <CategoriaModal
        state={modal}
        onClose={() => setModal({ tipo: 'fechado' })}
        onSaved={refetch}
        idioma={idioma}
      />
      <ConfirmExcluirModal
        row={rowParaExcluir}
        onClose={() => setRowParaExcluir(null)}
        onConfirmed={refetch}
        idioma={idioma}
      />

      {/* Toolbar sticky */}
      <GerenteStickyToolbar>
        <GerenteFilterBar
          title={m.titulo}
          rightSlot={
            <button
              type="button"
              onClick={() => setModal({ tipo: 'criar' })}
              className="app-btn-accent inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold shadow-sm transition"
            >
              <Plus className="h-4 w-4" />
              {m.nova_categoria}
            </button>
          }
        />
      </GerenteStickyToolbar>

      {/* Layout: sidebar + conteúdo */}
      <div className="grid gap-4 px-4 py-4 md:px-6 lg:grid-cols-[260px_1fr]">
        {/* Sidebar de filtros */}
        <div className="flex flex-col gap-4">
          <FiltroLateralCadastro
            title={m.filtros_titulo}
            campos={camposFiltro}
            onFiltrar={handleFiltrar}
            onLimpar={handleLimpar}
            labelFiltrar={m.filtrar}
            labelLimpar={m.limpar_filtros}
          />

          {/* Cadastro rápido */}
          <CadastroRapidoBlock title={m.cadastro_rapido} subtitle={m.cadastro_rapido_hint}>
            <div className="flex flex-col gap-2">
              <input
                type="text"
                value={nomeRapido}
                onChange={(e) => setNomeRapido(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') criarRapido(undefined)
                }}
                placeholder={m.nome_placeholder}
                maxLength={120}
                className="h-9 rounded-md border px-3 text-xs app-input app-border focus:border-amber-500/80 focus:outline-none focus:ring-1 focus:ring-amber-500/40"
              />
              <button
                type="button"
                onClick={() => criarRapido(undefined)}
                disabled={criarRapidoLoading || nomeRapido.trim().length < 2}
                className="app-btn-accent flex items-center justify-center gap-2 rounded-lg py-2 text-xs font-semibold shadow-sm transition disabled:opacity-50"
              >
                <Plus className="h-3.5 w-3.5" />
                {criarRapidoLoading ? m.salvando : m.criar}
              </button>
            </div>
          </CadastroRapidoBlock>
        </div>

        {/* Tabela */}
        <div className="flex flex-col gap-3">
          <TabelaCadastroPadrao
            sectionTitle={m.lista_titulo}
            sectionMeta={
              loadingList ? (
                <span className="gerente-fin-muted text-xs">{m.carregando}</span>
              ) : (
                <span className="gerente-fin-muted text-xs">
                  {total} {total === 1 ? m.categoria_singular : m.categorias_plural}
                </span>
              )
            }
            columns={colunas}
            tone="dragon"
          >
            {rows.length === 0 && !loadingList ? (
              <tr>
                <td colSpan={4} className="px-3 py-12 text-center">
                  <div className="flex flex-col items-center gap-3 app-muted">
                    <FolderOpen className="h-10 w-10 opacity-30" />
                    <span className="text-sm">{m.sem_categorias}</span>
                    <button
                      type="button"
                      onClick={() => setModal({ tipo: 'criar' })}
                      className="mt-1 rounded-lg border px-4 py-2 text-xs font-semibold transition hover:opacity-90 app-border app-accent-text"
                    >
                      {m.nova_categoria}
                    </button>
                  </div>
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <CategoriaRow
                  key={row.id}
                  row={row}
                  idioma={idioma}
                  onEditar={(r) => setModal({ tipo: 'editar', row: r })}
                  onExcluir={(r) => setRowParaExcluir(r)}
                  onToggleAtivo={(r) => toggleAtivo(r)}
                />
              ))
            )}
          </TabelaCadastroPadrao>
        </div>
      </div>
    </>
  )
}
