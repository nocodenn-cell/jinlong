'use client'

import { useRouter } from 'next/navigation'
<<<<<<< HEAD
import { ChevronDown, ChevronLeft, ChevronRight, Filter, Plus } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { objectsToCsv } from '@/lib/csv'
=======
import { ChevronLeft, ChevronRight, Pencil, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { GerenteTableColumn } from '@/components/gerente/GerenteTable'
import type { CampoFiltro } from '@/components/gerente/cadastro'
import { CadastroRapidoBlock, FiltroLateralCadastro, TabelaCadastroPadrao } from '@/components/gerente/cadastro'
>>>>>>> origin/main
import { GerenteFilterBar } from '@/components/gerente/GerenteFilterBar'
import { GerenteStickyToolbar } from '@/components/gerente/GerenteStickyToolbar'
import { ProdutosEditarCatalogoModal } from '@/components/gerente/produtos/ProdutosEditarCatalogoModal'
import { ProdutosExcluirLoteModal } from '@/components/gerente/produtos/ProdutosExcluirLoteModal'
import { ProdutosImportarModal } from '@/components/gerente/produtos/ProdutosImportarModal'
import { ProdutoImagemCell } from '@/components/gerente/produtos/ProdutoImagemCell'
import { ProdutosListaImpressao } from '@/components/gerente/produtos/ProdutosListaImpressao'
import { ProdutosToolbar } from '@/components/gerente/produtos/ProdutosToolbar'
import { GerenteStatusBadge } from '@/components/gerente/GerenteStatusBadge'
import { downloadCsvBrowser, interpolateTemplate } from '@/lib/gerente/gerenteCadastroUi'
import { readFormDataString } from '@/lib/forms/readFormDataString'
import { useGerenteMutation } from '@/lib/hooks/useGerenteMutation'
import { emitGerenteToast } from '@/lib/gerente/toast'
import type { Idioma } from '@/idioma/normalizeIdioma'
<<<<<<< HEAD
import { getMessages, type Mensagens } from '@/i18n/getMessages'
=======
import { getMessages } from '@/i18n/getMessages'
import type { BuscarProdutosComFiltrosInput, OpcoesFiltrosProdutos } from './actions'
>>>>>>> origin/main
import {
  alternarAtivoProduto,
  atualizarPrecoVarejoProduto,
  buscarProdutosComFiltros,
  buscarProdutosParaExportacao,
  criarProduto,
} from './actions'
import type { ProdutoGerenteRow } from './produtoGerenteTypes'
import { parseTagsFiltroTexto } from './produtoGerenteFiltrosUtils'

export type { ProdutoGerenteRow } from './produtoGerenteTypes'

type OrigemCode = 'china_manual' | 'brasil_nf' | 'brasil_sem_nf'

<<<<<<< HEAD
type FiltroProdutosState = Readonly<{
  origem: 'all' | OrigemCode
  status: 'all' | 'ativo' | 'inativo'
  nf: 'all' | 'sim' | 'nao'
}>

const FILTRO_PRODUTOS_INICIAL: FiltroProdutosState = {
  origem: 'all',
  status: 'all',
  nf: 'all',
}

function ProdutosFiltrosCampos({
  m,
  draft,
  setDraft,
  finSelect,
  onAplicar,
  onLimpar,
}: Readonly<{
  m: Mensagens
  draft: FiltroProdutosState
  setDraft: React.Dispatch<React.SetStateAction<FiltroProdutosState>>
  finSelect: string
  onAplicar: () => void
  onLimpar: () => void
}>) {
  return (
    <div className="flex flex-col gap-3">
      <div>
        <label htmlFor="filtro-origem" className="mb-1 block text-[10px] font-semibold uppercase tracking-wide app-muted">
          {m.produtos.filtro_origem_label}
        </label>
        <select
          id="filtro-origem"
          value={draft.origem}
          onChange={(e) => setDraft((d) => ({ ...d, origem: e.target.value as 'all' | OrigemCode }))}
          className={`${finSelect} h-9 w-full`}
        >
          <option value="all">{m.produtos.filtro_todas_origens}</option>
          <option value="china_manual">{m.produtos.origem_china}</option>
          <option value="brasil_nf">{m.produtos.origem_brasil_nf}</option>
          <option value="brasil_sem_nf">{m.produtos.origem_brasil_sem_nf}</option>
        </select>
      </div>
      <div>
        <label htmlFor="filtro-status" className="mb-1 block text-[10px] font-semibold uppercase tracking-wide app-muted">
          {m.produtos.filtro_status_label}
        </label>
        <select
          id="filtro-status"
          value={draft.status}
          onChange={(e) => setDraft((d) => ({ ...d, status: e.target.value as 'all' | 'ativo' | 'inativo' }))}
          className={`${finSelect} h-9 w-full`}
        >
          <option value="all">{m.produtos.filtro_todos_status}</option>
          <option value="ativo">{m.produtos.ativo}</option>
          <option value="inativo">{m.produtos.inativo}</option>
        </select>
      </div>
      <div>
        <label htmlFor="filtro-nf" className="mb-1 block text-[10px] font-semibold uppercase tracking-wide app-muted">
          {m.produtos.filtro_nf_label}
        </label>
        <select
          id="filtro-nf"
          value={draft.nf}
          onChange={(e) => setDraft((d) => ({ ...d, nf: e.target.value as 'all' | 'sim' | 'nao' }))}
          className={`${finSelect} h-9 w-full`}
        >
          <option value="all">{m.produtos.filtro_todas_nf}</option>
          <option value="sim">{m.produtos.filtro_nf_sim}</option>
          <option value="nao">{m.produtos.filtro_nf_nao}</option>
        </select>
      </div>
      <button
        type="button"
        onClick={onAplicar}
        className="mt-1 h-10 w-full rounded-lg border text-xs font-semibold shadow-sm transition-opacity app-border app-btn-neutral hover:opacity-95"
      >
        {m.produtos.filtrar}
      </button>
      <button type="button" onClick={onLimpar} className="text-center text-xs font-medium app-accent-text underline-offset-2 hover:underline">
        {m.produtos.limpar_filtros}
      </button>
    </div>
  )
=======
type FiltrosUi = {
  situacao: 'todos' | 'ativos' | 'inativos'
  origem: 'all' | OrigemCode
  nf: 'all' | 'sim' | 'nao'
  estoque: 'todos' | 'abaixo_minimo' | 'em_falta'
  imagens: 'todos' | 'com_imagem' | 'sem_imagem'
  tagsTexto: string
  categoriaId: string
  marcaId: string
  fornecedorId: string
  busca: string
}

const FILTROS_UI_INITIAL: FiltrosUi = {
  situacao: 'todos',
  origem: 'all',
  nf: 'all',
  estoque: 'todos',
  imagens: 'todos',
  tagsTexto: '',
  categoriaId: '',
  marcaId: '',
  fornecedorId: '',
  busca: '',
}

function toBuscarInput(f: FiltrosUi, page: number, pageSize: number): BuscarProdutosComFiltrosInput {
  return {
    situacao: f.situacao,
    origem: f.origem,
    nf: f.nf,
    estoque: f.estoque,
    imagens: f.imagens,
    tags: parseTagsFiltroTexto(f.tagsTexto),
    categoriaId: f.categoriaId || undefined,
    marcaId: f.marcaId || undefined,
    fornecedorId: f.fornecedorId || undefined,
    busca: f.busca,
    page,
    pageSize,
  }
>>>>>>> origin/main
}

function OrigemBadgeUi({
  tooltip,
  label,
  className,
}: Readonly<{
  tooltip: string
  label: string
  className: string
}>) {
  return (
    <span
      title={tooltip}
      className={`inline-flex max-w-[9rem] truncate rounded-full border px-2 py-0.5 text-[11px] font-semibold ${className}`}
    >
      {label}
    </span>
  )
}

function PrecoVarejoCell({
  produtoId,
  precoVarejo,
  onSaved,
  msgInvalido,
  msgMaiorZero,
  atualizadoMessage,
}: Readonly<{
  produtoId: string
  precoVarejo: number
  onSaved: () => void
  msgInvalido: string
  msgMaiorZero: string
  atualizadoMessage: string
}>) {
  const [draft, setDraft] = useState(() => String(precoVarejo))
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setDraft(String(precoVarejo))
  }, [precoVarejo, produtoId])

  const parseValor = (raw: string): number | null => {
    const t = raw.trim().replace(/\s/g, '').replace(',', '.')
    if (t === '') return null
    const n = Number(t)
    return Number.isFinite(n) ? n : null
  }

  return (
    <input
      type="text"
      inputMode="decimal"
      disabled={saving}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={async () => {
        const n = parseValor(draft)
        if (n === null) {
          emitGerenteToast({
            kind: 'error',
            message: msgInvalido,
          })
          setDraft(String(precoVarejo))
          return
        }
        if (n <= 0) {
          emitGerenteToast({ kind: 'error', message: msgMaiorZero })
          setDraft(String(precoVarejo))
          return
        }
        if (Math.abs(n - precoVarejo) < 0.005) {
          setDraft(String(precoVarejo))
          return
        }
        setSaving(true)
        try {
          const r = await atualizarPrecoVarejoProduto({
            produto_id: produtoId,
            preco_varejo: n,
          })
          if (!r.success) {
            emitGerenteToast({ kind: 'error', message: r.error })
            setDraft(String(precoVarejo))
            return
          }
          emitGerenteToast({ kind: 'success', message: atualizadoMessage })
          onSaved()
        } finally {
          setSaving(false)
        }
      }}
      className="gerente-fin-cell w-full min-w-[6rem] rounded-md border border-transparent bg-transparent px-1.5 py-1 text-right text-xs font-semibold tabular-nums text-[color:var(--color-brand-primary)] app-border hover:border-[color:var(--gerente-ring,theme(colors.slate.500))] focus:border-amber-500/80 focus:outline-none focus:ring-1 focus:ring-amber-500/50 disabled:opacity-50"
      aria-label="Preço varejo"
    />
  )
}

