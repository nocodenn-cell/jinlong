"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { QrCode, CreditCard, Coins, Clock } from "lucide-react"
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
    precoTotal: number
    observacao?: string
    produtoId: string
    resultado?: {
      tipoPreco: string
      precoUnitario: number
      precoOriginal: number
    }
  }>
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

  // Relógio atualizado a cada segundo
  const [currentTime, setCurrentTime] = useState(new Date())
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date())
    }, 1000)
    return () => clearInterval(timer)
  }, [])

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    })
  }

  return (
    <div className="flex flex-col lg:grid lg:grid-cols-10 h-screen overflow-hidden bg-background">
      {/* HEADER FIXO COM CONTEXTO (Mobile: Fixo, Desktop: Integrado) */}
      <header className="lg:hidden fixed top-0 left-0 right-0 z-50 bg-card border-b border-border p-4 shadow-sm">
        <div className="flex justify-between items-center">
          <div className="flex items-center space-x-3">
            <h1 className="text-lg font-bold text-foreground">PDV</h1>
            {!caixaAberto && (
              <span className="px-2 py-1 bg-destructive/10 text-destructive rounded-full text-xs font-medium">
                FECHADO
              </span>
            )}
          </div>
          <div className="flex items-center space-x-3 text-sm text-muted-foreground">
            <span className="flex items-center">
              <span className="font-medium">Cx:</span>
              <span className="ml-1 font-bold text-primary">{caixaId}</span>
            </span>
            <span className="flex items-center">
              <span className="font-medium">{operadorNome?.split(' ')[0]}</span>
            </span>
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Clock className="w-3 h-3" />
              <span>{formatTime(currentTime)}</span>
            </div>
          </div>
        </div>
      </header>

      {/* BUSCA FIXA NO TOPO (Mobile: Sempre visível, Desktop: Integrada) */}
      <div className="lg:hidden fixed top-16 left-0 right-0 z-40 bg-card border-b border-border p-4 shadow-sm">
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
                w-full h-12 text-lg px-4 pr-12 rounded-lg border-2 transition-all duration-200
                ${inputFocused 
                  ? 'border-primary ring-1 ring-primary bg-background' 
                  : 'border-border hover:border-primary/50 bg-background'
                }
                ${buscando ? 'bg-muted cursor-not-allowed' : 'bg-background'}
              `}
              placeholder="Buscar produto..."
              disabled={buscando || !caixaAberto}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck="false"
              aria-label="Buscar produto"
              aria-busy={buscando}
              role="searchbox"
            />
            {buscando && (
              <div className="absolute right-4 top-1/2 transform -translate-y-1/2">
                <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
              </div>
            )}
          </div>
        </form>
      </div>

      {/* ÁREA DA LISTA (Mobile: Com padding para header/busca, Desktop: Normal) */}
      <section 
        className="flex-1 lg:col-span-7 flex flex-col p-4 lg:p-6 pt-20 lg:pt-6 bg-card lg:border-r lg:border-border order-2 lg:order-1"
        role="main"
        aria-label="Área do carrinho de compras"
      >
        {/* Header Desktop (mantém original) */}
        <header className="hidden lg:flex justify-between items-center mb-6 pb-4 border-b border-border">
          <div className="flex items-center space-x-4">
            <h1 className="text-2xl font-bold text-foreground" id="cart-title">
              {m.caixa?.titulo || "Carrinho"}
            </h1>
            {isLoading && (
              <div 
                className="animate-pulse flex items-center text-sm text-muted-foreground"
                role="status"
                aria-label="Carregando"
              >
                <span className="inline-block w-2 h-2 bg-primary rounded-full mr-2 animate-bounce"></span>
                Carregando...
              </div>
            )}
          </div>
          <div className="flex items-center space-x-4 text-sm text-muted-foreground">
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

        {/* Busca Desktop (mantém original) */}
        <div className="hidden lg:block h-16 lg:h-20 border-t border-border flex items-center px-3 lg:px-4 py-2 lg:py-3 bg-muted/30">
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
                  w-full h-10 lg:h-12 text-lg lg:text-xl px-3 lg:px-4 pr-12 rounded-lg border-2 transition-all duration-200
                  ${inputFocused 
                    ? 'border-primary ring-1 ring-primary bg-background' 
                    : 'border-border hover:border-primary/50 bg-background'
                  }
                  ${buscando ? 'bg-muted cursor-not-allowed' : 'bg-background'}
                `}
                placeholder="Buscar produto..."
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
                  <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
                </div>
              )}
            </div>
            <div id="search-help" className="sr-only">
              Pressione Enter para buscar produto ou use código de barras
            </div>
          </form>
        </div>
        
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
                idioma={idioma}
                itens={itens}
                moeda={m.caixa?.moeda_prefixo || "R$"}
                onAlterarQuantidade={onAlterarQuantidade}
                onRemover={onRemover}
              />
            </div>
          )}
        </div>

        {/* Campo de Busca - Mobile otimizado com tema */}
        <div className="h-16 lg:h-20 border-t border-border flex items-center px-3 lg:px-4 py-2 lg:py-3 bg-muted/30">
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
                  w-full h-10 lg:h-12 text-lg lg:text-xl px-3 lg:px-4 pr-12 rounded-lg border-2 transition-all duration-200
                  ${inputFocused 
                    ? 'border-primary ring-1 ring-primary bg-background' 
                    : 'border-border hover:border-primary/50 bg-background'
                  }
                  ${buscando ? 'bg-muted cursor-not-allowed' : 'bg-background'}
                `}
                placeholder="Buscar produto..."
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

      {/* ÁREA DE PAGAMENTO (Mobile: Bottom Sheet Compacto, Desktop: Normal) */}
      <aside 
        className="lg:col-span-3 bg-card lg:border-l lg:border-border p-3 lg:p-6 flex flex-col order-1 lg:order-2 lg:h-auto h-auto fixed bottom-0 left-0 right-0 lg:relative lg:bottom-auto lg:left-auto lg:right-auto z-50 lg:z-auto border-t lg:border-t-0 border-border"
        role="complementary"
        aria-label="Área de pagamento e totais"
      >
        {/* Resumo dos valores - Mobile compacto, Desktop normal */}
        <div className="mb-auto space-y-2 lg:space-y-4">
          {/* Header: Mobile oculto, Desktop visível */}
          <h2 className="hidden lg:block text-lg font-bold text-foreground mb-4" id="payment-summary">
            Resumo da Venda
          </h2>
          
          {/* Mobile: Total compacto sempre visível */}
          <div className="lg:hidden flex justify-between items-center py-2 border-b border-border">
            <div>
              <span className="text-sm text-muted-foreground">Total</span>
              <div className="text-2xl font-black text-primary">
                {m.caixa?.moeda_prefixo || "R$"} {totalLiquido.toFixed(2)}
              </div>
            </div>
            <div className="text-right text-xs text-muted-foreground">
              <div>{itens.length} itens</div>
              <div>{itens.reduce((sum, item) => sum + item.quantidade, 0)} unids</div>
            </div>
          </div>
          
          {/* Desktop: Resumo simplificado - apenas Total */}
          <div className="hidden lg:block space-y-2">
            {/* Split de pagamento simplificado com ícones */}
            {paymentMethod && (
              <div className="flex items-center justify-center py-3 px-4 bg-muted/30 rounded-lg border border-border">
                <div className="flex items-center gap-4 text-sm">
                  <div className="flex items-center gap-2">
                    {paymentMethod === 'PIX' && <QrCode className="w-4 h-4 text-primary" />}
                    {paymentMethod === 'CARTÃO' && <CreditCard className="w-4 h-4 text-secondary" />}
                    {paymentMethod === 'DINHEIRO' && <Coins className="w-4 h-4 text-muted-foreground" />}
                    <span className="font-medium text-foreground capitalize">{paymentMethod.toLowerCase()}</span>
                  </div>
                  <span className="text-muted-foreground">:</span>
                  <span className="font-bold text-foreground tabular-nums">
                    {m.caixa?.moeda_prefixo || "R$"} {totalLiquido.toFixed(2)}
                  </span>
                </div>
              </div>
            )}
            
            {/* Total destacado */}
            <div className="flex justify-between items-center pt-2">
              <span className="text-xl font-bold text-foreground">Total:</span>
              <span 
                className="text-4xl font-black text-primary"
                aria-label={`Total R$ ${totalLiquido.toFixed(2)}`}
                role="status"
                aria-live="polite"
              >
                {m.caixa?.moeda_prefixo || "R$"} {totalLiquido.toFixed(2)}
              </span>
            </div>
            
            {/* Informação de desconto em tooltip (se houver) */}
            {totalDesconto > 0 && (
              <div className="flex items-center justify-center pt-2">
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <span>Desconto aplicado:</span>
                  <span className="font-medium text-destructive">
                    -{m.caixa?.moeda_prefixo || "R$"} {totalDesconto.toFixed(2)}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Informações adicionais - Desktop apenas */}
          <div className="hidden lg:block mt-6 p-4 bg-muted/30 rounded-lg border border-border">
            <h3 className="font-semibold text-foreground mb-3 text-base">📊 Resumo da Venda</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground font-medium">Itens:</span>
                <span className="font-bold text-foreground text-base">{itens.length}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground font-medium">Unidades:</span>
                <span className="font-bold text-foreground text-base">{itens.reduce((sum, item) => sum + item.quantidade, 0)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Botões de pagamento - Mobile compactos, Desktop normais */}
        <div className="grid grid-cols-3 lg:grid-cols-1 gap-2 lg:gap-4" ref={paymentButtonsRef}>
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
              bg-primary hover:bg-primary/90 text-primary-foreground h-12 lg:h-24 text-sm lg:text-lg font-bold transition-all duration-200 rounded-lg lg:rounded-xl touch-manipulation shadow-sm
              ${paymentMethod === 'PIX' 
                ? 'ring-2 ring-primary/50 transform scale-105 shadow-lg' 
                : 'hover:scale-105 hover:shadow-md'
              }
              ${itens.length === 0 || !caixaAberto 
                ? 'opacity-50 cursor-not-allowed bg-muted text-muted-foreground border-border' 
                : 'active:scale-95'
              }
            `}
            aria-label="Pagamento com PIX"
            aria-describedby="pix-help"
            aria-pressed={paymentMethod === 'PIX'}
            title={!caixaAberto ? "Abra o caixa primeiro" : itens.length === 0 ? "Adicione itens ao carrinho" : "Pagamento com PIX (F8)"}
          >
            <div className="flex flex-col items-center justify-center h-full gap-0 lg:gap-1">
              <QrCode className="w-4 h-4 lg:w-8 lg:h-8" />
              <span className="text-xs lg:text-base">PIX</span>
              <span className="hidden lg:block text-xs opacity-75">(F8)</span>
            </div>
          </button>
          
          <button
            data-method="CARTÃO"
            onClick={() => handlePaymentMethod('CARTÃO')}
            disabled={itens.length === 0 || !caixaAberto || finalizando}
            className={`
              bg-secondary hover:bg-secondary/90 text-secondary-foreground h-12 lg:h-24 text-sm lg:text-lg font-bold transition-all duration-200 rounded-lg lg:rounded-xl touch-manipulation shadow-sm
              ${paymentMethod === 'CARTÃO' 
                ? 'ring-2 ring-secondary/50 transform scale-105 shadow-lg' 
                : 'hover:scale-105 hover:shadow-md'
              }
              ${itens.length === 0 || !caixaAberto 
                ? 'opacity-50 cursor-not-allowed bg-muted text-muted-foreground border-border' 
                : 'active:scale-95'
              }
            `}
            aria-label="Pagamento com cartão"
            aria-describedby="cartao-help"
            aria-pressed={paymentMethod === 'CARTÃO'}
            title={!caixaAberto ? "Abra o caixa primeiro" : itens.length === 0 ? "Adicione itens ao carrinho" : "Pagamento com cartão (F9)"}
          >
            <div className="flex flex-col items-center justify-center h-full gap-0 lg:gap-1">
              <CreditCard className="w-4 h-4 lg:w-8 lg:h-8" />
              <span className="text-xs lg:text-base">CARTÃO</span>
              <span className="hidden lg:block text-xs opacity-75">(F9)</span>
            </div>
          </button>
          
          <button
            data-method="DINHEIRO"
            onClick={() => handlePaymentMethod('DINHEIRO')}
            disabled={itens.length === 0 || !caixaAberto || finalizando}
            className={`
              bg-muted hover:bg-muted/90 text-muted-foreground border border-border h-12 lg:h-20 text-sm lg:text-lg font-bold transition-all duration-200 rounded-lg lg:rounded-xl touch-manipulation shadow-sm
              ${paymentMethod === 'DINHEIRO' 
                ? 'ring-2 ring-border transform scale-105 shadow-lg' 
                : 'hover:scale-105 hover:shadow-md'
              }
              ${itens.length === 0 || !caixaAberto 
                ? 'opacity-50 cursor-not-allowed bg-muted/50 text-muted-foreground/50' 
                : 'active:scale-95'
              }
            `}
            aria-label="Pagamento em dinheiro"
            aria-describedby="dinheiro-help"
            aria-pressed={paymentMethod === 'DINHEIRO'}
            title={!caixaAberto ? "Abra o caixa primeiro" : itens.length === 0 ? "Adicione itens ao carrinho" : "Pagamento em dinheiro (F10)"}
          >
            <div className="flex flex-col items-center justify-center h-full gap-0 lg:gap-1">
              <Coins className="w-4 h-4 lg:w-7 lg:h-7" />
              <span className="text-xs lg:text-base">DINHEIRO</span>
              <span className="hidden lg:block text-xs opacity-75">(F10)</span>
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
          <CaixaMessageBanner mensagem={mensagem} msgVendaOk={!!msgVendaOk} />
        </div>
      )}
    </div>
  )
}
