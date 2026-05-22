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

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  // Sem successMessage — toast só no PDF
  const { mutate: buscarProduto, loading: buscando } = useGerenteMutation(
    buscarProdutoPorCodigo,
    {}
  )

  const { mutate: buscarEstoque, loading: buscandoEstoque } = useGerenteMutation(
    buscarEstoqueAtual,
    {}
  )

  const handleAdicionarProduto = async () => {
    if (!codigoBusca.trim()) return

    const resultado = await buscarProduto(codigoBusca.trim())
    if (resultado && resultado.success && resultado.data) {
      const produto = resultado.data

      const existente = carrinho.find((item) => item.produtoId === produto.id)
      if (existente) {
        setCarrinho((prev) =>
          prev.map((item) =>
            item.produtoId === produto.id
              ? { ...item, quantidade: item.quantidade + 1 }
              : item
          )
        )
      } else {
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

      setCodigoBusca('')
      inputRef.current?.focus()
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleAdicionarProduto()
    }
  }

  const handleAtualizarQuantidade = (produtoId: string, novaQuantidade: number) => {
    setCarrinho((prev) =>
      prev.map((item) =>
        item.produtoId === produtoId ? { ...item, quantidade: novaQuantidade } : item
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
        idioma,
        nomeArquivo: `etiquetas-${Date.now()}.pdf`,
      })
    } catch {
      alert(m.estoque.etiquetas.erro_gerar_pdf)
    } finally {
      setGerandoPdf(false)
    }
  }

  const totalEtiquetas = carrinho.reduce((sum, item) => sum + item.quantidade, 0)

  return (
    <div className="mx-auto max-w-[1100px] px-4 py-6 sm:px-6">
      <GerenteFilterBar title={m.estoque.etiquetas.titulo} />

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Coluna Esquerda: Busca e Carrinho */}
        <div className="space-y-6">
          {/* Campo de Busca */}
          <div className="rounded-lg border border-jl-border-1 bg-jl-surface-elev p-4">
            <label className="mb-2 block text-sm font-medium text-jl-fg-1">
              {m.estoque.etiquetas.titulo}
            </label>
            <div className="flex gap-2">
              <input
                ref={inputRef}
                type="text"
                value={codigoBusca}
                onChange={(e) => setCodigoBusca(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={m.estoque.etiquetas.buscar_placeholder}
                className="flex-1 rounded-lg border border-jl-border-1 bg-jl-surface-soft px-3 py-2 text-sm text-foreground placeholder:text-jl-fg-3 focus:outline-none focus:ring-2 focus:ring-jl-accent"
                disabled={buscando}
              />
              <button
                type="button"
                onClick={handleAdicionarProduto}
                disabled={buscando || !codigoBusca.trim()}
                className="app-btn-accent rounded-lg px-4 py-2 disabled:cursor-not-allowed disabled:opacity-50"
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
            m={m.estoque.etiquetas}
          />
        </div>

        {/* Coluna Direita: Ações */}
        <div className="space-y-6">
          {/* Botão Gerar PDF */}
          <div className="rounded-lg border border-jl-border-1 bg-jl-surface-elev p-4">
            <button
              type="button"
              onClick={handleGerarPdf}
              disabled={carrinho.length === 0 || gerandoPdf}
              className="w-full rounded-lg bg-success px-4 py-3 text-success-foreground hover:bg-success/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <div className="flex items-center justify-center gap-2">
                <Printer className="h-5 w-5" />
                <span className="font-medium">
                  {gerandoPdf ? `${m.estoque.etiquetas.gerar_pdf}…` : m.estoque.etiquetas.gerar_pdf}
                </span>
                {totalEtiquetas > 0 && (
                  <span className="rounded-full bg-white/20 px-2 py-0.5 text-xs">
                    {totalEtiquetas}
                  </span>
                )}
              </div>
            </button>
          </div>

          {/* Ações Rápidas */}
          <div className="rounded-lg border border-jl-border-1 bg-jl-surface-elev p-4">
            <h3 className="mb-3 text-sm font-semibold text-jl-fg-1">
              {m.estoque.etiquetas.acoes_rapidas}
            </h3>
            <div className="space-y-2">
              {/* Imprimir Saldo Total */}
              <button
                type="button"
                onClick={handleImprimirSaldoTotal}
                disabled={carrinho.length === 0 || buscandoEstoque}
                className="w-full rounded-lg border border-jl-border-1 bg-jl-surface-soft px-4 py-2 text-left text-sm hover:bg-jl-surface-elev disabled:cursor-not-allowed disabled:opacity-50"
              >
                <div className="flex items-center gap-2">
                  <Package className="h-4 w-4 text-jl-accent" />
                  <span className="text-jl-fg-1">{m.estoque.etiquetas.imprimir_saldo}</span>
                </div>
                <p className="mt-1 text-xs text-jl-fg-3">
                  {m.estoque.etiquetas.imprimir_saldo_desc}
                </p>
              </button>

              {/* Seleção por Categoria (em breve) */}
              <button
                type="button"
                disabled
                className="w-full rounded-lg border border-jl-border-1 px-4 py-2 text-left text-sm text-jl-fg-3 disabled:cursor-not-allowed"
              >
                <div className="flex items-center gap-2">
                  <Layers className="h-4 w-4" />
                  <span>{m.estoque.etiquetas.selecionar_categoria}</span>
                </div>
                <p className="mt-1 text-xs text-jl-fg-3/60">
                  {m.estoque.etiquetas.em_breve}
                </p>
              </button>
            </div>
          </div>

          {/* Informações do Formato */}
          <div className="rounded-lg border border-dashed border-jl-border-1 bg-jl-surface-soft p-4">
            <h4 className="mb-2 text-xs font-semibold text-jl-fg-2">
              {m.estoque.etiquetas.formato_info}
            </h4>
            <div className="space-y-1 text-xs text-jl-fg-3">
              <p>• {m.estoque.etiquetas.tamanho}: 40x25mm</p>
              <p>• {m.estoque.etiquetas.maximo}: 500 {m.estoque.etiquetas.titulo.toLowerCase()}</p>
              <p>• {m.estoque.etiquetas.layout}: Dragon Standard</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
