'use client'

import { useRouter } from 'next/navigation'
import {
  ChevronLeft,
  ChevronRight,
  FileDown,
  Filter,
  FolderInput,
  BadgeCheck,
  Pencil,
  Plus,
  Printer,
  Search,
  ToggleLeft,
  ToggleRight,
  Trash2,
  UploadCloud,
} from 'lucide-react'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'

const ITEMS_POR_PAGINA_PADRAO = 20
import type { GerenteTableColumn } from '@/components/gerente/GerenteTable'
import { TabelaCadastroPadrao } from '@/components/gerente/cadastro'
import { GerenteFilterBar } from '@/components/gerente/GerenteFilterBar'
import { GerenteStickyToolbar } from '@/components/gerente/GerenteStickyToolbar'
import { ProdutosEditarCatalogoModal } from '@/components/gerente/produtos/ProdutosEditarCatalogoModal'
import { ProdutosExcluirLoteModal } from '@/components/gerente/produtos/ProdutosExcluirLoteModal'
import { ProdutosImportarModal } from '@/components/gerente/produtos/ProdutosImportarModal'
import { NovoProdutoModal } from '@/components/gerente/produtos/NovoProdutoModal'
import { ProdutoImagemCell } from '@/components/gerente/produtos/ProdutoImagemCell'
import { ProdutosListaImpressao } from '@/components/gerente/produtos/ProdutosListaImpressao'
import { GerenteStatusBadge } from '@/components/gerente/GerenteStatusBadge'
import { downloadCsvBrowser, interpolateTemplate } from '@/lib/gerente/gerenteCadastroUi'
import { useGerenteMutation } from '@/lib/hooks/useGerenteMutation'
import { emitGerenteToast } from '@/lib/gerente/toast'
import { cn } from '@/lib/utils'
import { formatDecimalBRL } from '@/lib/format/money'
import { useMoneyInput } from '@/hooks/useMoneyInput'
import type { Idioma } from '@/idioma/normalizeIdioma'
import { getMessages } from '@/i18n/getMessages'
import type { BuscarProdutosComFiltrosInput, OpcoesFiltrosProdutos } from './actions'
import {
  alterarAtivoLoteProdutos,
  alterarCategoriaLoteProdutos,
  alternarAtivoProduto,
  atualizarPrecoVarejoProduto,
  buscarProdutosComFiltros,
  buscarProdutosParaExportacao,
  publicarProduto,
  publicarProdutosLote,
} from './actions'
import type { ProdutoGerenteRow } from './produtoGerenteTypes'
import { STATUS_PUBLICACAO_BADGE } from './statusPublicacaoBadge'
import { podePublicarProduto } from '@/core/catalog/statusPublicacao'
import { parseTagsFiltroTexto } from './produtoGerenteFiltrosUtils'

export type { ProdutoGerenteRow } from './produtoGerenteTypes'

