'use client'

import { useState, useEffect, type ReactNode } from 'react'
import { Download, Printer, Package, Layers } from 'lucide-react'
import { PageHeader, SectionCard } from '@/components/ui/admin-v2'
import { Button } from '@/components/ui/button'
import { Field, Input, Select } from '@/components/ui/forms'
import { useGerenteMutation } from '@/lib/hooks/useGerenteMutation'
import { EtiquetaCarrinho } from './EtiquetaCarrinho'
import { EtiquetaPreview } from './EtiquetaPreview'
import { ProdutoEtiquetaAutocomplete } from './ProdutoEtiquetaAutocomplete'
import {
  buscarProdutoPorCodigo,
  buscarEstoqueAtual,
  buscarProdutosPorCategoria,
} from './actions'
import { listarCategoriasProdutos } from '@/app/gerente/categorias-produtos/actions'
import type { CategoriaProdutoRow } from '@/app/gerente/categorias-produtos/categoriasProdutosTypes'
import { emitGerenteToast } from '@/lib/gerente/toast'
import { baixarPdfEtiquetas, imprimirPdfEtiquetas } from '@/lib/etiqueta/gerarPdf'
import {
  ETIQUETA_CONFIGS,
  ETIQUETA_PADRAO,
  getEtiquetaConfig,
  type EtiquetaConfig,
} from '@/lib/etiqueta/EtiquetaConfig'
import type { ItemCarrinho, ProdutoComEstoqueDTO } from '@/lib/etiqueta/types'
import type { Idioma } from '@/idioma/normalizeIdioma'
import {
  mesclarProdutosNoCarrinho,
  normalizarQuantidadeEtiqueta,
  type ProdutoParaEtiqueta,
} from './etiquetaCarrinhoMerge'

type Props = {
  idioma: Idioma
  initialCodigo?: string
  initialProdutoId?: string
  embeddedInAdminHub?: boolean
  /** Abas do hub admin, renderizadas logo abaixo do título. */
  hubNav?: ReactNode
}

type ModeloKey = keyof typeof ETIQUETA_CONFIGS

const LABELS = {
  pt: {
    titulo: 'Imprimir Etiquetas',
    subtitulo: 'Busque o produto, ajuste a quantidade e escolha o tamanho da etiqueta.',
    busca: 'Buscar produto',
    placeholder: 'Nome, código interno ou código de barras…',
    minimo: 'Digite ao menos 2 caracteres',
    semResultados: 'Nenhum produto encontrado',
    qtdImprimir: 'Qtd a imprimir',
    acoesRapidas: 'Ações rápidas',
    saldoTotal: 'Usar quantidades do estoque',
    saldoHint: 'Define a qtd de cada item pelo saldo atual',
    categoria: 'Adicionar por categoria',
    categoriaHint: 'Inclui todos os produtos ativos da categoria',
    carregandoCat: 'Carregando categorias…',
    semCategoria: 'Nenhuma categoria disponível',
    escolhaCat: 'Escolha a categoria',
    selecionar: '— Selecionar —',
    imprimir: 'Imprimir etiquetas',
    gerarPdf: 'Baixar PDF',
    modelos: 'Tamanho da etiqueta',
    modelo40: '40×25 mm',
    modelo40Hint: 'Prateleira / caixa',
    modelo60: '60×40 mm',
    modelo60Hint: 'Vitrine / destaque',
    preview: 'Pré-visualização',
    previewVazio: 'Selecione um produto do lote para ver a etiqueta',
    maximo: 'Máximo',
    etiquetas: 'etiquetas',
    limitePdf: 'Reduza a quantidade: o limite por PDF é',
    erroPdf: 'Erro ao gerar PDF',
    toastSemProduto: 'Nenhum produto encontrado nesta categoria',
    toastAdicionados: (n: number) => `${n} produto(s) adicionado(s)`,
    toastProdutoAdd: (nome: string, q: number) => `${nome} · ${q} etiqueta(s)`,
  },
  zh: {
    titulo: '打印标签',
    subtitulo: '搜索产品、设置数量并选择标签尺寸。',
    busca: '搜索产品',
    placeholder: '名称、内部编码或条形码…',
    minimo: '至少输入2个字符',
    semResultados: '未找到产品',
    qtdImprimir: '打印数量',
    acoesRapidas: '快速操作',
    saldoTotal: '使用库存数量',
    saldoHint: '按当前库存设置每个产品的数量',
    categoria: '按类别添加',
    categoriaHint: '添加该类别的所有有效产品',
    carregandoCat: '加载类别中…',
    semCategoria: '没有可用类别',
    escolhaCat: '选择类别',
    selecionar: '— 选择 —',
    imprimir: '打印标签',
    gerarPdf: '下载PDF',
    modelos: '标签尺寸',
    modelo40: '40×25 mm',
    modelo40Hint: '货架 / 箱标',
    modelo60: '60×40 mm',
    modelo60Hint: '陈列 / 强调',
    preview: '预览',
    previewVazio: '从批次中选择产品以预览标签',
    maximo: '最大数量',
    etiquetas: '标签',
    limitePdf: '请减少数量：每个PDF最多',
    erroPdf: '生成PDF时出错',
    toastSemProduto: '该类别没有产品',
    toastAdicionados: (n: number) => `已添加 ${n} 个产品`,
    toastProdutoAdd: (nome: string, q: number) => `${nome} · ${q} 张标签`,
  },
} as const

