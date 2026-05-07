'use client'

import { useState, useRef, useEffect } from 'react'
import { Printer, Search, Package, Layers } from 'lucide-react'
import { GerenteFilterBar } from '@/components/gerente/GerenteFilterBar'
import { useGerenteMutation } from '@/lib/hooks/useGerenteMutation'
import { EtiquetaCarrinho } from './EtiquetaCarrinho'
import { buscarProdutoPorCodigo, buscarEstoqueAtual } from './actions'
import { baixarPdfEtiquetas } from '@/lib/etiqueta/gerarPdf'
import { getEtiquetaConfig } from '@/lib/etiqueta/EtiquetaConfig'
import type { ItemCarrinho } from '@/lib/etiqueta/types'
import type { Idioma } from '@/idioma/normalizeIdioma'
import { getMessages } from '@/i18n/getMessages'

type Props = {
  idioma: Idioma
}

export function ImprimirEtiquetasPageClient({ idioma }: Props) {
  const m = getMessages(idioma)
  const [carrinho, setCarrinho] = useState<ItemCarrinho[]>([])
  const [codigoBusca, setCodigoBusca] = useState('')
  const [gerandoPdf, setGerandoPdf] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // Auto-focus no input ao montar
  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  // Mutation para buscar produto por código
  const { mutate: buscarProduto, loading: buscando } = useGerenteMutation(
    buscarProdutoPorCodigo,
    { successMessage: m.comum.sucesso }
  )

  // Mutation para buscar estoque atual (para "Imprimir Saldo Total")
  const { mutate: buscarEstoque, loading: buscandoEstoque } = useGerenteMutation(
    buscarEstoqueAtual,
    { successMessage: m.comum.sucesso }
  )

  // Adicionar produto ao carrinho
  const handleAdicionarProduto = async () => {
    if (!codigoBusca.trim()) return

    const resultado = await buscarProduto(codigoBusca.trim())
    if (resultado && resultado.success && resultado.data) {
      const produto = resultado.data
      
      // Verificar se já existe no carrinho
      const existente = carrinho.find((item) => item.produtoId === produto.id)
      if (existente) {
        // Incrementar quantidade
        setCarrinho((prev) =>
          prev.map((item) =>
            item.produtoId === produto.id
              ? { ...item, quantidade: item.quantidade + 1 }
              : item
          )
        )
      } else {
        // Adicionar novo item
        setCarrinho((prev) => [
          ...prev,
          {
            produtoId: produto.id,
            nome: produto.nome,
            codigoBarras: produto.codigo_barras || '',
            precoVarejo: produto.preco_varejo,
            quantidade: 1,
          },
        ])
      }

      // Limpar input e manter focus
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
              className="w-full rounded-lg bg-green-600 px-4 py-3 text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
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

              {/* Seleção por Categoria (placeholder para futuro) */}
              <button
                type="button"
                disabled
                className="w-full rounded-lg border px-4 py-2 text-left text-sm text-gray-400 disabled:cursor-not-allowed"
              >
                <div className="flex items-center gap-2">
                  <Layers className="h-4 w-4" />
                  <span>
                    {idioma === 'zh' ? '按类别选择' : 'Selecionar por Categoria'}
                  </span>
                </div>
                <p className="mt-1 text-xs text-gray-400">
                  {idioma === 'zh' ? '即将推出' : 'Em breve'}
                </p>
              </button>
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