type FiltrosUi = {
  situacao: 'todos' | 'ativos' | 'inativos'
  origem: 'all' | 'china_manual' | 'brasil_nf'
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
    nf: 'all',
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
  ariaLabel,
}: Readonly<{
  produtoId: string
  precoVarejo: number
  onSaved: () => void
  msgInvalido: string
  msgMaiorZero: string
  atualizadoMessage: string
  ariaLabel: string
}>) {
  const moneyInput = useMoneyInput(precoVarejo)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    moneyInput.reset(precoVarejo)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [precoVarejo, produtoId])

  return (
    <input
      type="text"
      inputMode="decimal"
      disabled={saving}
      value={moneyInput.display}
      onChange={moneyInput.onChange}
      onBlur={async () => {
        const n = moneyInput.parse()
        if (n === null) {
          emitGerenteToast({ kind: 'error', message: msgInvalido })
          moneyInput.reset(precoVarejo)
          return
        }
        if (n <= 0) {
          emitGerenteToast({ kind: 'error', message: msgMaiorZero })
          moneyInput.reset(precoVarejo)
          return
        }
        if (Math.abs(n - precoVarejo) < 0.005) {
          moneyInput.reset(precoVarejo)
          return
        }
        setSaving(true)
        try {
          const r = await atualizarPrecoVarejoProduto({ produto_id: produtoId, preco_varejo: n })
          if (!r.success) {
            emitGerenteToast({ kind: 'error', message: r.error })
            moneyInput.reset(precoVarejo)
            return
          }
          emitGerenteToast({ kind: 'success', message: atualizadoMessage })
          onSaved()
        } finally {
          setSaving(false)
        }
      }}
      className="gerente-fin-cell w-full min-w-[6rem] rounded-md border border-transparent bg-transparent px-1.5 py-1 text-right text-xs font-semibold tabular-nums app-border hover:border-[color:var(--gerente-ring,theme(colors.slate.500))] focus:border-amber-500/80 focus:outline-none focus:ring-1 focus:ring-amber-500/50 disabled:opacity-50"
      aria-label={ariaLabel}
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
  const [itensPorPagina, setItensPorPagina] = useState(ITEMS_POR_PAGINA_PADRAO)
  const sentinelRef = useRef<HTMLDivElement>(null)
  const [loadingList, setLoadingList] = useState(false)
  const tinhaProdutosAoCarregar = useRef(inicial.total > 0)
  const [filtrosAvancadosAbertos, setFiltrosAvancadosAbertos] = useState(false)

  const [novoProdutoModalAberto, setNovoProdutoModalAberto] = useState(false)
  const [importModalAberto, setImportModalAberto] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())
  const [exclusaoModalAberto, setExclusaoModalAberto] = useState(false)
  const [idsExclusaoLote, setIdsExclusaoLote] = useState<readonly string[]>([])
  const [editarModalAberto, setEditarModalAberto] = useState(false)
  const [produtoEditar, setProdutoEditar] = useState<ProdutoGerenteRow | null>(null)
  const [linhasImpressao, setLinhasImpressao] = useState<ProdutoGerenteRow[]>([])
  const [categoriaLoteModalAberto, setCategoriaLoteModalAberto] = useState(false)
  const [categoriaLoteSelecionada, setCategoriaLoteSelecionada] = useState<string>('')

  const fetchList = useCallback(async (f: FiltrosUi, page: number, append = false) => {
    setLoadingList(true)
    try {
      const r = await buscarProdutosComFiltros(toBuscarInput(f, page, itensPorPagina))
      if (!r.success) {
        emitGerenteToast({ kind: 'error', message: r.error })
        return
      }
      setRows((prev) => append ? [...prev, ...r.data.rows] : r.data.rows)
      setTotal(r.data.total)
    } finally {
      setLoadingList(false)
    }
  }, [itensPorPagina])

  const scrollStateRef = useRef({ paginaAtual, totalPaginas: 1, loadingList: false, filtros, itensPorPagina })
  useEffect(() => {
    scrollStateRef.current = {
      paginaAtual,
      totalPaginas: Math.max(1, Math.ceil(total / itensPorPagina)),
      loadingList,
      filtros,
      itensPorPagina,
    }
  })

  useEffect(() => {
    const el = sentinelRef.current
    if (!el) return
    const obs = new IntersectionObserver(
      async (entries) => {
        if (!entries[0]?.isIntersecting) return
        const { paginaAtual: cur, totalPaginas, loadingList: busy, filtros: f } = scrollStateRef.current
        if (cur >= totalPaginas || busy) return
        const nextPage = cur + 1
        setPaginaAtual(nextPage)
        await fetchList(f, nextPage, true)
      },
      { rootMargin: '300px' },
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [fetchList])

  const primeiraMontagem = useRef(true)
  useEffect(() => {
    if (primeiraMontagem.current) {
      primeiraMontagem.current = false
      return
    }
    setPaginaAtual(1)
    const id = setTimeout(() => {
      void fetchList(filtros, 1, false)
    }, 320)
    return () => clearTimeout(id)
  }, [filtros, itensPorPagina, fetchList])

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
          { key: 'ativo', header: m.produtos.status },
        ],
        r.data.map((p) => ({
          id: p.id,
          nome: p.nome,
          codigo_barras: p.codigo_barras ?? '',
          preco_varejo: Number(p.preco_varejo),
          origem: p.origem,
          ativo: p.ativo ? '1' : '0',
        })),
      )
      return null
    },
    exportOpts,
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

  // Publica um rascunho individual (DRAFT → PUBLICADO). Fonte única: server action
  // `publicarProduto`; a UI apenas dispara o evento e revalida a lista.
  const { mutate: publicar, loading: publicarLoading } = useGerenteMutation(
    async (produtoId: string) => {
      const r = await publicarProduto(produtoId)
      if (!r.success) throw new Error(r.error)
      void fetchList(filtros, paginaAtual)
      router.refresh()
      return null
    },
    { successMessage: m.produtos.criado_publicado },
  )

  const { mutate: publicarLote, loading: publicarLoteLoading } = useGerenteMutation(
    async () => {
      const ids = Array.from(selectedIds)
      const r = await publicarProdutosLote(ids)
      if (!r.success) throw new Error(r.error)
      setSelectedIds(new Set())
      void fetchList(filtros, paginaAtual)
      router.refresh()
      return r.data.publicados
    },
    {
      onSuccess: (publicados) => {
        emitGerenteToast({
          kind: 'success',
          message: interpolateTemplate(m.produtos.publicados_sucesso, { count: String(publicados) }),
        })
      },
    },
  )

  const { mutate: ativarLote, loading: ativarLoteLoading } = useGerenteMutation(
    async () => {
      const ids = Array.from(selectedIds)
      const r = await alterarAtivoLoteProdutos(ids, true)
      if (!r.success) throw new Error(r.error)
      setSelectedIds(new Set())
      void fetchList(filtros, paginaAtual)
      router.refresh()
      return null
    },
    { successMessage: m.comum.sucesso },
  )

  const { mutate: inativarLote, loading: inativarLoteLoading } = useGerenteMutation(
    async () => {
      const ids = Array.from(selectedIds)
      const r = await alterarAtivoLoteProdutos(ids, false)
      if (!r.success) throw new Error(r.error)
      setSelectedIds(new Set())
      void fetchList(filtros, paginaAtual)
      router.refresh()
      return null
    },
    { successMessage: m.comum.sucesso },
  )

  const { mutate: categoriaLote, loading: categoriaLoteLoading } = useGerenteMutation(
    async (categoriaId: string | null) => {
      const ids = Array.from(selectedIds)
      const r = await alterarCategoriaLoteProdutos(ids, categoriaId)
      if (!r.success) throw new Error(r.error)
      setSelectedIds(new Set())
      setCategoriaLoteModalAberto(false)
      void fetchList(filtros, paginaAtual)
      router.refresh()
      return null
    },
    { successMessage: m.comum.sucesso },
  )

  const patchFiltro = useCallback(<K extends keyof FiltrosUi>(k: K, v: FiltrosUi[K], resetPage = true) => {
    setFiltros((prev) => ({ ...prev, [k]: v }))
    if (resetPage) setPaginaAtual(1)
  }, [])

  const onLimpar = useCallback(() => {
    setFiltros(FILTROS_UI_INITIAL)
    setPaginaAtual(1)
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

  /** Conta quantos filtros avançados estão ativos (excluindo situação e origem, que ficam nos chips) */
  const filtrosAtivos = useMemo(() => {
    let n = 0
    if (filtros.estoque !== 'todos') n++
    if (filtros.imagens !== 'todos') n++
    if (filtros.categoriaId !== '') n++
    if (filtros.marcaId !== '') n++
    if (filtros.fornecedorId !== '') n++
    if (filtros.tagsTexto !== '') n++
    return n
  }, [filtros])

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
    { key: 'foto', header: m.produtos.foto_coluna, width: '3.75rem' },
    { key: 'nome', header: m.produtos.nome },
    { key: 'loc', header: 'Local', width: '5.5rem' },
    { key: 'preco', header: m.produtos.preco_varejo, width: '7rem' },
    { key: 'atacado', header: 'Atacado', width: '6rem' },
    { key: 'estoque', header: 'Estoque', width: '5rem' },
    { key: 'origem', header: m.produtos.origem_label, width: '7rem' },
    { key: 'st', header: m.produtos.status, width: '5rem' },
    { key: 'ac', header: m.produtos.acoes, width: '5.5rem' },
  ]

  const colSpanVazio = colunasProdutos.length

  /* ─── chip helpers ─────────────────────────────────────────── */
  const chipBase = 'inline-flex h-7 items-center rounded-full border px-3 text-xs font-medium transition-colors'
  const chipInativo = 'border-white/[.1] app-muted hover:border-white/[.2] hover:text-jl-fg-1'
  const chipAtivo = 'border-amber-500/40 bg-amber-500/15 text-amber-300'
  const iconBtnBase =
    'inline-flex h-8 w-8 items-center justify-center rounded-lg border border-white/[.1] app-muted transition-colors hover:border-white/[.2] hover:text-jl-fg-1 disabled:cursor-not-allowed disabled:opacity-40'

  return (
    <>
      <div className={`print:hidden mx-auto w-full max-w-7xl space-y-4 px-4 py-6 md:px-6 ${fontClass}`}>
        <GerenteFilterBar title={m.produtos.titulo} />

        {/* ─── TOOLBAR STICKY ─────────────────────────────────────── */}
        <GerenteStickyToolbar className="mb-0">
          <div className="flex flex-col gap-2 py-1.5">

            {/* Linha 1: busca + chips + ações secundárias */}
            <div className="flex flex-wrap items-center gap-2">

              {/* Campo de busca */}
              <div className="relative h-9 min-w-[180px] max-w-xs flex-1">
                <Search
                  className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 opacity-50"
                  aria-hidden
                />
                <input
                  value={filtros.busca}
                  onChange={(e) => patchFiltro('busca', e.target.value, false)}
                  placeholder={m.produtos.buscar}
                  className="h-9 w-full rounded-lg pl-8 pr-3 text-sm app-input !bg-white/[.08] !border-white/[.18]"
                />
              </div>

              {/* Chips situação */}
              {(['todos', 'ativos', 'inativos'] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => patchFiltro('situacao', s)}
                  className={cn(chipBase, filtros.situacao === s ? chipAtivo : chipInativo)}
                >
                  {s === 'todos'
                    ? m.produtos.filtro_situacao_todos
                    : s === 'ativos'
                      ? m.produtos.filtro_situacao_somente_ativos
                      : m.produtos.filtro_situacao_somente_inativos}
                </button>
              ))}

              {/* Chips origem */}
              {(['all', 'china_manual', 'brasil_nf'] as const).map((o) => (
                <button
                  key={o}
                  type="button"
                  onClick={() => patchFiltro('origem', o)}
                  className={cn(chipBase, filtros.origem === o ? chipAtivo : chipInativo)}
                >
                  {o === 'all'
                    ? m.produtos.filtro_todas_origens
                    : o === 'china_manual'
                      ? m.produtos.origem_china
                      : m.produtos.origem_brasil_nf}
                </button>
              ))}

              {/* Botão filtros avançados */}
              <button
                type="button"
                onClick={() => setFiltrosAvancadosAbertos((prev) => !prev)}
                className={cn(
                  chipBase,
                  filtrosAtivos > 0 || filtrosAvancadosAbertos ? chipAtivo : chipInativo,
                )}
              >
                <Filter className="mr-1 h-3 w-3" aria-hidden />
                {m.produtos.filtros_lateral_titulo}
                {filtrosAtivos > 0 && (
                  <span className="ml-1.5 inline-flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-amber-500/30 px-1 text-[10px] font-bold text-amber-200">
                    {filtrosAtivos}
                  </span>
                )}
              </button>

              {/* Ações secundárias */}
              <div className="ml-auto flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setNovoProdutoModalAberto(true)}
                  title={m.produtos.cadastro_produto}
                  aria-label={m.produtos.cadastro_produto}
                  className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-amber-500/40 bg-amber-500/15 px-3 text-xs font-semibold text-amber-300 transition-colors hover:border-amber-500/60 hover:bg-amber-500/25"
                >
                  <Plus className="h-3.5 w-3.5" aria-hidden />
                  {m.produtos.cadastro_produto}
                </button>
                <button
                  type="button"
                  onClick={() => setImportModalAberto(true)}
                  title={m.produtos.toolbar_importar}
                  aria-label={m.produtos.toolbar_importar_aria}
                  className={iconBtnBase}
                >
                  <UploadCloud className="h-4 w-4" aria-hidden />
                </button>
                <button
                  type="button"
                  disabled={expLoading || total === 0}
                  onClick={() => void exportCsv(null)}
                  title={m.produtos.toolbar_exportar}
                  aria-label={m.produtos.toolbar_exportar_aria}
                  className={iconBtnBase}
                >
                  <FileDown className="h-4 w-4" aria-hidden />
                </button>
                <button
                  type="button"
                  disabled={total === 0}
                  onClick={() => void imprimirLista()}
                  title={m.produtos.toolbar_imprimir}
                  aria-label={m.produtos.toolbar_imprimir_aria}
                  className={iconBtnBase}
                >
                  <Printer className="h-4 w-4" aria-hidden />
                </button>
              </div>
            </div>

            {/* Linha 2: filtros avançados (colapsável) */}
            {filtrosAvancadosAbertos && (
              <div className="flex flex-wrap items-end gap-2 border-t border-white/[.08] pt-2">
                <label className="flex min-w-[130px] flex-col gap-1">
                  <span className="text-[11px] font-semibold uppercase tracking-wide app-muted">
                    {m.produtos.categoria}
                  </span>
                  <select
                    value={filtros.categoriaId}
                    onChange={(e) => patchFiltro('categoriaId', e.target.value)}
                    className="h-8 rounded-md px-2 text-xs app-select !bg-white/[.08] !border-white/[.18]"
                  >
                    {opCategorias.map((c) => (
                      <option key={c.value} value={c.value}>{c.label}</option>
                    ))}
                  </select>
                </label>
                <label className="flex min-w-[130px] flex-col gap-1">
                  <span className="text-[11px] font-semibold uppercase tracking-wide app-muted">
                    {m.produtos.filtro_marca_label}
                  </span>
                  <select
                    value={filtros.marcaId}
                    onChange={(e) => patchFiltro('marcaId', e.target.value)}
                    className="h-8 rounded-md px-2 text-xs app-select !bg-white/[.08] !border-white/[.18]"
                  >
                    {opMarcas.map((c) => (
                      <option key={c.value} value={c.value}>{c.label}</option>
                    ))}
                  </select>
                </label>
                <label className="flex min-w-[130px] flex-col gap-1">
                  <span className="text-[11px] font-semibold uppercase tracking-wide app-muted">
                    {m.produtos.filtro_fornecedor_label}
                  </span>
                  <select
                    value={filtros.fornecedorId}
                    onChange={(e) => patchFiltro('fornecedorId', e.target.value)}
                    className="h-8 rounded-md px-2 text-xs app-select !bg-white/[.08] !border-white/[.18]"
                  >
                    {opFornecedores.map((c) => (
                      <option key={c.value} value={c.value}>{c.label}</option>
                    ))}
                  </select>
                </label>
                <label className="flex min-w-[130px] flex-col gap-1">
                  <span className="text-[11px] font-semibold uppercase tracking-wide app-muted">
                    {m.produtos.filtro_estoque_label}
                  </span>
                  <select
                    value={filtros.estoque}
                    onChange={(e) => patchFiltro('estoque', e.target.value as FiltrosUi['estoque'])}
                    className="h-8 rounded-md px-2 text-xs app-select !bg-white/[.08] !border-white/[.18]"
                  >
                    <option value="todos">{m.produtos.filtro_estoque_todos}</option>
                    <option value="abaixo_minimo">{m.produtos.filtro_estoque_abaixo_minimo}</option>
                    <option value="em_falta">{m.produtos.filtro_estoque_em_falta}</option>
                  </select>
                </label>
                <label className="flex min-w-[130px] flex-col gap-1">
                  <span className="text-[11px] font-semibold uppercase tracking-wide app-muted">
                    {m.produtos.filtro_imagens_label}
                  </span>
                  <select
                    value={filtros.imagens}
                    onChange={(e) => patchFiltro('imagens', e.target.value as FiltrosUi['imagens'])}
                    className="h-8 rounded-md px-2 text-xs app-select !bg-white/[.08] !border-white/[.18]"
                  >
                    <option value="todos">{m.produtos.filtro_imagens_todos}</option>
                    <option value="com_imagem">{m.produtos.filtro_imagens_com}</option>
                    <option value="sem_imagem">{m.produtos.filtro_imagens_sem}</option>
                  </select>
                </label>
                <label className="flex min-w-[160px] flex-1 flex-col gap-1">
                  <span className="text-[11px] font-semibold uppercase tracking-wide app-muted">
                    {m.produtos.filtro_tags_label}
                  </span>
                  <input
                    type="search"
                    value={filtros.tagsTexto}
                    onChange={(e) => patchFiltro('tagsTexto', e.target.value, false)}
                    placeholder={m.produtos.filtro_tags_placeholder}
                    className="h-8 rounded-md px-2 text-xs app-input !bg-white/[.08] !border-white/[.18]"
                  />
                </label>
                {filtrosAtivos > 0 && (
                  <button
                    type="button"
                    onClick={onLimpar}
                    className="h-8 rounded-md px-3 text-xs font-medium app-muted hover:text-jl-fg-1 transition-colors"
                  >
                    {m.comum.limpar_filtros}
                  </button>
                )}
              </div>
            )}

            {/* Linha 3: ações em lote (visível somente com seleção) */}
            {selectedIds.size > 0 && (
              <div className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-500/25 bg-amber-500/[.07] px-3 py-1.5">
                <span className="text-xs font-semibold text-amber-400">
                  {selectedIds.size}{' '}
                  {selectedIds.size === 1 ? 'produto selecionado' : 'produtos selecionados'}
                </span>
                <button
                  type="button"
                  disabled={publicarLoteLoading}
                  onClick={() => void publicarLote(null)}
                  className="inline-flex h-7 items-center gap-1 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2.5 text-xs font-medium text-emerald-400 transition-colors hover:bg-emerald-500/20 disabled:opacity-50"
                >
                  <BadgeCheck className="h-3.5 w-3.5" aria-hidden />
                  {publicarLoteLoading ? '…' : m.produtos.publicar_lote}
                </button>
                <button
                  type="button"
                  disabled={ativarLoteLoading}
                  onClick={() => void ativarLote(null)}
                  className="inline-flex h-7 items-center gap-1 rounded-md border border-green-500/30 bg-green-500/10 px-2.5 text-xs font-medium text-green-400 transition-colors hover:bg-green-500/20 disabled:opacity-50"
                >
                  <ToggleRight className="h-3.5 w-3.5" aria-hidden />
                  {ativarLoteLoading ? '…' : 'Ativar'}
                </button>
                <button
                  type="button"
                  disabled={inativarLoteLoading}
                  onClick={() => void inativarLote(null)}
                  className="inline-flex h-7 items-center gap-1 rounded-md border border-amber-500/30 bg-amber-500/10 px-2.5 text-xs font-medium text-amber-400 transition-colors hover:bg-amber-500/20 disabled:opacity-50"
                >
                  <ToggleLeft className="h-3.5 w-3.5" aria-hidden />
                  {inativarLoteLoading ? '…' : 'Inativar'}
                </button>
                <button
                  type="button"
                  disabled={categoriaLoteLoading}
                  onClick={() => setCategoriaLoteModalAberto(true)}
                  className="inline-flex h-7 items-center gap-1 rounded-md border border-blue-500/30 bg-blue-500/10 px-2.5 text-xs font-medium text-blue-400 transition-colors hover:bg-blue-500/20 disabled:opacity-50"
                >
                  <FolderInput className="h-3.5 w-3.5" aria-hidden />
                  {categoriaLoteLoading ? '…' : 'Categoria'}
                </button>
                <button
                  type="button"
                  disabled={selectedIds.size === 0 || selectedIds.size > 100}
                  onClick={abrirExclusaoLote}
                  className="inline-flex h-7 items-center gap-1 rounded-md border border-destructive/30 bg-destructive/10 px-2.5 text-xs font-medium text-destructive/80 transition-colors hover:bg-destructive/20 disabled:opacity-50"
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden />
                  {m.produtos.toolbar_excluir}
                </button>
              </div>
            )}

            {/* Linha 4: seletor de categoria em lote (inline) */}
            {categoriaLoteModalAberto && (
              <div className="flex flex-wrap items-center gap-2 rounded-lg border border-blue-500/25 bg-blue-500/[.06] px-3 py-2">
                <span className="text-xs text-jl-fg-2">
                  {interpolateTemplate(m.produtos.categoria_lote_label, { n: selectedIds.size })}
                </span>
                <select
                  className="h-8 rounded-md px-2 text-xs app-select !bg-white/[.08] !border-white/[.18]"
                  value={categoriaLoteSelecionada}
                  onChange={(e) => setCategoriaLoteSelecionada(e.target.value)}
                >
                  <option value="">{m.produtos.categoria_lote_sem}</option>
                  {opcoes.categorias.map((c) => (
                    <option key={c.id} value={c.id}>{c.nome}</option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => void categoriaLote(categoriaLoteSelecionada || null)}
                  disabled={categoriaLoteLoading}
                  className="inline-flex h-8 items-center rounded-md px-3 text-xs font-semibold app-btn-accent disabled:opacity-60"
                >
                  {categoriaLoteLoading ? '…' : 'Aplicar'}
                </button>
                <button
                  type="button"
                  onClick={() => setCategoriaLoteModalAberto(false)}
                  className="h-8 rounded-md px-3 text-xs app-muted hover:text-jl-fg-1"
                >
                  Cancelar
                </button>
              </div>
            )}
          </div>
        </GerenteStickyToolbar>

        {/* Modais */}
        <NovoProdutoModal
          open={novoProdutoModalAberto}
          onOpenChange={setNovoProdutoModalAberto}
          m={m}
          opcoes={opcoes}
          onCriado={() => {
            void fetchList(filtros, paginaAtual)
            router.refresh()
          }}
        />
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
          opcoes={opcoes}
          onSalvo={refetch}
        />
        <ProdutosImportarModal
          open={importModalAberto}
          onOpenChange={setImportModalAberto}
          m={m}
          onImportComplete={refetch}
        />

        {/* ─── TABELA DE PRODUTOS (largura total) ──────────────────── */}
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
                  {interpolateTemplate(m.produtos.pag_mostrar, { visiveis: rows.length, total })}
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
                      className="h-8 min-w-[4.5rem] rounded-md px-2 text-xs app-select !bg-white/[.08] !border-white/[.18]"
                    >
                      {[10, 25, 50].map((n) => (
                        <option key={n} value={n}>{n}</option>
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
                {/* ☐ Seleção */}
                <td className="gerente-fin-cell px-2 py-1 text-center align-middle">
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
                {/* Foto */}
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
                {/* Nome + SKU + Código de barras */}
                <td className="gerente-fin-cell px-3 py-1" title={p.id}>
                  <div className="flex flex-col gap-0.5">
                    <span className="font-medium leading-tight text-sm">{p.nome}</span>
                    <div className="flex flex-wrap gap-x-2 gap-y-0">
                      {p.codigo_interno ? (
                        <span className="font-mono text-[10px] text-amber-400/70">SKU {p.codigo_interno}</span>
                      ) : null}
                      {p.codigo_barras ? (
                        <span className="font-mono text-[10px] opacity-45">{p.codigo_barras}</span>
                      ) : null}
                    </div>
                  </div>
                </td>
                {/* Localização/Prateleira */}
                <td className="gerente-fin-cell px-2 py-1 align-middle">
                  {p.localizacao_prateleira ? (
                    <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-mono font-semibold bg-white/[.06] text-jl-fg-2">
                      {p.localizacao_prateleira}
                    </span>
                  ) : (
                    <span className="text-[10px] opacity-25">—</span>
                  )}
                </td>
                {/* Preço varejo (edição inline) */}
                <td className="gerente-fin-cell px-1 py-1 text-right">
                  <PrecoVarejoCell
                    produtoId={p.id}
                    precoVarejo={Number(p.preco_varejo)}
                    onSaved={refetch}
                    msgInvalido={m.produtos.preco_invalido}
                    msgMaiorZero={m.produtos.preco_maior_zero}
                    atualizadoMessage={m.produtos.preco_atualizado}
                    ariaLabel={m.produtos.preco_varejo_aria}
                  />
                </td>
                {/* Preço Atacado */}
                <td className="gerente-fin-cell px-2 py-1 text-right align-middle">
                  {p.preco_atacado != null ? (
                    <span className="text-xs tabular-nums text-emerald-400">
                      {formatDecimalBRL(p.preco_atacado)}
                    </span>
                  ) : (
                    <span className="text-[10px] opacity-25">—</span>
                  )}
                </td>
                {/* Estoque Atual */}
                <td className="gerente-fin-cell px-2 py-1 text-right align-middle">
                  {p.quantidade_atual != null ? (
                    <span
                      className={cn(
                        'text-xs tabular-nums font-semibold',
                        p.quantidade_atual < 0
                          ? 'text-red-400/80'
                          : p.quantidade_atual === 0
                            ? 'text-amber-400/70'
                            : 'text-jl-fg-2',
                      )}
                    >
                      {p.quantidade_atual}
                    </span>
                  ) : (
                    <span className="text-[10px] opacity-25">—</span>
                  )}
                </td>
                {/* Origem */}
                <td className="gerente-fin-cell px-2 py-1">
                  {p.origem === 'china_manual' ? (
                    <OrigemBadgeUi
                      label={m.produtos.origem_china}
                      tooltip={m.produtos.tooltip_origem_china_manual}
                      className="border-amber-500/50 bg-amber-500/15 text-amber-100"
                    />
                  ) : (
                    <OrigemBadgeUi
                      label={m.produtos.origem_brasil_nf}
                      tooltip={m.produtos.tooltip_origem_brasil}
                      className="border-success/45 bg-success/15 text-success"
                    />
                  )}
                </td>
                {/* Status — dirigido por status_publicacao (DRAFT visível como Rascunho,
                     não mais colapsado em "Inativo"). Fonte da vendabilidade: productEngine. */}
                <td className="px-2 py-1">
                  <GerenteStatusBadge
                    status={STATUS_PUBLICACAO_BADGE[p.status_publicacao].key}
                    label={m.produtos[STATUS_PUBLICACAO_BADGE[p.status_publicacao].labelKey]}
                  />
                </td>
                {/* Ações compactas — ícones em linha (Publicar só para rascunho;
                     decisão vem do core via podePublicarProduto — guard:core). */}
                <td className="px-1 py-1 text-center">
                  <div className="flex items-center justify-center gap-0.5">
                    {podePublicarProduto(p.status_publicacao) && (
                      <button
                        type="button"
                        disabled={publicarLoading}
                        onClick={() => void publicar(p.id)}
                        title={m.produtos.publicar}
                        aria-label={m.produtos.publicar}
                        className="inline-flex h-7 w-7 items-center justify-center rounded-md text-emerald-400/70 transition-colors hover:bg-emerald-500/10 hover:text-emerald-400 disabled:opacity-40"
                      >
                        <BadgeCheck className="h-3.5 w-3.5" aria-hidden />
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={toggleLoading}
                      onClick={() => abrirEditar(p)}
                      title={m.produtos.editar_catalogo}
                      aria-label={m.produtos.editar_catalogo}
                      className="inline-flex h-7 w-7 items-center justify-center rounded-md transition-colors app-muted hover:bg-white/[.08] hover:text-jl-fg-1 disabled:opacity-40"
                    >
                      <Pencil className="h-3.5 w-3.5" aria-hidden />
                    </button>
                    <button
                      type="button"
                      disabled={toggleLoading}
                      onClick={() => void toggle({ id: p.id, ativo: !p.ativo })}
                      title={p.ativo ? m.produtos.inativar : m.produtos.ativar}
                      aria-label={p.ativo ? m.produtos.inativar : m.produtos.ativar}
                      className={cn(
                        'inline-flex h-7 w-7 items-center justify-center rounded-md transition-colors disabled:opacity-40',
                        p.ativo
                          ? 'text-green-400/60 hover:bg-green-500/10 hover:text-green-400'
                          : 'app-muted hover:bg-amber-500/10 hover:text-amber-400',
                      )}
                    >
                      {p.ativo ? (
                        <ToggleRight className="h-4 w-4" aria-hidden />
                      ) : (
                        <ToggleLeft className="h-4 w-4" aria-hidden />
                      )}
                    </button>
                    <button
                      type="button"
                      disabled={toggleLoading}
                      onClick={() => abrirExclusaoIndividual(p.id)}
                      title={m.produtos.exclusao_linha_title}
                      aria-label={m.produtos.exclusao_linha_aria}
                      className="inline-flex h-7 w-7 items-center justify-center rounded-md text-destructive/40 transition-colors hover:bg-destructive/10 hover:text-destructive/80 disabled:opacity-40"
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden />
                    </button>
                  </div>
                </td>
              </tr>
            ))
          )}
        </TabelaCadastroPadrao>
      </div>

      {/* Sentinel para scroll infinito */}
      <div ref={sentinelRef} className="h-1" aria-hidden />

      <ProdutosListaImpressao
        rows={linhasImpressao.length > 0 ? linhasImpressao : rows}
        m={m}
        idioma={idioma}
      />
    </>
  )
}
