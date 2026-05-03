"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useCarrinhoStore } from "@/stores/carrinhoStore"
import { roundMoney2 } from "@/app/caixa/finalizarVendaValidation"
import type { Mensagens } from "@/i18n/getMessages"
import { CaixaCartList } from "@/app/caixa/CaixaCartList"
import { CaixaMessageBanner } from "@/components/caixa/CaixaMessageBanner"

interface Props {
  m: Mensagens
  idioma: string
  itens: Array<{
    id: string
    nome: string
    quantidade: number
    precoUnitario: number
    precoOriginal: number
  }>
  totalBruto: number
  totalDesconto: number
  totalLiquido: number
  onAlterarQuantidade: (itemId: string, quantidade: number) => void
  onRemover: (itemId: string) => void
  onAdicionarProduto: (codigo: string) => void
  buscando: boolean
  carregandoRegras: boolean
  mensagem: string | null
  msgVendaOk: string | null
  caixaAberto: boolean
  operadorNome?: string
  caixaId?: string
}

export function CaixaGridLayout({
  m,
  idioma,
  itens,
  totalBruto,
  totalDesconto,
  totalLiquido,
  onAlterarQuantidade,
  onRemover,
  onAdicionarProduto,
  buscando,
  carregandoRegras,
  mensagem,
  msgVendaOk,
  caixaAberto,
  operadorNome = "João",
  caixaId = "01",
}: Props) {
  const [codigo, setCodigo] = useState("")
  const [inputFocused, setInputFocused] = useState(false)
  const [paymentMethod, setPaymentMethod] = useState("PIX")
  const [finalizando, setFinalizando] = useState(false)
  const buscaInputRef = useRef<HTMLInputElement>(null)
  const paymentButtonsRef = useRef<HTMLDivElement>(null)

  // Auto-focus no campo de busca ao montar
  useEffect(() => {
    if (buscaInputRef.current) {
      buscaInputRef.current.focus()
    }
  }, [])

  // Estados de loading e interatividade
  const handleAdicionar = useCallback((e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = codigo.trim()
    if (!trimmed || buscando) return
    
    setFinalizando(true)
    onAdicionarProduto(trimmed)
    setCodigo("")
    setFinalizando(false)
    
    // Re-focus após adicionar
    setTimeout(() => {
      buscaInputRef.current?.focus()
    }, 100)
  }, [codigo, buscando, onAdicionarProduto])

  const handlePaymentMethod = useCallback((method: string) => {
    setPaymentMethod(method)
    // Feedback visual
    if (paymentButtonsRef.current) {
      const buttons = paymentButtonsRef.current.querySelectorAll('button')
      buttons.forEach(btn => {
        btn.classList.remove('ring-4', 'ring-brand', 'ring-opacity-50')
      })
      const selectedButton = paymentButtonsRef.current.querySelector(`[data-method="${method}"]`)
      selectedButton?.classList.add('ring-4', 'ring-brand', 'ring-opacity-50')
    }
  }, [])

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignorar se estiver em campo de input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      
      switch (e.key) {
        case 'F8':
          e.preventDefault()
          handlePaymentMethod('PIX')
          break
        case 'F9':
          e.preventDefault()
          handlePaymentMethod('CARTÃO')
          break
        case 'F10':
          e.preventDefault()
          handlePaymentMethod('DINHEIRO')
          break
        case 'F4':
          e.preventDefault()
          // Finalizar venda
          break
        case 'F6':
          e.preventDefault()
          // Fechar caixa
          break
      }
    }

    globalThis.addEventListener('keydown', handleKeyDown)
    return () => globalThis.removeEventListener('keydown', handleKeyDown)
  }, [handlePaymentMethod])

  const isLoading = carregandoRegras || finalizando

  return (
    <div className="grid grid-cols-10 h-screen overflow-hidden bg-gray-50">
      {/* ÁREA DA LISTA (70%) */}
      <section 
        className="col-span-7 flex flex-col p-6 bg-white border-r border-gray-200"
        role="main"
        aria-label="Área do carrinho de compras"
      >
        <header className="flex justify-between items-center mb-6 pb-4 border-b border-gray-200">
          <div className="flex items-center space-x-4">
            <h1 className="text-2xl font-bold text-gray-900" id="cart-title">
              {m.caixa?.titulo || "Carrinho"}
            </h1>
            {isLoading && (
              <div 
                className="animate-pulse flex items-center text-sm text-gray-500"
                role="status"
                aria-label="Carregando"
              >
                <span className="inline-block w-2 h-2 bg-blue-500 rounded-full mr-2 animate-bounce"></span>
                Carregando...
              </div>
            )}
          </div>
          <div className="flex items-center space-x-4 text-sm text-gray-600">
            <span className="flex items-center">
              <span className="font-medium">Caixa:</span>
              <span className="ml-1 font-bold text-brand" aria-label={`Caixa número ${caixaId}`}>
                {caixaId}
              </span>
            </span>
            <span className="flex items-center">
              <span className="font-medium">Operador:</span>
              <span className="ml-1 font-bold text-brand" aria-label={`Operador ${operadorNome}`}>
                {operadorNome}
              </span>
            </span>
            {!caixaAberto && (
              <span 
                className="px-3 py-2 bg-amber-100 text-amber-800 rounded-full text-sm font-medium border border-amber-200 shadow-sm"
                role="status"
                aria-label="Caixa fechado"
              >
                ⚠️ CAIXA FECHADO
              </span>
            )}
          </div>
        </header>
        
        {/* Lista de itens com bastante respiro e loading states */}
        <div className="flex-1 overflow-y-auto mb-4">
          {isLoading && itens.length === 0 ? (
            <div 
              className="flex items-center justify-center h-full"
              role="status"
              aria-label="Carregando itens"
            >
              <div className="text-center">
                <div className="inline-block w-8 h-8 border-4 border-brand border-t-transparent rounded-full animate-spin mb-4"></div>
                <p className="text-gray-500">Carregando produtos...</p>
              </div>
            </div>
          ) : itens.length === 0 ? (
            <div 
              className="flex items-center justify-center h-full text-gray-400"
              role="status"
              aria-label="Carrinho vazio"
            >
              <div className="text-center">
                <div className="text-6xl mb-4">🛒</div>
                <p className="text-lg font-medium">Carrinho vazio</p>
                <p className="text-sm mt-2">Adicione produtos usando o campo de busca abaixo</p>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <CaixaCartList
                m={m}
                idioma={idioma as any}
                itens={itens as any}
                moeda={m.caixa?.moeda_prefixo || "R$"}
                onAlterarQuantidade={onAlterarQuantidade}
                onRemover={onRemover}
              />
            </div>
          )}
        </div>

        {/* Campo de Busca GIGANTE e centralizado */}
        <div className="h-20 border-t border-gray-200 flex items-center px-4 py-3">
          <form onSubmit={handleAdicionar} className="w-full">
            <div className="relative">
              <input
                ref={buscaInputRef}
                type="text"
                value={codigo}
                onChange={(e) => setCodigo(e.target.value)}
                onFocus={() => setInputFocused(true)}
                onBlur={() => setInputFocused(false)}
                className={`
                  w-full h-12 text-xl px-4 pr-12 rounded-lg border-2 transition-all duration-200
                  ${inputFocused 
                    ? 'border-brand shadow-lg shadow-brand/20 outline-none ring-4 ring-brand/20' 
                    : 'border-gray-300 hover:border-gray-400 focus:border-brand'
                  }
                  ${buscando ? 'bg-gray-100 cursor-not-allowed' : 'bg-white'}
                `}
                placeholder="Bipe o produto ou digite o nome..."
                disabled={buscando || !caixaAberto}
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck="false"
                aria-label="Buscar produto"
                aria-describedby="search-help"
                aria-busy={buscando}
                role="searchbox"
              />
              {buscando && (
                <div 
                  className="absolute right-4 top-1/2 transform -translate-y-1/2"
                  role="status"
                  aria-label="Buscando produto"
                >
                  <div className="w-5 h-5 border-2 border-brand border-t-transparent rounded-full animate-spin"></div>
                </div>
              )}
            </div>
            <div id="search-help" className="sr-only">
              Pressione Enter para buscar produto ou use código de barras
            </div>
          </form>
        </div>
      </section>

      {/* ÁREA DE PAGAMENTO (30%) */}
      <aside 
        className="col-span-3 bg-slate-50 border-l border-gray-200 p-6 flex flex-col"
        role="complementary"
        aria-label="Área de pagamento e totais"
      >
        {/* Resumo dos valores */}
        <div className="mb-auto space-y-4">
          <h2 className="text-lg font-bold text-gray-900 mb-4" id="payment-summary">
            Resumo da Venda
          </h2>
          
          <div className="space-y-2">
            <div className="flex justify-between items-center py-2 border-b border-gray-200">
              <span className="text-gray-600 font-medium">Subtotal:</span>
              <span className="text-lg font-semibold text-gray-900" aria-label={`Subtotal R$ ${totalBruto.toFixed(2)}`}>
                {m.caixa?.moeda_prefixo || "R$"} {totalBruto.toFixed(2)}
              </span>
            </div>
            
            {totalDesconto > 0 && (
              <div className="flex justify-between items-center py-2 border-b border-gray-200">
                <span className="text-gray-600 font-medium">Descontos:</span>
                <span className="text-lg font-semibold text-red-600" aria-label={`Descontos R$ ${totalDesconto.toFixed(2)}`}>
                  -{m.caixa?.moeda_prefixo || "R$"} {totalDesconto.toFixed(2)}
                </span>
              </div>
            )}
            
            <div className="flex justify-between items-center pt-4">
              <span className="text-xl font-bold text-gray-900">Total:</span>
              <span 
                className="text-4xl font-black text-brand"
                aria-label={`Total R$ ${totalLiquido.toFixed(2)}`}
                role="status"
                aria-live="polite"
              >
                {m.caixa?.moeda_prefixo || "R$"} {totalLiquido.toFixed(2)}
              </span>
            </div>
          </div>

          {/* Informações adicionais */}
          <div className="mt-6 p-4 bg-amber-50 rounded-lg border border-amber-200">
            <h3 className="font-semibold text-amber-900 mb-3 text-base">📊 Resumo da Venda</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between items-center">
                <span className="text-amber-700 font-medium">Itens:</span>
                <span className="font-bold text-amber-900 text-base">{itens.length}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-amber-700 font-medium">Unidades:</span>
                <span className="font-bold text-amber-900 text-base">{itens.reduce((sum, item) => sum + item.quantidade, 0)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Botões de pagamento com estados inteligentes */}
        <div className="grid gap-4" ref={paymentButtonsRef}>
          {!caixaAberto && (
            <div className="col-span-full">
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-4">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">🔒</span>
                  <div className="flex-1">
                    <h4 className="font-semibold text-amber-900">Caixa Fechado</h4>
                    <p className="text-sm text-amber-700 mt-1">
                      Abra o caixa para começar a vender. Use o botão &quot;Abrir Caixa&quot; no topo da tela.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}
          
          <button
            data-method="PIX"
            onClick={() => handlePaymentMethod('PIX')}
            disabled={itens.length === 0 || !caixaAberto || finalizando}
            className={`
              app-btn-success h-24 text-xl font-bold transition-all duration-200 rounded-xl
              ${paymentMethod === 'PIX' 
                ? 'ring-4 ring-brand ring-opacity-50 transform scale-105 shadow-lg' 
                : 'hover:scale-105 hover:shadow-xl'
              }
              ${itens.length === 0 || !caixaAberto 
                ? 'opacity-50 cursor-not-allowed bg-gray-100 text-gray-400 border-gray-300' 
                : 'hover:from-green-600 active:scale-95'
              }
            `}
            aria-label="Pagamento com PIX"
            aria-describedby="pix-help"
            aria-pressed={paymentMethod === 'PIX'}
            title={!caixaAberto ? "Abra o caixa primeiro" : itens.length === 0 ? "Adicione itens ao carrinho" : "Pagamento com PIX (F8)"}
          >
            <div className="flex flex-col items-center justify-center h-full">
              <span className="text-3xl mb-2">💳</span>
              <span className="text-lg">PIX</span>
              <span className="text-xs opacity-75">(F8)</span>
              {!caixaAberto && (
                <span className="text-xs mt-1 text-amber-600">🔒 Caixa Fechado</span>
              )}
              {caixaAberto && itens.length === 0 && (
                <span className="text-xs mt-1 text-gray-500">🛒 Carrinho Vazio</span>
              )}
            </div>
          </button>
          
          <button
            data-method="CARTÃO"
            onClick={() => handlePaymentMethod('CARTÃO')}
            disabled={itens.length === 0 || !caixaAberto || finalizando}
            className={`
              app-btn-accent h-24 text-xl font-bold transition-all duration-200 rounded-xl
              ${paymentMethod === 'CARTÃO' 
                ? 'ring-4 ring-brand ring-opacity-50 transform scale-105 shadow-lg' 
                : 'hover:scale-105 hover:shadow-xl'
              }
              ${itens.length === 0 || !caixaAberto 
                ? 'opacity-50 cursor-not-allowed bg-gray-100 text-gray-400 border-gray-300' 
                : 'hover:from-blue-600 active:scale-95'
              }
            `}
            aria-label="Pagamento com cartão"
            aria-describedby="cartao-help"
            aria-pressed={paymentMethod === 'CARTÃO'}
            title={!caixaAberto ? "Abra o caixa primeiro" : itens.length === 0 ? "Adicione itens ao carrinho" : "Pagamento com cartão (F9)"}
          >
            <div className="flex flex-col items-center justify-center h-full">
              <span className="text-3xl mb-2">💳</span>
              <span className="text-lg">CARTÃO</span>
              <span className="text-xs opacity-75">(F9)</span>
              {!caixaAberto && (
                <span className="text-xs mt-1 text-amber-600">🔒 Caixa Fechado</span>
              )}
              {caixaAberto && itens.length === 0 && (
                <span className="text-xs mt-1 text-gray-500">🛒 Carrinho Vazio</span>
              )}
            </div>
          </button>
          
          <button
            data-method="DINHEIRO"
            onClick={() => handlePaymentMethod('DINHEIRO')}
            disabled={itens.length === 0 || !caixaAberto || finalizando}
            className={`
              app-btn-neutral h-20 text-lg font-bold transition-all duration-200 rounded-xl
              ${paymentMethod === 'DINHEIRO' 
                ? 'ring-4 ring-brand ring-opacity-50 transform scale-105 shadow-lg' 
                : 'hover:scale-105 hover:shadow-xl'
              }
              ${itens.length === 0 || !caixaAberto 
                ? 'opacity-50 cursor-not-allowed bg-gray-100 text-gray-400 border-gray-300' 
                : 'hover:from-gray-600 active:scale-95'
              }
            `}
            aria-label="Pagamento em dinheiro"
            aria-describedby="dinheiro-help"
            aria-pressed={paymentMethod === 'DINHEIRO'}
            title={!caixaAberto ? "Abra o caixa primeiro" : itens.length === 0 ? "Adicione itens ao carrinho" : "Pagamento em dinheiro (F10)"}
          >
            <div className="flex flex-col items-center justify-center h-full">
              <span className="text-2xl mb-1">💵</span>
              <span className="text-base">DINHEIRO</span>
              <span className="text-xs opacity-75">(F10)</span>
              {!caixaAberto && (
                <span className="text-xs mt-1 text-amber-600">🔒 Caixa Fechado</span>
              )}
              {caixaAberto && itens.length === 0 && (
                <span className="text-xs mt-1 text-gray-500">🛒 Carrinho Vazio</span>
              )}
            </div>
          </button>
        </div>

        {/* ARIA descriptions */}
        <div className="sr-only">
          <div id="pix-help">Pressione F8 para selecionar pagamento com PIX</div>
          <div id="cartao-help">Pressione F9 para selecionar pagamento com cartão</div>
          <div id="dinheiro-help">Pressione F10 para selecionar pagamento em dinheiro</div>
        </div>
      </aside>

      {/* Mensagens de status */}
      {(mensagem || msgVendaOk) && (
        <div className="fixed top-4 right-4 z-50 max-w-md">
          <CaixaMessageBanner mensagem={mensagem} msgVendaOk={msgVendaOk as any} />
        </div>
      )}
    </div>
  )
}