type Props = Readonly<{
  idioma: Idioma
  opcoes: OpcoesFiltrosProdutos
  inicial: { rows: ProdutoGerenteRow[]; total: number }
}>

export function ProdutosGerentePageClient({ idioma, opcoes, inicial }: Props) {
  const m = getMessages(idioma)
  const router = useRouter()
  const fontClass = idioma === 'pt' ? '' : 'font-chinese'

  const [rows, setRows] = useState<ProdutoGerenteRow[]>(inicial.rows)
  const [total, setTotal] = useState(inicial.total)
  const [filtros, setFiltros] = useState<FiltrosUi>(FILTROS_UI_INITIAL)
  const [paginaAtual, setPaginaAtual] = useState(1)
  const [itensPorPagina, setItensPorPagina] = useState(10)
<<<<<<< HEAD
  const [draftFiltro, setDraftFiltro] = useState<FiltroProdutosState>(() => ({ ...FILTRO_PRODUTOS_INICIAL }))
  const [appliedFiltro, setAppliedFiltro] = useState<FiltroProdutosState>(() => ({ ...FILTRO_PRODUTOS_INICIAL }))
  const [showFormNovo, setShowFormNovo] = useState(true)

  const aplicarFiltrosLaterais = useCallback(() => {
    setAppliedFiltro({ ...draftFiltro })
    setPaginaAtual(1)
  }, [draftFiltro])

  const limparFiltrosLaterais = useCallback(() => {
    setDraftFiltro({ ...FILTRO_PRODUTOS_INICIAL })
    setAppliedFiltro({ ...FILTRO_PRODUTOS_INICIAL })
    setPaginaAtual(1)
  }, [])

  const produtosFiltrados = useMemo(() => {
    const termo = busca.toLowerCase().trim()
    return rows.filter((p) => {
      if (appliedFiltro.origem !== 'all' && p.origem !== appliedFiltro.origem) return false
      if (appliedFiltro.status === 'ativo' && !p.ativo) return false
      if (appliedFiltro.status === 'inativo' && p.ativo) return false
      if (appliedFiltro.nf === 'sim' && !p.tem_nf) return false
      if (appliedFiltro.nf === 'nao' && p.tem_nf) return false
      if (!termo) return true
      const nome = p.nome?.toLowerCase() ?? ''
      const cb = p.codigo_barras ?? ''
      const idLow = p.id.toLowerCase()
      return nome.includes(termo) || cb.includes(termo) || idLow.includes(termo)
    })
  }, [busca, rows, appliedFiltro])
=======
  const [loadingList, setLoadingList] = useState(false)
  const tinhaProdutosAoCarregar = useRef(inicial.total > 0)

  const [importModalAberto, setImportModalAberto] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())
  const [exclusaoModalAberto, setExclusaoModalAberto] = useState(false)
  const [idsExclusaoLote, setIdsExclusaoLote] = useState<readonly string[]>([])
  const [editarModalAberto, setEditarModalAberto] = useState(false)
  const [produtoEditar, setProdutoEditar] = useState<ProdutoGerenteRow | null>(null)
  const [linhasImpressao, setLinhasImpressao] = useState<ProdutoGerenteRow[]>([])
