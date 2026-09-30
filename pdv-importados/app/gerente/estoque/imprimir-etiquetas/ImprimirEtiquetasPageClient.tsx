'use client'

import { useState, useRef, useEffect } from 'react'
import { Printer, Search, Package, Layers } from 'lucide-react'
import { PageHeader, SectionCard } from '@/components/ui/admin-v2'
import { Button } from '@/components/ui/button'
import { Field, Input, Select } from '@/components/ui/forms'
import { useGerenteMutation } from '@/lib/hooks/useGerenteMutation'
import { EtiquetaCarrinho } from './EtiquetaCarrinho'
import { buscarProdutoPorCodigo, buscarEstoqueAtual, buscarProdutosPorCategoria } from './actions'
import { listarCategoriasProdutos } from '@/app/gerente/categorias-produtos/actions'
import type { CategoriaProdutoRow } from '@/app/gerente/categorias-produtos/categoriasProdutosTypes'
import { emitGerenteToast } from '@/lib/gerente/toast'
import { baixarPdfEtiquetas } from '@/lib/etiqueta/gerarPdf'
import { getEtiquetaConfig } from '@/lib/etiqueta/EtiquetaConfig'
import type { ItemCarrinho } from '@/lib/etiqueta/types'
import type { Idioma } from '@/idioma/normalizeIdioma'
import {
  toCarrinhoItem,
  mesclarProdutosNoCarrinho,
  type ProdutoParaEtiqueta,
} from './etiquetaCarrinhoMerge'

type Props = {
  idioma: Idioma
  initialCodigo?: string
  initialProdutoId?: string
  embeddedInAdminHub?: boolean
}

const LABELS = {
  pt: {
    titulo: 'Imprimir Etiquetas',
    busca: 'Escanear Código de Barras',
    placeholder: 'Código de barras...',
    acoesRapidas: 'Ações Rápidas',
    saldoTotal: 'Imprimir Saldo Total',
    saldoHint: 'Usar quantidade atual do estoque',
    categoria: 'Selecionar por Categoria',
    categoriaHint: 'Adicionar todos os produtos da categoria',
    carregandoCat: 'Carregando categorias…',
    semCategoria: 'Nenhuma categoria disponível',
    escolhaCat: 'Escolha a categoria',
    selecionar: '— Selecionar —',
    gerarPdf: 'Gerar PDF',
    formato: 'Informações do Formato',
    tamanho: 'Tamanho',
    maximo: 'Máximo',
    etiquetas: 'etiquetas',
    layout: 'Layout',
    erroPdf: 'Erro ao gerar PDF',
    toastSemProduto: 'Nenhum produto encontrado nesta categoria',
    toastAdicionados: (n: number) => `${n} produto(s) adicionado(s)`,
  },
  zh: {
    titulo: '打印标签',
    busca: '扫描条形码',
    placeholder: '条形码...',
    acoesRapidas: '快速操作',
    saldoTotal: '打印库存总量',
    saldoHint: '使用当前库存数量',
    categoria: '按类别选择',
    categoriaHint: '添加该类别的所有产品',
    carregandoCat: '加载类别中…',
    semCategoria: '没有可用类别',
    escolhaCat: '选择类别',
    selecionar: '— 选择 —',
    gerarPdf: '生成PDF',
    formato: '格式信息',
    tamanho: '尺寸',
    maximo: '最大数量',
    etiquetas: '标签',
    layout: 'Layout',
    erroPdf: '生成PDF时出错',
    toastSemProduto: '该类别没有产品',
    toastAdicionados: (n: number) => `已添加 ${n} 个产品`,
  },
} as const

