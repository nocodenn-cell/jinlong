"use client"

import { useState, useEffect, useCallback, FormEvent } from "react"
import { useCarrinhoStore } from "@/stores/carrinhoStore"
import {
  carregarRegrasPrecoCaixa,
  buscarProdutoParaCaixa,
  finalizarVendaCaixa,
  validarGerenteDesconto,
} from "@/app/caixa/actions"
import type { FinalizarVendaInput } from "@/app/caixa/finalizarVendaValidation"
import { getDeviceFingerprint } from "@/lib/security/deviceFingerprint"

const FORMAS: { value: FinalizarVendaInput["formaPagamento"]; label: string }[] = [
  { value: "DINHEIRO", label: "Dinheiro" },
  { value: "PIX", label: "PIX" },
  { value: "CARTAO_DEBITO", label: "Cartão débito" },
  { value: "CARTAO_CREDITO", label: "Cartão crédito" },
]

export default function CaixaPage() {
  const [codigo, setCodigo] = useState("")
  const [mensagem, setMensagem] = useState<string | null>(null)
  const [carregandoRegras, setCarregandoRegras] = useState(true)
  const [buscando, setBuscando] = useState(false)
  const [finalizando, setFinalizando] = useState(false)
  const [validandoGerente, setValidandoGerente] = useState(false)
  const [gerenteValidadoAte, setGerenteValidadoAte] = useState<string | null>(null)
  const [gerenteToken, setGerenteToken] = useState<string | null>(null)
  const [maxDescontoGerentePercentual, setMaxDescontoGerentePercentual] = useState<number>(0)
  const [descontoGerentePercentual, setDescontoGerentePercentual] = useState<number>(0)
  const [formaPagamento, setFormaPagamento] =
    useState<FinalizarVendaInput["formaPagamento"]>("DINHEIRO")

  const {
    itens,
    totalBruto,
    totalDesconto,
    totalLiquido,
    totalItens,
    totalUnidades,
    setRegras,
    adicionarItem,
    alterarQuantidade,
    removerItem,
    limparCarrinho,
  } = useCarrinhoStore()

  const limparEstadoDescontoGerente = useCallback(() => {
    setGerenteValidadoAte(null)
    setGerenteToken(null)
    setMaxDescontoGerentePercentual(0)
    setDescontoGerentePercentual(0)
  }, [])

  useEffect(() => {
    let cancelado = false
    ;(async () => {
      setCarregandoRegras(true)
      const res = await carregarRegrasPrecoCaixa()
      if (cancelado) return
      if (res.ok) {
        setRegras(res.regras)
        setMensagem(null)
      } else {
        setMensagem(`Regras de preço: ${res.error}`)
        setRegras([])
      }
      setCarregandoRegras(false)
    })()
    return () => {
      cancelado = true
    }
  }, [setRegras])

  const handleAdicionar = useCallback(
    async (e: FormEvent) => {
      e.preventDefault()
      const trimmed = codigo.trim()
      if (!trimmed) return

      setBuscando(true)
      setMensagem(null)

      try {
        const res = await buscarProdutoParaCaixa(trimmed)

        if (!res.ok) {
          setMensagem(res.error)
          setBuscando(false)
          return
        }

        if (res.status === "nao_encontrado") {
          setMensagem("Produto não encontrado (código ou nome).")
          setBuscando(false)
          return
        }

        if (res.status === "ambiguo") {
          setMensagem(res.mensagem)
          setBuscando(false)
          return
        }

        const p = res.produto
        const avisoEstoque =
          p.quantidade_estoque !== null && p.quantidade_estoque < 1
            ? " Atenção: estoque baixo ou zero."
            : ""

        adicionarItem({
          id: `${p.id}-${Date.now()}`,
          produtoId: p.id,
          nome: p.nome,
          quantidade: 1,
          precoVariejo: p.preco_varejo,
          categoriaId: p.categoria_id ?? undefined,
        })

        setCodigo("")
        if (avisoEstoque) {
          setMensagem(`Adicionado.${avisoEstoque}`)
        } else {
          setMensagem(null)
        }
      } catch {
        setMensagem("Falha ao buscar produto. Verifique a conexão.")
      } finally {
        setBuscando(false)
      }
    },
    [codigo, adicionarItem],
  )

  const handleAlterarQuantidade = useCallback(
    (itemId: string, quantidade: number) => {
      if (Number.isNaN(quantidade)) return
      alterarQuantidade(itemId, quantidade)
    },
    [alterarQuantidade],
  )

  const handleRemover = useCallback(
    (itemId: string) => {
      removerItem(itemId)
    },
    [removerItem],
  )

  const handleNovoCupom = useCallback(() => {
    limparCarrinho()
    setCodigo("")
    setMensagem(null)
    limparEstadoDescontoGerente()
  }, [limparCarrinho, limparEstadoDescontoGerente])

  useEffect(() => {
    if (!gerenteValidadoAte) return

    const expiraEmMs = Date.parse(gerenteValidadoAte)
    if (!Number.isFinite(expiraEmMs)) {
      limparEstadoDescontoGerente()
      return
    }

    const checkExpiracao = () => {
      if (Date.now() >= expiraEmMs) {
        limparEstadoDescontoGerente()
        setMensagem("Token de gerente expirado. Valide novamente para aplicar desconto.")
      }
    }

    checkExpiracao()
    const timer = window.setInterval(checkExpiracao, 1000)
    return () => window.clearInterval(timer)
  }, [gerenteValidadoAte, limparEstadoDescontoGerente])

  const handleFinalizar = useCallback(async () => {
    if (itens.length === 0 || finalizando) return
    if (gerenteValidadoAte && Date.now() >= Date.parse(gerenteValidadoAte)) {
      limparEstadoDescontoGerente()
      setMensagem("Token de gerente expirado. Valide novamente para aplicar desconto.")
      return
    }
    setFinalizando(true)
    setMensagem(null)
    try {
      const payload: FinalizarVendaInput = {
        formaPagamento,
        totalBruto,
        totalDesconto:
          descontoGerentePercentual > 0
            ? Math.round((totalDesconto + (totalLiquido * descontoGerentePercentual) / 100) * 100) / 100
            : totalDesconto,
        totalLiquido:
          descontoGerentePercentual > 0
            ? Math.round((totalLiquido - (totalLiquido * descontoGerentePercentual) / 100) * 100) / 100
            : totalLiquido,
        descontoGerenteToken: descontoGerentePercentual > 0 ? gerenteToken ?? undefined : undefined,
        descontoGerentePercentual:
          descontoGerentePercentual > 0 ? descontoGerentePercentual : undefined,
        itens: itens.map((i) => ({
          produtoId: i.produtoId,
          quantidade: i.quantidade,
        })),
      }
      const res = await finalizarVendaCaixa(payload)
      if (res.ok) {
        limparCarrinho()
        limparEstadoDescontoGerente()
        setMensagem(
          `Venda registrada no servidor (id ${res.vendaId.slice(0, 8)}…). Estoque atualizado.`,
        )
      } else {
        setMensagem(res.error)
      }
    } catch {
      setMensagem(
        'Falha ao finalizar. Verifique conexão e permissões (RPC transacional/estoque seguro — migrations 020 + 016/017).',
      )
    } finally {
      setFinalizando(false)
    }
  }, [
    descontoGerentePercentual,
    finalizando,
    formaPagamento,
    gerenteValidadoAte,
    gerenteToken,
    itens,
    limparEstadoDescontoGerente,
    limparCarrinho,
    totalBruto,
    totalDesconto,
    totalLiquido,
  ])

  const valorDescontoGerente =
    descontoGerentePercentual > 0
      ? Math.round(((totalLiquido * descontoGerentePercentual) / 100) * 100) / 100
      : 0
  const totalLiquidoComGerente = Math.round((totalLiquido - valorDescontoGerente) * 100) / 100

  const handleValidarGerente = useCallback(async () => {
    if (validandoGerente) return
    const senha = window.prompt("Senha do gerente para autorizar desconto:")
    if (senha === null) return
    if (!senha.trim()) {
      setMensagem("Senha do gerente é obrigatória.")
      return
    }

    setValidandoGerente(true)
    setMensagem(null)
    try {
      const res = await validarGerenteDesconto({
        senha,
        deviceFingerprint: getDeviceFingerprint(),
      })
      if (!res.ok) {
        const lockInfo = res.lockUntil ? ` (bloqueado até ${new Date(res.lockUntil).toLocaleString("pt-BR")})` : ""
        setMensagem(`Validação de gerente falhou: ${res.error}${lockInfo}`)
        return
      }
      setGerenteValidadoAte(res.expiraEm)
      setGerenteToken(res.token)
      setMaxDescontoGerentePercentual(res.maxDescontoPercentual)
      const entrada = window.prompt(
        `Percentual de desconto do gerente (máx. ${res.maxDescontoPercentual.toFixed(1)}%):`,
        "5",
      )
      const percentual = Number((entrada ?? "").replace(",", "."))
      if (!Number.isFinite(percentual) || percentual <= 0 || percentual > res.maxDescontoPercentual) {
        setMensagem("Percentual inválido para desconto de gerente.")
        setDescontoGerentePercentual(0)
        return
      }
      setDescontoGerentePercentual(Math.round(percentual * 100) / 100)
      setMensagem(
        `Gerente validado. Desconto de ${percentual.toFixed(2)}% aplicado (expira ${new Date(res.expiraEm).toLocaleTimeString("pt-BR")}).`,
      )
    } catch {
      setMensagem("Falha ao validar gerente. Verifique a conexão.")
    } finally {
      setValidandoGerente(false)
    }
  }, [validandoGerente])

  return (
    <div className="min-h-screen bg-slate-900 text-slate-50 flex flex-col">
      <header className="px-6 py-3 border-b border-slate-800 flex items-center justify-between">
        <div className="text-sm">
          <div className="font-semibold">PDV · Caixa</div>
          <div className="text-xs text-slate-400">
            {new Date().toLocaleString("pt-BR")}
          </div>
        </div>
        <div className="text-xs text-slate-400 text-right max-w-md">
          <div>F5 Dinheiro · F9 PIX · F10 Cartão (placeholder)</div>
          <div>
            Catálogo Supabase · regras em{" "}
            <code className="text-slate-500">regras_preco</code>
            {carregandoRegras ? " · carregando regras…" : ""}
          </div>
          <div className="mt-1 text-slate-300/90 border border-slate-600/40 rounded px-2 py-1 bg-slate-950/50">
            <strong>Finalizar venda</strong> usa RPC transacional{" "}
            <code className="text-slate-500">finalizar_venda_transacional</code> (migration{" "}
            <code className="text-slate-500">020</code>) com baixa por{" "}
            <code className="text-slate-500">decrementar_estoque_seguro</code> (migrations{" "}
            <code className="text-slate-500">016</code> / <code className="text-slate-500">017</code>
            ). O PDV desktop continua válido via outbox. Ver{" "}
            <code className="text-slate-500">docs/CIRCUITO_OPERACIONAL.md</code>.
          </div>
        </div>
      </header>

      <main className="flex-1 flex flex-col px-6 py-4 gap-4">
        <form onSubmit={handleAdicionar} className="flex gap-3">
          <input
            autoFocus
            value={codigo}
            onChange={(e) => setCodigo(e.target.value)}
            placeholder="Código de barras ou parte do nome do produto..."
            disabled={buscando || carregandoRegras}
            className="flex-1 rounded-md bg-slate-800 border border-slate-700 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-60"
          />
          <button
            type="submit"
            disabled={buscando || carregandoRegras}
            className="px-4 py-2 rounded-md bg-emerald-600 hover:bg-emerald-500 text-sm font-semibold disabled:opacity-50"
          >
            {buscando ? "Buscando…" : "Adicionar (Enter)"}
          </button>
          <button
            type="button"
            onClick={handleNovoCupom}
            className="px-4 py-2 rounded-md bg-slate-700 hover:bg-slate-600 text-sm"
          >
            Novo cupom
          </button>
        </form>

        {mensagem && (
          <div className="text-xs text-amber-300 mt-1">{mensagem}</div>
        )}

        <section className="flex-1 flex flex-col rounded-md border border-slate-800 bg-slate-950/60 overflow-hidden">
          <header className="grid grid-cols-[3fr,0.7fr,0.9fr,0.9fr,0.9fr] gap-2 px-3 py-2 text-xs text-slate-400 border-b border-slate-800">
            <span>Produto</span>
            <span className="text-right">Qtde</span>
            <span className="text-right">Unit.</span>
            <span className="text-right">Total</span>
            <span className="text-right">Tipo</span>
          </header>

          <div className="flex-1 overflow-auto">
            {itens.length === 0 ? (
              <div className="h-full flex items-center justify-center text-sm text-slate-500">
                Nenhum item no carrinho. Escaneie um código cadastrado em{" "}
                <span className="mx-1 font-mono text-slate-400">produtos</span> ou
                digite parte do nome (Enter).
              </div>
            ) : (
              <ul className="divide-y divide-slate-800 text-sm">
                {itens.map((item) => (
                  <li
                    key={item.id}
                    className="grid grid-cols-[3fr,0.7fr,0.9fr,0.9fr,0.9fr] gap-2 px-3 py-2 items-center"
                  >
                    <div className="flex flex-col">
                      <span className="font-medium">{item.nome}</span>
                      <span className="text-xs text-slate-500">
                        ID: {item.produtoId}
                      </span>
                    </div>

                    <div className="flex items-center justify-end gap-1">
                      <input
                        type="number"
                        min={1}
                        value={item.quantidade}
                        onChange={(e) =>
                          handleAlterarQuantidade(
                            item.id,
                            Number(e.target.value),
                          )
                        }
                        className="w-16 text-right bg-slate-800 border border-slate-700 rounded px-1 py-0.5 text-xs"
                      />
                      <button
                        type="button"
                        onClick={() => handleRemover(item.id)}
                        className="text-[11px] text-slate-500 hover:text-red-400"
                      >
                        remover
                      </button>
                    </div>

                    <div className="text-right tabular-nums">
                      R${" "}
                      {item.resultado.precoOriginal.toLocaleString("pt-BR", {
                        minimumFractionDigits: 2,
                      })}
                    </div>

                    <div className="text-right tabular-nums">
                      R${" "}
                      {(
                        item.resultado.precoUnitario * item.quantidade
                      ).toLocaleString("pt-BR", {
                        minimumFractionDigits: 2,
                      })}
                    </div>

                    <div className="text-right">
                      {item.resultado.tipoPreco === "ATACADO" && (
                        <span className="inline-flex items-center justify-end rounded-full bg-emerald-600/15 border border-emerald-500/40 px-2 py-0.5 text-[10px] font-semibold text-emerald-300">
                          ATACADO
                        </span>
                      )}
                      {item.resultado.tipoPreco === "VAREJO" && (
                        <span className="inline-flex items-center justify-end rounded-full bg-slate-700/40 border border-slate-500/40 px-2 py-0.5 text-[10px] font-semibold text-slate-200">
                          VAREJO
                        </span>
                      )}
                      {item.resultado.tipoPreco === "MANUAL" && (
                        <span className="inline-flex items-center justify-end rounded-full bg-amber-600/20 border border-amber-500/50 px-2 py-0.5 text-[10px] font-semibold text-amber-200">
                          MANUAL
                        </span>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <footer className="mt-2 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between text-sm">
          <div className="flex flex-wrap items-center gap-3">
            <label className="text-xs text-slate-400 flex items-center gap-2">
              Pagamento
              <select
                value={formaPagamento}
                onChange={(e) =>
                  setFormaPagamento(
                    e.target.value as FinalizarVendaInput["formaPagamento"],
                  )
                }
                disabled={finalizando || itens.length === 0}
                className="rounded-md bg-slate-800 border border-slate-700 px-2 py-1 text-xs text-slate-100"
              >
                {FORMAS.map((f) => (
                  <option key={f.value} value={f.value}>
                    {f.label}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              onClick={() => void handleValidarGerente()}
              disabled={validandoGerente}
              className="px-4 py-2 rounded-md bg-amber-700 hover:bg-amber-600 text-sm font-semibold disabled:opacity-50"
            >
              {validandoGerente ? "Validando gerente…" : "Validar gerente (desconto)"}
            </button>
            <button
              type="button"
              onClick={() => void handleFinalizar()}
              disabled={
                finalizando ||
                itens.length === 0 ||
                buscando ||
                carregandoRegras
              }
              className="px-4 py-2 rounded-md bg-emerald-600 hover:bg-emerald-500 text-sm font-semibold disabled:opacity-50"
            >
              {finalizando ? "Finalizando…" : "Finalizar venda"}
            </button>
            <span className="text-xs text-slate-400">
              {totalItens} itens · {totalUnidades} unidades
            </span>
            {gerenteValidadoAte && (
              <span className="text-xs text-amber-300">
                Gerente validado até {new Date(gerenteValidadoAte).toLocaleTimeString("pt-BR")} · desconto{" "}
                {descontoGerentePercentual.toFixed(2)}% (máx. {maxDescontoGerentePercentual.toFixed(2)}%)
              </span>
            )}
          </div>
          <div className="flex items-end gap-8">
            <div className="text-right text-xs text-slate-300">
              <div>Bruto</div>
              <div className="text-base font-semibold tabular-nums">
                R${" "}
                {totalBruto.toLocaleString("pt-BR", {
                  minimumFractionDigits: 2,
                })}
              </div>
            </div>
            <div className="text-right text-xs text-emerald-300">
              <div>Descontos (atacado/manual)</div>
              <div className="text-base font-semibold tabular-nums">
                - R${" "}
                {totalDesconto.toLocaleString("pt-BR", {
                  minimumFractionDigits: 2,
                })}
              </div>
            </div>
            {descontoGerentePercentual > 0 && (
              <div className="text-right text-xs text-amber-300">
                <div>Desconto gerente ({descontoGerentePercentual.toFixed(2)}%)</div>
                <div className="text-base font-semibold tabular-nums">
                  - R${" "}
                  {valorDescontoGerente.toLocaleString("pt-BR", {
                    minimumFractionDigits: 2,
                  })}
                </div>
              </div>
            )}
            <div className="text-right">
              <div className="text-xs text-slate-400">Total a pagar</div>
              <div className="text-2xl font-bold tabular-nums text-emerald-400">
                R${" "}
                {totalLiquidoComGerente.toLocaleString("pt-BR", {
                  minimumFractionDigits: 2,
                })}
              </div>
            </div>
          </div>
        </footer>
      </main>
    </div>
  )
}