>>>>>>> origin/main

  const fetchList = useCallback(async (f: FiltrosUi, page: number) => {
    setLoadingList(true)
    try {
      const r = await buscarProdutosComFiltros(toBuscarInput(f, page, itensPorPagina))
      if (!r.success) {
        emitGerenteToast({ kind: 'error', message: r.error })
        return
      }
      setRows(r.data.rows)
      setTotal(r.data.total)
    } finally {
      setLoadingList(false)
    }
  }, [itensPorPagina])

  const primeiraMontagem = useRef(true)
  useEffect(() => {
    if (primeiraMontagem.current) {
      primeiraMontagem.current = false
      return
    }
    const id = setTimeout(() => {
      void fetchList(filtros, paginaAtual)
    }, 320)
    return () => clearTimeout(id)
  }, [filtros, paginaAtual, itensPorPagina, fetchList])

  const refetch = useCallback(() => {
    void fetchList(filtros, paginaAtual)
    router.refresh()
  }, [fetchList, filtros, paginaAtual, router])

  useEffect(() => {
    setSelectedIds(new Set())
  }, [filtros, paginaAtual, itensPorPagina])

  useLayoutEffect(() => {
    if (linhasImpressao.length === 0) return
    const onAfterPrint = () => {
      setLinhasImpressao([])
      window.removeEventListener('afterprint', onAfterPrint)
    }
    window.addEventListener('afterprint', onAfterPrint)
    window.print()
    return () => window.removeEventListener('afterprint', onAfterPrint)
  }, [linhasImpressao])

  const totalPaginas = Math.max(1, Math.ceil(total / itensPorPagina))
  const paginaSegura = Math.min(paginaAtual, totalPaginas)

  useEffect(() => {
    setPaginaAtual((prev) => Math.min(prev, totalPaginas))
  }, [totalPaginas])

  const todosPaginaSelecionados =
    rows.length > 0 && rows.every((p) => selectedIds.has(p.id))

  const alternarSelecaoPagina = useCallback(() => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (todosPaginaSelecionados) {
        rows.forEach((p) => next.delete(p.id))
      } else {
        rows.forEach((p) => next.add(p.id))
      }
      return next
    })
  }, [rows, todosPaginaSelecionados])

  const exportOpts = useMemo(() => ({ successMessage: m.comum.sucesso }), [m.comum.sucesso])

  const { mutate: exportCsv, loading: expLoading } = useGerenteMutation(
    async () => {
      const r = await buscarProdutosParaExportacao(toBuscarInput(filtros, 1, itensPorPagina), 500)
      if (!r.success) throw new Error(r.error)
      downloadCsvBrowser(
        'gerente-produtos.csv',
        [
          { key: 'id', header: 'id' },
          { key: 'nome', header: m.produtos.nome },
          { key: 'codigo_barras', header: m.produtos.codigo_barras },
          { key: 'preco_varejo', header: m.produtos.preco_varejo },
          { key: 'origem', header: m.produtos.origem_label },
          { key: 'tem_nf', header: m.produtos.tem_nf },
          { key: 'ativo', header: m.produtos.status },
        ],
        r.data.map((p) => ({
          id: p.id,
          nome: p.nome,
          codigo_barras: p.codigo_barras ?? '',
          preco_varejo: Number(p.preco_varejo),
          origem: p.origem,
          tem_nf: p.tem_nf ? '1' : '0',
          ativo: p.ativo ? '1' : '0',
        })),
      )
      return null
    },
    exportOpts,
  )

  const { mutate: criar, loading: criarLoading } = useGerenteMutation(
    async (input: {
      nome: string
      codigo_barras: string
      preco_varejo: number
      origem: string
      tem_nf: boolean
    }) => {
      const r = await criarProduto(input)
      if (!r.success) throw new Error(r.error)
      void fetchList(filtros, paginaAtual)
      router.refresh()
      return r.data
    },
    { successMessage: m.comum.sucesso },
  )

  const { mutate: toggle, loading: toggleLoading } = useGerenteMutation(
    async (p: { id: string; ativo: boolean }) => {
      const r = await alternarAtivoProduto(p.id, p.ativo)
      if (!r.success) throw new Error(r.error)
      void fetchList(filtros, paginaAtual)
      router.refresh()
      return null
    },
    { successMessage: m.comum.sucesso },
  )

  const finIn = 'h-9 rounded-md px-3 text-xs app-input'
  const finSelect = 'h-9 rounded-md px-3 text-xs app-select'