const MODELOS: { key: ModeloKey; labelKey: 'modelo40' | 'modelo60'; hintKey: 'modelo40Hint' | 'modelo60Hint' }[] = [
  { key: '40x25', labelKey: 'modelo40', hintKey: 'modelo40Hint' },
  { key: '60x40', labelKey: 'modelo60', hintKey: 'modelo60Hint' },
]

export function ImprimirEtiquetasPageClient({
  idioma,
  initialCodigo,
  initialProdutoId,
  embeddedInAdminHub = false,
  hubNav,
}: Props) {
  const t = LABELS[idioma]
  const [carrinho, setCarrinho] = useState<ItemCarrinho[]>([])
  const [qtdDesejada, setQtdDesejada] = useState(1)
  const [modelo, setModelo] = useState<ModeloKey>(ETIQUETA_PADRAO)
  const [previewId, setPreviewId] = useState<string | null>(null)
  const [gerandoPdf, setGerandoPdf] = useState(false)
  const [preloadDone, setPreloadDone] = useState(false)
  const [categorias, setCategorias] = useState<CategoriaProdutoRow[]>([])
  const [categoriasCarregadas, setCategoriasCarregadas] = useState(false)
  const [carregandoCategorias, setCarregandoCategorias] = useState(false)
  const [seletorCategoriaAberto, setSeletorCategoriaAberto] = useState(false)

  const config: EtiquetaConfig = getEtiquetaConfig(modelo)
  const totalEtiquetas = carrinho.reduce((sum, item) => sum + item.quantidade, 0)
  const acimaDoLimite = totalEtiquetas > config.maxEtiquetasPorPdf
  const itemPreview =
    carrinho.find((i) => i.produtoId === previewId) ?? carrinho[0] ?? null

  const { mutate: buscarEstoque, loading: buscandoEstoque } = useGerenteMutation(
    buscarEstoqueAtual,
  )
  const { mutate: buscarPorCategoria, loading: buscandoCategoria } = useGerenteMutation(
    buscarProdutosPorCategoria,
  )

  const adicionarAoCarrinho = (produto: ProdutoParaEtiqueta, quantidade: number) => {
    const qtd = normalizarQuantidadeEtiqueta(quantidade)
    setCarrinho((prev) => mesclarProdutosNoCarrinho(prev, [produto], qtd))
    setPreviewId(produto.id)
    emitGerenteToast({
      kind: 'success',
      message: t.toastProdutoAdd(produto.nome, qtd),
    })
  }

  const handleSelecionarProduto = (produto: ProdutoComEstoqueDTO) => {
    adicionarAoCarrinho(produto, qtdDesejada)
  }

  const handleToggleSeletorCategoria = async () => {
    const abrindo = !seletorCategoriaAberto
    setSeletorCategoriaAberto(abrindo)
    if (!abrindo || categoriasCarregadas || carregandoCategorias) return

    setCarregandoCategorias(true)
    try {
      const r = await listarCategoriasProdutos({ situacao: 'ativos', pageSize: 100 })
      if (r.success) {
        setCategorias(r.data.rows)
        setCategoriasCarregadas(true)
      } else {
        emitGerenteToast({ kind: 'error', message: r.error })
      }
    } finally {
      setCarregandoCategorias(false)
    }
  }

  const handleSelecionarCategoria = async (categoriaId: string) => {
    if (!categoriaId) return
    const resultado = await buscarPorCategoria(categoriaId)
    if (!resultado || !resultado.success) {
      if (resultado && !resultado.success) {
        emitGerenteToast({ kind: 'error', message: resultado.error })
      }
      return
    }

    if (resultado.data.length === 0) {
      emitGerenteToast({ kind: 'info', message: t.toastSemProduto })
      return
    }

    setCarrinho((prev) => mesclarProdutosNoCarrinho(prev, resultado.data, qtdDesejada))
    setPreviewId(resultado.data[0]?.id ?? null)
    setSeletorCategoriaAberto(false)
    emitGerenteToast({
      kind: 'success',
      message: t.toastAdicionados(resultado.data.length),
    })
  }

  useEffect(() => {
    if (preloadDone) return
    let cancelled = false

    async function preload() {
      if (initialCodigo?.trim()) {
        const r = await buscarProdutoPorCodigo(initialCodigo.trim())
        if (!cancelled && r.success && r.data) {
          setCarrinho((prev) => mesclarProdutosNoCarrinho(prev, [r.data], 1))
          setPreviewId(r.data.id)
        } else if (!cancelled && r && !r.success) {
          emitGerenteToast({ kind: 'error', message: r.error })
        }
      } else if (initialProdutoId?.trim()) {
        const r = await buscarEstoqueAtual([initialProdutoId.trim()])
        if (!cancelled && r.success && r.data?.[0]) {
          setCarrinho((prev) => mesclarProdutosNoCarrinho(prev, [r.data[0]], 1))
          setPreviewId(r.data[0].id)
        }
      }
      if (!cancelled) setPreloadDone(true)
    }

    void preload()
    return () => {
      cancelled = true
    }
  }, [initialCodigo, initialProdutoId, preloadDone])

  const handleAtualizarQuantidade = (produtoId: string, novaQuantidade: number) => {
    setCarrinho((prev) =>
      prev.map((item) =>
        item.produtoId === produtoId
          ? { ...item, quantidade: normalizarQuantidadeEtiqueta(novaQuantidade) }
          : item,
      ),
    )
  }

  const handleRemover = (produtoId: string) => {
    setCarrinho((prev) => prev.filter((item) => item.produtoId !== produtoId))
    setPreviewId((atual) => (atual === produtoId ? null : atual))
  }

  const handleLimpar = () => {
    setCarrinho([])
    setPreviewId(null)
  }

  const handleImprimirSaldoTotal = async () => {
    if (carrinho.length === 0) return

    const produtoIds = carrinho.map((item) => item.produtoId)
    const resultado = await buscarEstoque(produtoIds)

    if (resultado && resultado.success && resultado.data) {
      const estoqueAtual = resultado.data
      setCarrinho((prev) =>
        prev.map((item) => {
          const estoque = estoqueAtual.find((e) => e.id === item.produtoId)
          return {
            ...item,
            quantidade: estoque
              ? normalizarQuantidadeEtiqueta(Math.floor(estoque.quantidade_atual))
              : item.quantidade,
          }
        }),
      )
    } else if (resultado && !resultado.success) {
      emitGerenteToast({ kind: 'error', message: resultado.error })
    }
  }

  const handlePdf = async (acao: 'imprimir' | 'baixar') => {
    if (carrinho.length === 0 || acimaDoLimite) return

    setGerandoPdf(true)
    try {
      if (acao === 'imprimir') {
        await imprimirPdfEtiquetas(carrinho, { config })
      } else {
        await baixarPdfEtiquetas(carrinho, {
          config,
          nomeArquivo: `etiquetas-${modelo}-${Date.now()}.pdf`,
        })
      }
    } catch (e) {
      emitGerenteToast({
        kind: 'error',
        message:
          e instanceof Error && e.message ? `${t.erroPdf}: ${e.message}` : t.erroPdf,
      })
    } finally {
      setGerandoPdf(false)
    }
  }

  return (
    <div
      className={
        embeddedInAdminHub
          ? 'mx-auto max-w-[1100px] space-y-6'
          : 'admin-v2-page mx-auto max-w-[1100px]'
      }
    >
      <PageHeader title={t.titulo} subtitle={t.subtitulo} />
      {hubNav}

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-6">
          <SectionCard title={t.busca} className="h-auto">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <Field id="etiqueta-busca" label="" className="min-w-0 flex-1 [&>label]:sr-only">
                <ProdutoEtiquetaAutocomplete
                  placeholder={t.placeholder}
                  minimoLabel={t.minimo}
                  semResultadosLabel={t.semResultados}
                  onSelecionar={handleSelecionarProduto}
                />
              </Field>
              <Field id="etiqueta-qtd" label={t.qtdImprimir} className="w-28 shrink-0">
                <Input
                  type="number"
                  min={1}
                  max={config.maxEtiquetasPorPdf}
                  step={1}
                  value={qtdDesejada}
                  onChange={(e) => {
                    const v = Number(e.target.value)
                    if (Number.isInteger(v) && v >= 1) {
                      setQtdDesejada(
                        normalizarQuantidadeEtiqueta(
                          Math.min(v, config.maxEtiquetasPorPdf),
                        ),
                      )
                    }
                  }}
                />
              </Field>
            </div>
          </SectionCard>

          <EtiquetaCarrinho
            itens={carrinho}
            onAtualizarQuantidade={handleAtualizarQuantidade}
            onRemover={handleRemover}
            onLimpar={handleLimpar}
            onSelecionarPreview={setPreviewId}
            produtoPreviewId={itemPreview?.produtoId ?? null}
            idioma={idioma}
            maxPorPdf={config.maxEtiquetasPorPdf}
          />
        </div>

        <div className="space-y-6">
          <SectionCard title={t.modelos} className="h-auto">
            <div className="grid grid-cols-2 gap-2">
              {MODELOS.map((m) => {
                const ativo = modelo === m.key
                const cfg = ETIQUETA_CONFIGS[m.key]
                return (
                  <button
                    key={m.key}
                    type="button"
                    onClick={() => setModelo(m.key)}
                    aria-pressed={ativo}
                    className={`fp-focus-ring rounded-lg border px-3 py-3 text-left transition-colors ${
                      ativo
                        ? 'border-brand/35 bg-[var(--color-info-bg)]'
                        : 'border-[var(--color-border)] bg-[var(--color-surface)] hover:bg-[var(--color-surface-soft)]'
                    }`}
                  >
                    <span className="block text-body font-semibold">{t[m.labelKey]}</span>
                    <span className="block text-caption text-fg-muted">{t[m.hintKey]}</span>
                    <span className="mt-1 block text-caption text-fg-subtle">
                      {cfg.largura}×{cfg.altura} · max {cfg.maxEtiquetasPorPdf}
                    </span>
                  </button>
                )
              })}
            </div>
          </SectionCard>

          <SectionCard title={t.preview} className="h-auto">
            <EtiquetaPreview
              item={itemPreview}
              config={config}
              vazioLabel={t.previewVazio}
              modeloLabel={`${t[MODELOS.find((m) => m.key === modelo)?.labelKey ?? 'modelo40']} · ${config.largura}×${config.altura}mm`}
            />
          </SectionCard>

          <SectionCard className="h-auto">
            <Button
              type="button"
              variant="primary"
              className="w-full"
              onClick={() => void handlePdf('imprimir')}
              disabled={carrinho.length === 0 || gerandoPdf || acimaDoLimite}
              loading={gerandoPdf}
            >
              <Printer className="h-5 w-5" />
              <span className="font-medium">{t.imprimir}</span>
              {totalEtiquetas > 0 ? (
                <span className="rounded-full bg-[color-mix(in_srgb,var(--color-surface)_20%,transparent)] px-2 py-0.5 text-caption">
                  {totalEtiquetas}
                </span>
              ) : null}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="mt-2 w-full"
              onClick={() => void handlePdf('baixar')}
              disabled={carrinho.length === 0 || gerandoPdf || acimaDoLimite}
            >
              <Download className="h-4 w-4" />
              <span>{t.gerarPdf}</span>
            </Button>
            {acimaDoLimite ? (
              <p role="alert" className="mt-2 text-caption text-[var(--color-danger)]">
                {t.limitePdf} {config.maxEtiquetasPorPdf} {t.etiquetas}.
              </p>
            ) : (
              <p className="mt-2 text-caption text-fg-muted">
                {t.maximo}: {config.maxEtiquetasPorPdf} {t.etiquetas}
              </p>
            )}
          </SectionCard>

          <SectionCard title={t.acoesRapidas} className="h-auto">
            <div className="space-y-2">
              <Button
                type="button"
                variant="outline"
                className="h-auto w-full flex-col items-start gap-1 px-4 py-3 text-left"
                onClick={() => void handleImprimirSaldoTotal()}
                disabled={carrinho.length === 0 || buscandoEstoque}
                loading={buscandoEstoque}
              >
                <span className="flex items-center gap-2 text-body">
                  <Package className="h-4 w-4 text-brand" />
                  {t.saldoTotal}
                </span>
                <span className="text-caption text-fg-muted">{t.saldoHint}</span>
              </Button>

              <Button
                type="button"
                variant="outline"
                className="h-auto w-full flex-col items-start gap-1 px-4 py-3 text-left"
                onClick={() => void handleToggleSeletorCategoria()}
                disabled={buscandoCategoria}
                loading={buscandoCategoria}
                aria-expanded={seletorCategoriaAberto}
              >
                <span className="flex items-center gap-2 text-body">
                  <Layers className="h-4 w-4 text-brand" />
                  {t.categoria}
                </span>
                <span className="text-caption text-fg-muted">{t.categoriaHint}</span>
              </Button>

              {seletorCategoriaAberto ? (
                <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-soft)] p-3">
                  {carregandoCategorias ? (
                    <p className="text-caption text-fg-muted">{t.carregandoCat}</p>
                  ) : categorias.length === 0 ? (
                    <p className="text-caption text-fg-muted">{t.semCategoria}</p>
                  ) : (
                    <Field id="etiqueta-categoria" label={t.escolhaCat}>
                      <Select
                        defaultValue=""
                        disabled={buscandoCategoria}
                        onChange={(e) => {
                          void handleSelecionarCategoria(e.target.value)
                          e.target.value = ''
                        }}
                      >
                        <option value="" disabled>
                          {t.selecionar}
                        </option>
                        {categorias.map((categoria) => (
                          <option key={categoria.id} value={categoria.id}>
                            {categoria.nome}
                          </option>
                        ))}
                      </Select>
                    </Field>
                  )}
                </div>
              ) : null}
            </div>
          </SectionCard>
        </div>
      </div>
    </div>
  )
}