export function ImprimirEtiquetasPageClient({
  idioma,
  initialCodigo,
  initialProdutoId,
  embeddedInAdminHub = false,
}: Props) {
  const t = LABELS[idioma]
  const [carrinho, setCarrinho] = useState<ItemCarrinho[]>([])
  const [codigoBusca, setCodigoBusca] = useState(initialCodigo?.trim() ?? '')
  const [gerandoPdf, setGerandoPdf] = useState(false)
  const [preloadDone, setPreloadDone] = useState(false)
  const [categorias, setCategorias] = useState<CategoriaProdutoRow[]>([])
  const [categoriasCarregadas, setCategoriasCarregadas] = useState(false)
  const [carregandoCategorias, setCarregandoCategorias] = useState(false)
  const [seletorCategoriaAberto, setSeletorCategoriaAberto] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const { mutate: buscarProduto, loading: buscando } = useGerenteMutation(
    buscarProdutoPorCodigo,
  )

  const { mutate: buscarEstoque, loading: buscandoEstoque } = useGerenteMutation(
    buscarEstoqueAtual,
  )

  const { mutate: buscarPorCategoria, loading: buscandoCategoria } = useGerenteMutation(
    buscarProdutosPorCategoria,
  )

  const adicionarAoCarrinho = (produto: {
    id: string
    nome: string
    codigo_barras: string | null
    preco_varejo: number
  }) => {
    setCarrinho((prev) => {
      const existente = prev.find((item) => item.produtoId === produto.id)
      if (existente) {
        return prev.map((item) =>
          item.produtoId === produto.id
            ? { ...item, quantidade: item.quantidade + 1 }
            : item,
        )
      }
      return [...prev, toCarrinhoItem(produto)]
    })
  }

  const adicionarVariosAoCarrinho = (produtos: ProdutoParaEtiqueta[]) => {
    setCarrinho((prev) => mesclarProdutosNoCarrinho(prev, produtos))
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
    if (!resultado || !resultado.success) return

    if (resultado.data.length === 0) {
      emitGerenteToast({ kind: 'info', message: t.toastSemProduto })
      return
    }

    adicionarVariosAoCarrinho(resultado.data)
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
        if (!cancelled && r.success && r.data) adicionarAoCarrinho(r.data)
      } else if (initialProdutoId?.trim()) {
        const r = await buscarEstoqueAtual([initialProdutoId.trim()])
        if (!cancelled && r.success && r.data?.[0]) adicionarAoCarrinho(r.data[0])
      }
      if (!cancelled) setPreloadDone(true)
    }

    void preload()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialCodigo, initialProdutoId, preloadDone])

  const handleAdicionarProduto = async () => {
    if (!codigoBusca.trim()) return

    const resultado = await buscarProduto(codigoBusca.trim())
    if (resultado && resultado.success && resultado.data) {
      adicionarAoCarrinho(resultado.data)
      setCodigoBusca('')
      inputRef.current?.focus()
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      void handleAdicionarProduto()
    }
  }

  const handleAtualizarQuantidade = (produtoId: string, novaQuantidade: number) => {
    setCarrinho((prev) =>
      prev.map((item) =>
        item.produtoId === produtoId
          ? { ...item, quantidade: novaQuantidade }
          : item
      )
    )
  }

  const handleRemover = (produtoId: string) => {
    setCarrinho((prev) => prev.filter((item) => item.produtoId !== produtoId))
  }

  const handleLimpar = () => {
    setCarrinho([])
    inputRef.current?.focus()
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
            quantidade: estoque ? Math.floor(estoque.quantidade_atual) : item.quantidade,
          }
        })
      )
    }
  }

  const handleGerarPdf = async () => {
    if (carrinho.length === 0) return

    setGerandoPdf(true)
    try {
      const config = getEtiquetaConfig()
      await baixarPdfEtiquetas(carrinho, {
        config,
        nomeArquivo: `etiquetas-${Date.now()}.pdf`,
      })
    } catch (e) {
      // Mantém o motivo (ex.: acima do limite por PDF, quantidade zerada) em vez de um erro genérico.
      alert(e instanceof Error && e.message ? `${t.erroPdf}: ${e.message}` : t.erroPdf)
    } finally {
      setGerandoPdf(false)
    }
  }

  const totalEtiquetas = carrinho.reduce((sum, item) => sum + item.quantidade, 0)

  return (
    <div
      className={
        embeddedInAdminHub
          ? 'mx-auto max-w-[1100px] space-y-6'
          : 'admin-v2-page mx-auto max-w-[1100px]'
      }
    >
      <PageHeader title={t.titulo} />

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-6">
          <SectionCard title={t.busca}>
            <div className="flex gap-2">
              <Field id="etiqueta-codigo" label="" className="flex-1 [&>label]:sr-only">
                <Input
                  ref={inputRef}
                  type="text"
                  value={codigoBusca}
                  onChange={(e) => setCodigoBusca(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={t.placeholder}
                  disabled={buscando}
                />
              </Field>
              <Button
                type="button"
                variant="primary"
                size="icon"
                aria-label={t.busca}
                onClick={() => void handleAdicionarProduto()}
                disabled={buscando || !codigoBusca.trim()}
                loading={buscando}
                className="mt-auto shrink-0"
              >
                <Search className="h-5 w-5" />
              </Button>
            </div>
          </SectionCard>

          <EtiquetaCarrinho
            itens={carrinho}
            onAtualizarQuantidade={handleAtualizarQuantidade}
            onRemover={handleRemover}
            onLimpar={handleLimpar}
            idioma={idioma}
          />
        </div>

        <div className="space-y-6">
          <SectionCard>
            <Button
              type="button"
              variant="success"
              className="w-full"
              onClick={() => void handleGerarPdf()}
              disabled={carrinho.length === 0 || gerandoPdf}
              loading={gerandoPdf}
            >
              <Printer className="h-5 w-5" />
              <span className="font-medium">{t.gerarPdf}</span>
              {totalEtiquetas > 0 ? (
                <span className="rounded-full bg-[var(--color-surface)]/20 px-2 py-0.5 text-caption">
                  {totalEtiquetas}
                </span>
              ) : null}
            </Button>
          </SectionCard>

          <SectionCard title={t.acoesRapidas}>
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

          <SectionCard title={t.formato} className="border-dashed">
            <div className="space-y-1 text-caption text-fg-muted">
              <p>• {t.tamanho}: 40x25mm</p>
              <p>• {t.maximo}: 500 {t.etiquetas}</p>
              <p>• {t.layout}: Dragon Standard</p>
            </div>
          </SectionCard>
        </div>
      </div>
    </div>
  )
}