<<<<<<< HEAD
  return (
    <div className={`mx-auto w-full max-w-[1600px] px-4 py-6 md:px-6 ${fontClass}`}>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(240px,280px)_1fr] lg:items-start lg:gap-8">
        <aside className="hidden lg:block">
          <div className="dragon-glass-card sticky top-4 rounded-xl p-4">
            <div className="gerente-fin-divider mb-4 flex items-center gap-2 border-b pb-3">
              <Filter className="h-4 w-4 shrink-0 app-accent-text" aria-hidden />
              <span className="text-xs font-bold uppercase tracking-wide">{m.produtos.painel_filtrar}</span>
            </div>
            <ProdutosFiltrosCampos
              m={m}
              draft={draftFiltro}
              setDraft={setDraftFiltro}
              finSelect={finSelect}
              onAplicar={aplicarFiltrosLaterais}
              onLimpar={limparFiltrosLaterais}
            />
          </div>
        </aside>

        <div className="min-w-0 space-y-4">
          <details className="group dragon-glass-card overflow-hidden rounded-xl lg:hidden">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 font-semibold [&::-webkit-details-marker]:hidden">
              <span className="flex items-center gap-2 text-sm">
                <Filter className="h-4 w-4 app-accent-text" aria-hidden />
                {m.produtos.painel_filtrar}
              </span>
              <ChevronDown className="h-4 w-4 shrink-0 transition-transform group-open:rotate-180" aria-hidden />
            </summary>
            <div className="gerente-fin-divider border-t p-4">
              <ProdutosFiltrosCampos
                m={m}
                draft={draftFiltro}
                setDraft={setDraftFiltro}
                finSelect={finSelect}
                onAplicar={aplicarFiltrosLaterais}
                onLimpar={limparFiltrosLaterais}
              />
            </div>
          </details>

          <GerenteFilterBar title={m.produtos.titulo} />

          <p className="gerente-fin-muted text-xs">
            {idioma === 'pt'
              ? 'Gestão de catálogo com visão densa para operação diária.'
              : '高密度商品管理视图，适合日常运营。'}
          </p>

          {showFormNovo ? (
            <section className="dragon-glass-card overflow-hidden rounded-xl">
              <div className="gerente-fin-divider border-b px-3 py-2.5">
                <h2 className="gerente-section-accent text-sm font-semibold">{m.produtos.cadastro_rapido}</h2>
              </div>
              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  const fd = new FormData(e.currentTarget)
                  const nome = readFormDataString(fd, 'nome').trim()
                  if (!nome) {
                    emitGerenteToast({ kind: 'error', message: m.produtos.nome_obrigatorio })
                    return
                  }
                  void criar({
                    nome,
                    codigo_barras: readFormDataString(fd, 'codigo_barras'),
                    preco_varejo: Number(fd.get('preco_varejo')),
                    origem: readFormDataString(fd, 'origem'),
                    tem_nf: fd.get('tem_nf') === 'on',
                  })
                  e.currentTarget.reset()
                }}
                className="grid grid-cols-1 gap-2.5 p-3 md:grid-cols-6"
              >
                <input name="nome" placeholder={m.produtos.nome} className={`${finIn} md:col-span-2`} />
                <input name="codigo_barras" placeholder={m.produtos.codigo_barras} className={finIn} />
                <input
                  name="preco_varejo"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder={m.produtos.preco_varejo}
                  required
                  className={finIn}
                />
                <select name="origem" defaultValue="china_manual" className={finSelect}>
                  <option value="china_manual">{m.produtos.origem_china}</option>
                  <option value="brasil_nf">{m.produtos.origem_brasil_nf}</option>
                  <option value="brasil_sem_nf">{m.produtos.origem_brasil_sem_nf}</option>
                </select>
                <button
                  type="submit"
                  disabled={criarLoading}
                  className="h-9 rounded-md px-3 text-xs font-semibold shadow-sm transition-[filter] disabled:opacity-60 app-btn-accent"
                >
                  {criarLoading ? '…' : m.comum.salvar}
                </button>
                <label className="gerente-fin-muted md:col-span-6 inline-flex items-center gap-2 text-xs">
                  <input type="checkbox" name="tem_nf" className="h-3.5 w-3.5 rounded app-border app-surface-soft" />
                  {m.produtos.tem_nf}
                  <span className="opacity-80">· {m.produtos.codigo_barras_opcional}</span>
                </label>
              </form>
            </section>
          ) : null}

          <section className="dragon-glass-card overflow-hidden rounded-xl">
            <div className="gerente-fin-divider flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2.5">
              <h2 className="gerente-section-accent text-sm font-semibold">{m.produtos.lista_produtos}</h2>
              <p className="gerente-fin-muted text-xs font-medium">
                {interpolate(m.produtos.contador_encontrados, { count: produtosFiltrados.length })}
              </p>
            </div>

            <div className="gerente-fin-divider flex flex-wrap items-center gap-2 border-b p-3">
              <input
                value={busca}
                onChange={(e) => {
                  setBusca(e.target.value)
                  setPaginaAtual(1)
                }}
                placeholder={m.produtos.buscar_codigo_descricao}
                className={`${finIn} h-9 min-h-[2.25rem] min-w-[min(100%,12rem)] flex-1`}
                aria-label={m.produtos.buscar_codigo_descricao}
              />
              <button
                type="button"
                disabled={expLoading || produtosFiltrados.length === 0}
                onClick={() => void exportCsv(null)}
                className="gerente-btn-csv shrink-0 rounded-md px-3 py-2 text-xs font-medium disabled:opacity-50"
              >
                {m.gerente.exportar_csv}
              </button>
              <button
                type="button"
                onClick={() => setShowFormNovo((open) => !open)}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-md px-3 py-2 text-xs font-semibold shadow-sm transition-opacity app-btn-accent"
              >
                <Plus className="h-4 w-4" aria-hidden />
                {m.produtos.incluir_cadastro}
              </button>
            </div>

            <div className="p-3">
          <GerenteTable
            tone="dragon"
            columns={[
              { key: 'id', header: 'ID' },
              { key: 'nome', header: m.produtos.nome },
              { key: 'cb', header: m.produtos.codigo_barras },
              { key: 'preco', header: m.produtos.preco_varejo, width: '7rem' },
              { key: 'origem', header: m.produtos.origem_label },
              { key: 'nf', header: m.produtos.tem_nf },
              { key: 'st', header: m.produtos.status },
              { key: 'ac', header: m.produtos.acoes, width: '6rem' },
            ]}
          >
            {rows.length === 0 ? (
=======
  const patchFiltro = useCallback(<K extends keyof FiltrosUi>(k: K, v: FiltrosUi[K], resetPage = true) => {
    setFiltros((prev) => ({ ...prev, [k]: v }))
    if (resetPage) setPaginaAtual(1)
  }, [])

  const onFiltrar = useCallback(() => {
    setPaginaAtual(1)
    void fetchList(filtros, 1)
  }, [fetchList, filtros])

  const onLimpar = useCallback(() => {
    setFiltros(FILTROS_UI_INITIAL)
    setPaginaAtual(1)
  }, [])

  const irParaCadastroRapido = useCallback(() => {
    document.getElementById('cadastro-rapido')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [])

  const imprimirLista = useCallback(async () => {
    if (total === 0) return
    const r = await buscarProdutosParaExportacao(toBuscarInput(filtros, 1, itensPorPagina), 500)
    if (!r.success) {
      emitGerenteToast({ kind: 'error', message: r.error })
      return
    }
    if (r.data.length === 0) {
      emitGerenteToast({ kind: 'error', message: m.produtos.nenhum_resultado_filtro })
      return
    }
    setLinhasImpressao(r.data)
  }, [filtros, itensPorPagina, m.produtos.nenhum_resultado_filtro, total])

  const irParaColunaFoto = useCallback(() => {
    document.getElementById('produtos-foto-col-anchor')?.scrollIntoView({
      behavior: 'smooth',
      block: 'nearest',
    })
  }, [])

  const abrirExclusaoLote = useCallback(() => {
    const arr = Array.from(selectedIds)
    if (arr.length === 0) {
      emitGerenteToast({ kind: 'error', message: m.produtos.exclusao_sem_selecao })
      return
    }
    if (arr.length > 100) {
      emitGerenteToast({ kind: 'error', message: m.produtos.exclusao_max_selecao })
      return
    }
    setIdsExclusaoLote(arr)
    setExclusaoModalAberto(true)
  }, [selectedIds, m.produtos])

  const abrirExclusaoIndividual = useCallback((produtoId: string) => {
    setIdsExclusaoLote([produtoId])
    setExclusaoModalAberto(true)
  }, [])

  const onExclusaoModalOpenChange = useCallback((open: boolean) => {
    setExclusaoModalAberto(open)
    if (!open) setIdsExclusaoLote([])
  }, [])

  const handleLoteExclusaoAplicado = useCallback(() => {
    void fetchList(filtros, paginaAtual)
    router.refresh()
    setSelectedIds(new Set())
  }, [fetchList, filtros, paginaAtual, router])

  const abrirEditar = useCallback((p: ProdutoGerenteRow) => {
    setProdutoEditar(p)
    setEditarModalAberto(true)
  }, [])

  const onEditarModalOpenChange = useCallback((open: boolean) => {
    setEditarModalAberto(open)
    if (!open) setProdutoEditar(null)
  }, [])

  const opCategorias = useMemo(
    () => [
      { value: '', label: m.produtos.filtro_categoria_todas },
      ...opcoes.categorias.map((c) => ({ value: c.id, label: c.nome })),
    ],
    [m.produtos.filtro_categoria_todas, opcoes.categorias],
  )

  const opMarcas = useMemo(
    () => [
      { value: '', label: m.produtos.filtro_marca_todas },
      ...opcoes.marcas.map((x) => ({ value: x.id, label: x.nome })),
    ],
    [m.produtos.filtro_marca_todas, opcoes.marcas],
  )

  const opFornecedores = useMemo(
    () => [
      { value: '', label: m.produtos.filtro_fornecedor_todos },
      ...opcoes.fornecedores.map((x) => ({ value: x.id, label: x.nome })),
    ],
    [m.produtos.filtro_fornecedor_todos, opcoes.fornecedores],
  )

  const camposFiltro: CampoFiltro[] = useMemo(
    () => [
      {
        id: 'busca',
        label: m.produtos.buscar,
        tipo: 'search',
        valor: filtros.busca,
        onChange: (v) => patchFiltro('busca', typeof v === 'string' ? v : '', false),
        placeholder: m.produtos.buscar,
      },
      {
        id: 'origem',
        label: m.produtos.origem_label,
        tipo: 'select',
        valor: filtros.origem,
        onChange: (v) => patchFiltro('origem', (typeof v === 'string' ? v : 'all') as FiltrosUi['origem']),
        opcoes: [
          { value: 'all', label: m.produtos.filtro_todas_origens },
          { value: 'china_manual', label: m.produtos.origem_china },
          { value: 'brasil_nf', label: m.produtos.origem_brasil_nf },
          { value: 'brasil_sem_nf', label: m.produtos.origem_brasil_sem_nf },
        ],
      },
      {
        id: 'situacao',
        label: m.produtos.filtro_situacao_label,
        tipo: 'select',
        valor: filtros.situacao,
        onChange: (v) =>
          patchFiltro('situacao', (typeof v === 'string' ? v : 'todos') as FiltrosUi['situacao']),
        opcoes: [
          { value: 'todos', label: m.produtos.filtro_situacao_todos },
          { value: 'ativos', label: m.produtos.filtro_situacao_somente_ativos },
          { value: 'inativos', label: m.produtos.filtro_situacao_somente_inativos },
        ],
      },
      {
        id: 'nf',
        label: m.produtos.tem_nf,
        tipo: 'select',
        valor: filtros.nf,
        onChange: (v) => patchFiltro('nf', (typeof v === 'string' ? v : 'all') as FiltrosUi['nf']),
        opcoes: [
          { value: 'all', label: m.produtos.filtro_todas_nf },
          { value: 'sim', label: m.produtos.filtro_nf_sim },
          { value: 'nao', label: m.produtos.filtro_nf_nao },
        ],
      },
      {
        id: 'estoque',
        label: m.produtos.filtro_estoque_label,
        tipo: 'select',
        valor: filtros.estoque,
        onChange: (v) => patchFiltro('estoque', (typeof v === 'string' ? v : 'todos') as FiltrosUi['estoque']),
        opcoes: [
          { value: 'todos', label: m.produtos.filtro_estoque_todos },
          { value: 'abaixo_minimo', label: m.produtos.filtro_estoque_abaixo_minimo },
          { value: 'em_falta', label: m.produtos.filtro_estoque_em_falta },
        ],
      },
      {
        id: 'imagens',
        label: m.produtos.filtro_imagens_label,
        tipo: 'select',
        valor: filtros.imagens,
        onChange: (v) => patchFiltro('imagens', (typeof v === 'string' ? v : 'todos') as FiltrosUi['imagens']),
        opcoes: [
          { value: 'todos', label: m.produtos.filtro_imagens_todos },
          { value: 'com_imagem', label: m.produtos.filtro_imagens_com },
          { value: 'sem_imagem', label: m.produtos.filtro_imagens_sem },
        ],
      },
      {
        id: 'categoria',
        label: m.produtos.categoria,
        tipo: 'select',
        valor: filtros.categoriaId,
        onChange: (v) => patchFiltro('categoriaId', typeof v === 'string' ? v : ''),
        opcoes: opCategorias,
      },
      {
        id: 'marca',
        label: m.produtos.filtro_marca_label,
        tipo: 'select',
        valor: filtros.marcaId,
        onChange: (v) => patchFiltro('marcaId', typeof v === 'string' ? v : ''),
        opcoes: opMarcas,
      },
      {
        id: 'fornecedor',
        label: m.produtos.filtro_fornecedor_label,
        tipo: 'select',
        valor: filtros.fornecedorId,
        onChange: (v) => patchFiltro('fornecedorId', typeof v === 'string' ? v : ''),
        opcoes: opFornecedores,
      },
      {
        id: 'tags',
        label: m.produtos.filtro_tags_label,
        tipo: 'search',
        valor: filtros.tagsTexto,
        onChange: (v) => patchFiltro('tagsTexto', typeof v === 'string' ? v : '', false),
        placeholder: m.produtos.filtro_tags_placeholder,
      },
    ],
    [filtros, m.produtos, opCategorias, opMarcas, opFornecedores, patchFiltro],
  )

  const colunasProdutos: GerenteTableColumn[] = [
    {
      key: 'sel',
      header: (
        <input
          type="checkbox"
          className="h-3.5 w-3.5 rounded app-border app-surface-soft"
          checked={todosPaginaSelecionados}
          onChange={() => alternarSelecaoPagina()}
          disabled={rows.length === 0}
          aria-label={m.produtos.coluna_selecionar_aria}
          title={m.produtos.coluna_selecionar_aria}
        />
      ),
      width: '2.75rem',
    },
    { key: 'id', header: 'ID' },
    {
      key: 'foto',
      header: (
        <span id="produtos-foto-col-anchor" className="inline-flex">
          {m.produtos.foto_coluna}
        </span>
      ),
      width: '3.75rem',
    },
    { key: 'nome', header: m.produtos.nome },
    { key: 'cb', header: m.produtos.codigo_barras },
    { key: 'preco', header: m.produtos.preco_varejo, width: '7rem' },
    { key: 'origem', header: m.produtos.origem_label },
    { key: 'nf', header: m.produtos.tem_nf },
    { key: 'st', header: m.produtos.status },
    { key: 'ac', header: m.produtos.acoes, width: '8.75rem' },
  ]

  const colSpanVazio = colunasProdutos.length

  return (
    <>
      <div className={`print:hidden mx-auto w-full max-w-7xl space-y-4 px-4 py-6 md:px-6 ${fontClass}`}>
        <GerenteFilterBar title={m.produtos.titulo} />
        <GerenteStickyToolbar>
          <ProdutosToolbar
            m={m}
            exportDisabled={expLoading || total === 0}
            exportLoading={expLoading}
            printDisabled={total === 0}
            fotoDisabled={total === 0}
            exclusaoDisabled={selectedIds.size === 0 || selectedIds.size > 100}
            onExport={() => void exportCsv(null)}
            onImport={() => setImportModalAberto(true)}
            onIncluirCadastro={irParaCadastroRapido}
            onPrint={() => void imprimirLista()}
            onFotoColuna={irParaColunaFoto}
            onExcluir={abrirExclusaoLote}
          />
        </GerenteStickyToolbar>
        <ProdutosExcluirLoteModal
          open={exclusaoModalAberto}
          onOpenChange={onExclusaoModalOpenChange}
          produtoIds={idsExclusaoLote}
          m={m}
          onLoteAplicadoComSucesso={handleLoteExclusaoAplicado}
        />
        <ProdutosEditarCatalogoModal
          open={editarModalAberto}
          onOpenChange={onEditarModalOpenChange}
          produto={produtoEditar}
          m={m}
          onSalvo={refetch}
        />
        <ProdutosImportarModal
          open={importModalAberto}
          onOpenChange={setImportModalAberto}
          m={m}
          onImportComplete={refetch}
        />
        <p className="gerente-fin-muted -mt-2 text-xs">
          {idioma === 'pt'
            ? 'Gestão de catálogo com visão densa para operação diária.'
            : '高密度商品管理视图，适合日常运营。'}
        </p>

        <section id="cadastro-rapido" className="scroll-mt-24">
          <CadastroRapidoBlock title={m.produtos.cadastro_rapido} defaultOpen>
            <form
              onSubmit={(e) => {
                e.preventDefault()
                const fd = new FormData(e.currentTarget)
                const nome = readFormDataString(fd, 'nome').trim()
                if (!nome) {
                  emitGerenteToast({ kind: 'error', message: m.produtos.nome_obrigatorio })
                  return
                }
                void criar({
                  nome,
                  codigo_barras: readFormDataString(fd, 'codigo_barras'),
                  preco_varejo: Number(fd.get('preco_varejo')),
                  origem: readFormDataString(fd, 'origem'),
                  tem_nf: fd.get('tem_nf') === 'on',
                })
                e.currentTarget.reset()
              }}
              className="grid grid-cols-1 gap-2.5 md:grid-cols-6"
            >
              <input name="nome" placeholder={m.produtos.nome} className={`${finIn} md:col-span-2`} />
              <input name="codigo_barras" placeholder={m.produtos.codigo_barras} className={finIn} />
              <input
                name="preco_varejo"
                type="number"
                step="0.01"
                min="0"
                placeholder={m.produtos.preco_varejo}
                required
                className={finIn}
              />
              <select name="origem" defaultValue="china_manual" className={finSelect}>
                <option value="china_manual">{m.produtos.origem_china}</option>
                <option value="brasil_nf">{m.produtos.origem_brasil_nf}</option>
                <option value="brasil_sem_nf">{m.produtos.origem_brasil_sem_nf}</option>
              </select>
              <button
                type="submit"
                disabled={criarLoading}
                className="h-9 rounded-md px-3 text-xs font-semibold shadow-sm transition-[filter] disabled:opacity-60 app-btn-accent"
              >
                {criarLoading ? '…' : m.comum.salvar}
              </button>
              <label className="gerente-fin-muted md:col-span-6 inline-flex items-center gap-2 text-xs">
                <input type="checkbox" name="tem_nf" className="h-3.5 w-3.5 rounded app-border app-surface-soft" />
                {m.produtos.tem_nf}
                <span className="opacity-80">· {m.produtos.codigo_barras_opcional}</span>
              </label>
            </form>
          </CadastroRapidoBlock>
        </section>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(14rem,18rem)_1fr] lg:items-start">
          <FiltroLateralCadastro
            title={m.produtos.filtros_lateral_titulo}
            labelFiltrar={m.produtos.filtrar}
            labelLimpar={m.comum.limpar_filtros}
            onFiltrar={onFiltrar}
            onLimpar={onLimpar}
            campos={camposFiltro}
          />

          <TabelaCadastroPadrao
            sectionTitle={m.produtos.lista_produtos}
            sectionMeta={
              <span className="inline-flex flex-wrap items-center gap-2">
                <span>{interpolateTemplate(m.produtos.contador_encontrados, { count: total })}</span>
                {loadingList ? (
                  <span className="text-[11px] font-normal opacity-70">{m.produtos.filtro_carregando}</span>
                ) : null}
              </span>
            }
            columns={colunasProdutos}
            footer={
              total > 0 ? (
                <div className="gerente-fin-divider flex flex-col gap-3 border-t px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="gerente-fin-muted text-xs">
                    {interpolateTemplate(m.produtos.pag_mostrar, {
                      visiveis: rows.length,
                      total,
                    })}
                  </div>
                  <div className="flex flex-wrap items-center gap-4 sm:gap-6">
                    <label className="flex items-center gap-2 text-xs gerente-fin-muted">
                      <span>{m.produtos.pag_linhas_por_pagina}</span>
                      <select
                        value={itensPorPagina}
                        onChange={(e) => {
                          setItensPorPagina(Number(e.target.value))
                          setPaginaAtual(1)
                        }}
                        className={`${finSelect} h-8 min-w-[4.5rem]`}
                      >
                        {[10, 25, 50].map((n) => (
                          <option key={n} value={n}>
                            {n}
                          </option>
                        ))}
                      </select>
                    </label>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={paginaSegura <= 1 || loadingList}
                        onClick={() => setPaginaAtual((x) => Math.max(1, x - 1))}
                        className="rounded-full p-2 opacity-90 transition hover:opacity-100 disabled:cursor-not-allowed disabled:opacity-30"
                        aria-label={m.produtos.pag_prev}
                      >
                        <ChevronLeft size={20} className="shrink-0" />
                      </button>
                      <span className="text-xs font-medium tabular-nums">
                        {interpolateTemplate(m.produtos.pag_info, { atual: paginaSegura, total: totalPaginas })}
                      </span>
                      <button
                        type="button"
                        disabled={paginaSegura >= totalPaginas || loadingList}
                        onClick={() => setPaginaAtual((x) => Math.min(totalPaginas, x + 1))}
                        className="rounded-full p-2 opacity-90 transition hover:opacity-100 disabled:cursor-not-allowed disabled:opacity-30"
                        aria-label={m.produtos.pag_next}
                      >
                        <ChevronRight size={20} className="shrink-0" />
                      </button>
                    </div>
                  </div>
                </div>
              ) : null
            }
          >
            {loadingList && rows.length === 0 ? (
>>>>>>> origin/main
              <tr>
                <td colSpan={colSpanVazio} className="gerente-fin-empty px-3 py-4 text-xs">
                  {m.produtos.filtro_carregando}
                </td>
              </tr>
            ) : total === 0 ? (
              <tr>
                <td colSpan={colSpanVazio} className="gerente-fin-empty px-3 py-4 text-xs">
                  {!tinhaProdutosAoCarregar.current
                    ? m.produtos.nenhum_produto_cadastrado
                    : m.produtos.nenhum_resultado_filtro}
                </td>
              </tr>
            ) : (
              rows.map((p) => (
                <tr key={p.id} className="group gerente-fin-row-hover transition-colors">
                  <td className="gerente-fin-cell px-2 py-2 text-center align-middle">
                    <input
                      type="checkbox"
                      className="h-3.5 w-3.5 rounded app-border app-surface-soft"
                      checked={selectedIds.has(p.id)}
                      onChange={(e) => {
                        e.stopPropagation()
                        setSelectedIds((prev) => {
                          const next = new Set(prev)
                          if (e.target.checked) next.add(p.id)
                          else next.delete(p.id)
                          return next
                        })
                      }}
                      aria-label={m.produtos.coluna_selecionar}
                    />
                  </td>
                  <td className="gerente-fin-cell px-3 py-2 font-mono text-[11px] opacity-80">
                    <span title={p.id}>{p.id.length <= 6 ? p.id : p.id.slice(-6)}</span>
                  </td>
                  <td className="gerente-fin-cell px-1 py-1 align-middle">
                    <ProdutoImagemCell
                      produtoId={p.id}
                      nome={p.nome}
                      imagemUrl={p.imagem_url}
                      disabled={toggleLoading}
                      m={m}
                      onDone={refetch}
                    />
                  </td>
                  <td className="gerente-fin-cell px-3 py-2 font-medium leading-relaxed">{p.nome}</td>
                  <td className="gerente-fin-cell px-3 py-2 font-mono">{p.codigo_barras ?? '-'}</td>
                  <td className="gerente-fin-cell px-1 py-1 text-right">
                    <PrecoVarejoCell
                      produtoId={p.id}
                      precoVarejo={Number(p.preco_varejo)}
                      onSaved={refetch}
                      msgInvalido={m.produtos.preco_invalido}
                      msgMaiorZero={m.produtos.preco_maior_zero}
                      atualizadoMessage={m.produtos.preco_atualizado}
                    />
                  </td>
                  <td className="gerente-fin-cell px-3 py-2">
                    {p.origem === 'china_manual' ? (
                      <OrigemBadgeUi
                        label={m.produtos.origem_china}
                        tooltip={m.produtos.tooltip_origem_china_manual}
                        className="border-amber-500/50 bg-amber-500/15 text-amber-100"
                      />
                    ) : p.origem === 'brasil_sem_nf' ? (
                      <OrigemBadgeUi
                        label={m.produtos.origem_brasil_sem_nf}
                        tooltip={m.produtos.tooltip_origem_brasil_sem_nf}
                        className="border-slate-500/50 bg-slate-500/20 text-slate-100"
                      />
                    ) : (
                      <OrigemBadgeUi
                        label={m.produtos.origem_brasil_nf}
                        tooltip={m.produtos.tooltip_origem_brasil_nf}
                        className="border-success/45 bg-success/15 text-success"
                      />
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <GerenteStatusBadge status={p.tem_nf ? 'TEM_NF' : 'SEM_NF'} label={p.tem_nf ? m.comum.sim : m.comum.nao} />
                  </td>
                  <td className="px-3 py-2">
                    <GerenteStatusBadge
                      status={p.ativo ? 'ATIVO' : 'INATIVO'}
                      label={p.ativo ? m.produtos.ativo : m.produtos.inativo}
                    />
                  </td>
                  <td className="px-3 py-2 text-center">
                    <div className="flex flex-col items-stretch gap-1.5">
                      <button
                        type="button"
                        disabled={toggleLoading}
                        onClick={() => abrirEditar(p)}
                        className="inline-flex items-center justify-center gap-1 rounded-md border px-2 py-1 text-[11px] font-medium opacity-90 transition group-hover:opacity-100 disabled:opacity-40 app-border app-surface-soft focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-amber-500/50"
                      >
                        <Pencil className="h-3 w-3 shrink-0" aria-hidden />
                        {m.produtos.editar_catalogo}
                      </button>
                      <button
                        type="button"
                        disabled={toggleLoading}
                        onClick={() => void toggle({ id: p.id, ativo: !p.ativo })}
                        className="gerente-chip-action rounded-md border px-2 py-1 text-[11px] font-medium opacity-90 transition group-hover:opacity-100 disabled:opacity-40"
                      >
                        {p.ativo ? m.produtos.inativar : m.produtos.ativar}
                      </button>
                      <button
                        type="button"
                        disabled={toggleLoading}
                        onClick={() => abrirExclusaoIndividual(p.id)}
                        title={m.produtos.exclusao_linha_title}
                        aria-label={m.produtos.exclusao_linha_aria}
                        className="inline-flex items-center justify-center gap-1 rounded-md border border-destructive/35 px-2 py-1 text-[11px] font-medium text-destructive opacity-90 transition hover:bg-destructive/10 group-hover:opacity-100 disabled:opacity-40"
                      >
                        <Trash2 className="h-3 w-3 shrink-0" aria-hidden />
                        <span className="hidden min-[380px]:inline">{m.produtos.exclusao_linha_botao}</span>
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </TabelaCadastroPadrao>
        </div>
<<<<<<< HEAD

        {rows.length > 0 ? (
          <div className="gerente-fin-divider flex flex-col gap-3 border-t px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="gerente-fin-muted text-xs">
              {interpolate(m.produtos.pag_mostrar, {
                visiveis: produtosExibidos.length,
                total: produtosFiltrados.length,
              })}
            </div>
            <div className="flex flex-wrap items-center gap-4 sm:gap-6">
              <label className="flex items-center gap-2 text-xs gerente-fin-muted">
                <span>{m.produtos.pag_linhas_por_pagina}</span>
                <select
                  value={itensPorPagina}
                  onChange={(e) => {
                    setItensPorPagina(Number(e.target.value))
                    setPaginaAtual(1)
                  }}
                  className={`${finSelect} h-8 min-w-[4.5rem]`}
                >
                  {[10, 25, 50].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={paginaSegura <= 1}
                  onClick={() => setPaginaAtual((x) => Math.max(1, x - 1))}
                  className="rounded-full p-2 opacity-90 transition hover:opacity-100 disabled:cursor-not-allowed disabled:opacity-30"
                  aria-label={m.produtos.pag_prev}
                >
                  <ChevronLeft size={20} className="shrink-0" />
                </button>
                <span className="text-xs font-medium tabular-nums">
                  {interpolate(m.produtos.pag_info, { atual: paginaSegura, total: totalPaginas })}
                </span>
                <button
                  type="button"
                  disabled={paginaSegura >= totalPaginas}
                  onClick={() => setPaginaAtual((x) => Math.min(totalPaginas, x + 1))}
                  className="rounded-full p-2 opacity-90 transition hover:opacity-100 disabled:cursor-not-allowed disabled:opacity-30"
                  aria-label={m.produtos.pag_next}
                >
                  <ChevronRight size={20} className="shrink-0" />
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </section>
        </div>
      </div>
    </div>
=======
      </div>
      <ProdutosListaImpressao rows={linhasImpressao.length > 0 ? linhasImpressao : rows} m={m} idioma={idioma} />
    </>
>>>>>>> origin/main
  )
}
