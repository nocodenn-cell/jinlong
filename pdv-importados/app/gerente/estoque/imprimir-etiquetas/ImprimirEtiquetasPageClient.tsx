'use client'

import { useState, useRef, useEffect } from 'react'
import { Printer, Search, Package, Layers } from 'lucide-react'
import { GerenteFilterBar } from '@/components/gerente/GerenteFilterBar'
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
}

export function ImprimirEtiquetasPageClient({
  idioma,
  initialCodigo,
  initialProdutoId,
}: Props) {
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

  // Abre/fecha o seletor de categoria, carregando as categorias ativas na
  // primeira abertura (lazy — evita query em toda visita à tela).
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

  // Carrega todos os produtos da categoria e adiciona ao carrinho de etiquetas.
  const handleSelecionarCategoria = async (categoriaId: string) => {
    if (!categoriaId) return
    const resultado = await buscarPorCategoria(categoriaId)
    if (!resultado || !resultado.success) return

    if (resultado.data.length === 0) {
      emitGerenteToast({
        kind: 'info',
        message:
          idioma === 'zh'
            ? '该类别没有产品'
            : 'Nenhum produto encontrado nesta categoria',
      })
      return
    }

    adicionarVariosAoCarrinho(resultado.data)
    setSeletorCategoriaAberto(false)
    emitGerenteToast({
      kind: 'success',
      message:
        idioma === 'zh'
          ? `已添加 ${resultado.data.length} 个产品`
          : `${resultado.data.length} produto(s) adicionado(s)`,
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

  // Handler para Enter no input
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleAdicionarProduto()
    }
  }

  // Atualizar quantidade de um item
  const handleAtualizarQuantidade = (produtoId: string, novaQuantidade: number) => {
    setCarrinho((prev) =>
      prev.map((item) =>
        item.produtoId === produtoId
          ? { ...item, quantidade: novaQuantidade }
          : item
      )
    )
  }

  // Remover item do carrinho
  const handleRemover = (produtoId: string) => {
    setCarrinho((prev) => prev.filter((item) => item.produtoId !== produtoId))
  }

  // Limpar carrinho
  const handleLimpar = () => {
    setCarrinho([])
    inputRef.current?.focus()
  }

  // Imprimir Saldo Total (funcionalidade Dragon)
  const handleImprimirSaldoTotal = async () => {
    if (carrinho.length === 0) return

    const produtoIds = carrinho.map((item) => item.produtoId)
    const resultado = await buscarEstoque(produtoIds)

    if (resultado && resultado.success && resultado.data) {
      const estoqueAtual = resultado.data

      // Atualizar carrinho com saldo atual
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

  // Gerar PDF
  const handleGerarPdf = async () => {
    if (carrinho.length === 0) return

    setGerandoPdf(true)
    try {
      const config = getEtiquetaConfig()
      await baixarPdfEtiquetas(carrinho, {
        config,
        nomeArquivo: `etiquetas-${Date.now()}.pdf`,
      })
    } catch {
      alert(
        idioma === 'zh'
          ? '生成PDF时出错'
          : 'Erro ao gerar PDF'
      )
    } finally {
      setGerandoPdf(false)
    }
  }

  const totalEtiquetas = carrinho.reduce((sum, item) => sum + item.quantidade, 0)

  return (
    <div className="mx-auto max-w-[1100px] px-4 py-6 sm:px-6">
      <GerenteFilterBar title={idioma === 'zh' ? '打印标签' : 'Imprimir Etiquetas'} />

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Coluna Esquerda: Busca e Carrinho */}
        <div className="space-y-6">
          {/* Campo de Busca */}
          <div className="rounded-lg border bg-white p-4 shadow-sm">
            <label className="mb-2 block text-sm font-medium">
              {idioma === 'zh' ? '扫描条形码' : 'Escanear Código de Barras'}
            </label>
            <div className="flex gap-2">
              <input
                ref={inputRef}
                type="text"
                value={codigoBusca}
                onChange={(e) => setCodigoBusca(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={idioma === 'zh' ? '条形码...' : 'Código de barras...'}
                className="flex-1 rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                disabled={buscando}
              />
              <button
                type="button"
                onClick={handleAdicionarProduto}
                disabled={buscando || !codigoBusca.trim()}
                className="rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Search className="h-5 w-5" />
              </button>
            </div>
          </div>

          {/* Carrinho */}
          <EtiquetaCarrinho
            itens={carrinho}
            onAtualizarQuantidade={handleAtualizarQuantidade}
            onRemover={handleRemover}
            onLimpar={handleLimpar}
            idioma={idioma}
          />
        </div>

        {/* Coluna Direita: Ações e Diferenciais Dragon */}
        <div className="space-y-6">
          {/* Botão Gerar PDF */}
          <div className="rounded-lg border bg-white p-4 shadow-sm">
            <button
              type="button"
              onClick={handleGerarPdf}
              disabled={carrinho.length === 0 || gerandoPdf}
              className="w-full rounded-lg bg-success px-4 py-3 text-success-foreground hover:bg-success/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <div className="flex items-center justify-center gap-2">
                <Printer className="h-5 w-5" />
                <span className="font-medium">
                  {idioma === 'zh' ? '生成PDF' : 'Gerar PDF'}
                </span>
                {totalEtiquetas > 0 && (
                  <span className="rounded-full bg-white/20 px-2 py-0.5 text-xs">
                    {totalEtiquetas}
                  </span>
                )}
              </div>
            </button>
          </div>

          {/* Diferenciais Dragon */}
          <div className="rounded-lg border bg-white p-4 shadow-sm">
            <h3 className="mb-3 text-sm font-semibold">
              {idioma === 'zh' ? '快速操作' : 'Ações Rápidas'}
            </h3>
            <div className="space-y-2">
              {/* Imprimir Saldo Total */}
              <button
                type="button"
                onClick={handleImprimirSaldoTotal}
                disabled={carrinho.length === 0 || buscandoEstoque}
                className="w-full rounded-lg border px-4 py-2 text-left text-sm hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <div className="flex items-center gap-2">
                  <Package className="h-4 w-4 text-blue-600" />
                  <span>
                    {idioma === 'zh' ? '打印库存总量' : 'Imprimir Saldo Total'}
                  </span>
                </div>
                <p className="mt-1 text-xs text-gray-500">
                  {idioma === 'zh'
                    ? '使用当前库存数量'
                    : 'Usar quantidade atual do estoque'}
                </p>
              </button>

              {/* Seleção por Categoria */}
              <button
                type="button"
                onClick={handleToggleSeletorCategoria}
                disabled={buscandoCategoria}
                aria-expanded={seletorCategoriaAberto}
                className="w-full rounded-lg border px-4 py-2 text-left text-sm hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <div className="flex items-center gap-2">
                  <Layers className="h-4 w-4 text-blue-600" />
                  <span>
                    {idioma === 'zh' ? '按类别选择' : 'Selecionar por Categoria'}
                  </span>
                </div>
                <p className="mt-1 text-xs text-gray-500">
                  {idioma === 'zh'
                    ? '添加该类别的所有产品'
                    : 'Adicionar todos os produtos da categoria'}
                </p>
              </button>

              {seletorCategoriaAberto && (
                <div className="rounded-lg border bg-gray-50 p-3">
                  {carregandoCategorias ? (
                    <p className="text-xs text-gray-500">
                      {idioma === 'zh' ? '加载类别中…' : 'Carregando categorias…'}
                    </p>
                  ) : categorias.length === 0 ? (
                    <p className="text-xs text-gray-500">
                      {idioma === 'zh' ? '没有可用类别' : 'Nenhuma categoria disponível'}
                    </p>
                  ) : (
                    <label className="block">
                      <span className="mb-1 block text-xs font-medium text-gray-600">
                        {idioma === 'zh' ? '选择类别' : 'Escolha a categoria'}
                      </span>
                      <select
                        defaultValue=""
                        disabled={buscandoCategoria}
                        onChange={(e) => {
                          void handleSelecionarCategoria(e.target.value)
                          e.target.value = ''
                        }}
                        className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <option value="" disabled>
                          {idioma === 'zh' ? '— 选择 —' : '— Selecionar —'}
                        </option>
                        {categorias.map((categoria) => (
                          <option key={categoria.id} value={categoria.id}>
                            {categoria.nome}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Informações */}
          <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-4">
            <h4 className="mb-2 text-xs font-semibold text-gray-600">
              {idioma === 'zh' ? '格式信息' : 'Informações do Formato'}
            </h4>
            <div className="space-y-1 text-xs text-gray-500">
              <p>• {idioma === 'zh' ? '尺寸' : 'Tamanho'}: 40x25mm</p>
              <p>• {idioma === 'zh' ? '最大数量' : 'Máximo'}: 500 {idioma === 'zh' ? '标签' : 'etiquetas'}</p>
              <p>• {idioma === 'zh' ? '布局' : 'Layout'}: Dragon Standard</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
