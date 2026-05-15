'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Pencil, Trash2, ToggleLeft, ToggleRight, Plus, Landmark } from 'lucide-react'
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
import type { CategoriaFinanceiraRow, CategoriaFinanceiraTipo } from './categoriasFinanceirasTypes'
import {
  alternarAtivoCategoriaFinanceira,
  atualizarCategoriaFinanceira,
  criarCategoriaFinanceira,
  excluirCategoriaFinanceira,
  listarCategoriasFinanceiras,
} from './actions'
import type { ListarCategoriasFinInput } from './actions'

// ─── Tipos ───────────────────────────────────────────────────────────────────

type TipoFiltro = 'todos' | CategoriaFinanceiraTipo
type SituacaoFiltro = 'todos' | 'ativos' | 'inativos'

type FiltrosUi = {
  tipo: TipoFiltro
  situacao: SituacaoFiltro
  busca: string
}

const FILTROS_INICIAL: FiltrosUi = { tipo: 'todos', situacao: 'ativos', busca: '' }

// ─── Badge de tipo ────────────────────────────────────────────────────────────

function TipoBadge({ tipo }: { tipo: CategoriaFinanceiraTipo }) {
  const classes: Record<CategoriaFinanceiraTipo, string> = {
    RECEITA: 'app-badge-positive',
    DESPESA: 'app-badge-danger',
    AMBOS: 'app-badge-warn',
  }
  const labels: Record<CategoriaFinanceiraTipo, string> = {
    RECEITA: 'Receita',
    DESPESA: 'Despesa',
    AMBOS: 'Ambos',
  }
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${classes[tipo]}`}
    >
      {labels[tipo]}
    </span>
  )
}

// ─── Modal de criar/editar ────────────────────────────────────────────────────

type ModalState =
  | { tipo: 'fechado' }
  | { tipo: 'criar' }
  | { tipo: 'editar'; row: CategoriaFinanceiraRow }

function CategoriaFinModal({
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
  const m = getMessages(idioma).categorias_financeiras
  const [nome, setNome] = useState('')
  const [tipo, setTipo] = useState<CategoriaFinanceiraTipo>('AMBOS')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (state.tipo === 'fechado') return
    if (state.tipo === 'editar') {
      setNome(state.row.nome)
      setTipo(state.row.tipo)
    } else {
      setNome('')
      setTipo('AMBOS')
    }
    setTimeout(() => inputRef.current?.focus(), 60)
  }, [state])

  const { mutate: salvar, loading } = useGerenteMutation(
    async () => {
      const nomeTrimmed = nome.trim()
      if (nomeTrimmed.length < 2) throw new Error(m.nome_minimo)

      if (state.tipo === 'criar') {
        const r = await criarCategoriaFinanceira({ nome: nomeTrimmed, tipo })
        if (!r.success) throw new Error(r.error)
      } else if (state.tipo === 'editar') {
        const r = await atualizarCategoriaFinanceira({ id: state.row.id, nome: nomeTrimmed, tipo })
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

  const tipoOpcoes: { value: CategoriaFinanceiraTipo; label: string }[] = [
    { value: 'RECEITA', label: m.tipo_receita },
    { value: 'DESPESA', label: m.tipo_despesa },
    { value: 'AMBOS',   label: m.tipo_ambos },
  ]

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="catfin-modal-title"
    >
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />
      <div className="dragon-glass-card relative z-10 w-full max-w-md rounded-2xl border p-6 shadow-2xl app-border">
        <h2 id="catfin-modal-title" className="mb-5 text-lg font-semibold app-accent-text">
          {titulo}
        </h2>

        <div className="flex flex-col gap-4">
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-medium app-muted">{m.nome_label}</span>
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

          <div className="flex flex-col gap-1">
            <span className="text-[11px] font-medium app-muted">{m.tipo_label}</span>
            <div className="flex gap-2">
              {tipoOpcoes.map((op) => (
                <button
                  key={op.value}
                  type="button"
                  onClick={() => setTipo(op.value)}
                  className={`flex-1 rounded-lg border py-2 text-xs font-semibold transition ${
                    tipo === op.value
                      ? op.value === 'RECEITA'
                        ? 'app-badge-positive border-emerald-500/40'
                        : op.value === 'DESPESA'
                        ? 'app-badge-danger border-red-500/40'
                        : 'app-badge-warn border-amber-500/40'
                      : 'app-border opacity-50 hover:opacity-80'
                  }`}
                >
                  {op.label}
                </button>
              ))}
            </div>
          </div>
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

// ─── Confirm exclusão ─────────────────────────────────────────────────────────

function ConfirmExcluirModal({
  row,
  onClose,
  onConfirmed,
  idioma,
}: Readonly<{
  row: CategoriaFinanceiraRow | null
  onClose: () => void
  onConfirmed: () => void
  idioma: Idioma
}>) {
  const m = getMessages(idioma).categorias_financeiras

  const { mutate: excluir, loading } = useGerenteMutation(
    async () => {
      if (!row) return null
      const r = await excluirCategoriaFinanceira(row.id)
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

function CategoriaFinRow({
  row,
  onEditar,
  onExcluir,
  onToggleAtivo,
  idioma,
}: Readonly<{
  row: CategoriaFinanceiraRow
  onEditar: (row: CategoriaFinanceiraRow) => void
  onExcluir: (row: CategoriaFinanceiraRow) => void
  onToggleAtivo: (row: CategoriaFinanceiraRow) => void
  idioma: Idioma
}>) {
  const m = getMessages(idioma).categorias_financeiras

  return (
    <tr className="gerente-fin-row-hover border-b border-border/30 transition-colors last:border-0">
      <td className="gerente-fin-cell px-3 py-3 text-sm font-medium">{row.nome}</td>
      <td className="px-3 py-3">
        <TipoBadge tipo={row.tipo} />
      </td>
      <td className="px-3 py-3">
        <GerenteStatusBadge status={row.ativo ? 'ATIVO' : 'INATIVO'} />
      </td>
      <td className="px-3 py-3">
        <div className="flex items-center justify-end gap-1">
          <button
            type="button"
            title={row.ativo ? m.inativar : m.ativar}
            onClick={() => onToggleAtivo(row)}
            className="gerente-chip-action rounded-md border p-1.5 opacity-70 transition hover:opacity-100 app-border"
          >
            {row.ativo ? (
              <ToggleRight className="h-4 w-4 text-emerald-400" />
            ) : (
              <ToggleLeft className="h-4 w-4 app-muted" />
            )}
          </button>
          <button
            type="button"
            title={m.editar_categoria}
            onClick={() => onEditar(row)}
            className="gerente-chip-action rounded-md border p-1.5 opacity-70 transition hover:opacity-100 app-border"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
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
  inicial: { rows: CategoriaFinanceiraRow[]; total: number }
}>

export function CategoriasFinanceirasPageClient({ idioma, inicial }: Props) {
  const m = getMessages(idioma).categorias_financeiras
  const router = useRouter()

  const [rows, setRows] = useState<CategoriaFinanceiraRow[]>(inicial.rows)
  const [total, setTotal] = useState(inicial.total)
  const [filtros, setFiltros] = useState<FiltrosUi>(FILTROS_INICIAL)
  const [filtrosAplicados, setFiltrosAplicados] = useState<FiltrosUi>(FILTROS_INICIAL)
  const [loadingList, setLoadingList] = useState(false)
  const [modal, setModal] = useState<ModalState>({ tipo: 'fechado' })
  const [rowParaExcluir, setRowParaExcluir] = useState<CategoriaFinanceiraRow | null>(null)
  const [nomeRapido, setNomeRapido] = useState('')
  const [tipoRapido, setTipoRapido] = useState<CategoriaFinanceiraTipo>('RECEITA')

  const toInput = useCallback(
    (f: FiltrosUi): ListarCategoriasFinInput => ({
      tipo: f.tipo,
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
      const r = await listarCategoriasFinanceiras(toInput(f))
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
    async (row: CategoriaFinanceiraRow) => {
      const r = await alternarAtivoCategoriaFinanceira(row.id, !row.ativo)
      if (!r.success) throw new Error(r.error)
      refetch()
      return null
    },
    { successMessage: m.situacao_atualizada },
  )

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

  // Campos do filtro lateral
  const camposFiltro: CampoFiltro[] = [
    {
      id: 'tipo',
      label: m.filtro_tipo,
      tipo: 'radio',
      valor: filtros.tipo,
      onChange: (v) => setFiltros((prev) => ({ ...prev, tipo: v as TipoFiltro })),
      opcoes: [
        { value: 'todos',   label: m.filtro_todos },
        { value: 'RECEITA', label: m.tipo_receita },
        { value: 'DESPESA', label: m.tipo_despesa },
        { value: 'AMBOS',   label: m.tipo_ambos },
      ],
    },
    {
      id: 'situacao',
      label: m.filtro_situacao,
      tipo: 'radio',
      valor: filtros.situacao,
      onChange: (v) => setFiltros((prev) => ({ ...prev, situacao: v as SituacaoFiltro })),
      opcoes: [
        { value: 'todos',    label: m.filtro_situacao_todos },
        { value: 'ativos',   label: m.filtro_ativos },
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
    { key: 'nome',     header: m.col_nome,     className: 'w-full' },
    { key: 'tipo',     header: m.col_tipo,     className: 'w-28' },
    { key: 'situacao', header: m.col_situacao, className: 'w-28' },
    { key: 'acoes',    header: m.col_acoes,    className: 'w-32 text-right' },
  ]

  const tipoRapidoOpcoes: { value: CategoriaFinanceiraTipo; label: string }[] = [
    { value: 'RECEITA', label: m.tipo_receita },
    { value: 'DESPESA', label: m.tipo_despesa },
    { value: 'AMBOS',   label: m.tipo_ambos },
  ]

  return (
    <>
      <CategoriaFinModal
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

      <div className="grid gap-4 px-4 py-4 md:px-6 lg:grid-cols-[260px_1fr]">
        {/* Sidebar */}
        <div className="flex flex-col gap-4">
          <FiltroLateralCadastro
            title={m.filtros_titulo}
            campos={camposFiltro}
            onFiltrar={handleFiltrar}
            onLimpar={handleLimpar}
            labelFiltrar={m.filtrar}
            labelLimpar={m.limpar_filtros}
          />

          <CadastroRapidoBlock title={m.cadastro_rapido} subtitle={m.cadastro_rapido_hint}>
            <div className="flex flex-col gap-2">
              {/* Seletor de tipo rápido */}
              <div className="flex gap-1">
                {tipoRapidoOpcoes.map((op) => (
                  <button
                    key={op.value}
                    type="button"
                    onClick={() => setTipoRapido(op.value)}
                    className={`flex-1 rounded-md border py-1 text-[10px] font-semibold transition ${
                      tipoRapido === op.value
                        ? op.value === 'RECEITA'
                          ? 'app-badge-positive border-emerald-500/40'
                          : op.value === 'DESPESA'
                          ? 'app-badge-danger border-red-500/40'
                          : 'app-badge-warn border-amber-500/40'
                        : 'app-border opacity-40 hover:opacity-70'
                    }`}
                  >
                    {op.label}
                  </button>
                ))}
              </div>
              <input
                type="text"
                value={nomeRapido}
                onChange={(e) => setNomeRapido(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') criarRapido(undefined) }}
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
                    <Landmark className="h-10 w-10 opacity-30" />
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
                <CategoriaFinRow
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
